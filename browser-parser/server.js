import express from 'express';
import { chromium } from 'playwright';
import { compareUrls } from '../server/src/compare.js';
import { getDiagnostics } from '../server/src/diagnostics.js';
import { errorPayload } from '../server/src/http.js';
import { FetchError, validateProductUrl, validateRedirect } from '../server/src/fetchPage.js';

const PORT = Number(process.env.PORT || 8080);
const NAV_TIMEOUT = Number(process.env.NAV_TIMEOUT_MS || 25_000);
const READY_TIMEOUT = Number(process.env.READY_TIMEOUT_MS || 7_000);
const BLOCK_HEAVY_RESOURCES = process.env.BLOCK_HEAVY_RESOURCES === 'true';
const CHROMIUM_EXECUTABLE_PATH = String(process.env.CHROMIUM_EXECUTABLE_PATH || '').trim();

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '32kb' }));
app.use((req, res, next) => {
  res.setHeader('access-control-allow-origin', '*');
  res.setHeader('access-control-allow-methods', 'GET,POST,OPTIONS');
  res.setHeader('access-control-allow-headers', 'content-type');
  res.setHeader('cache-control', 'no-store');
  if (req.method === 'OPTIONS') return res.status(204).end();
  next();
});

let browserPromise;
function getBrowser() {
  if (!browserPromise) {
    browserPromise = chromium.launch({
      headless: true,
      ...(CHROMIUM_EXECUTABLE_PATH ? { executablePath: CHROMIUM_EXECUTABLE_PATH } : {}),
      args: [
        '--disable-blink-features=AutomationControlled',
        '--disable-dev-shm-usage',
        '--no-sandbox'
      ]
    }).catch((error) => {
      browserPromise = undefined;
      const wrapped = new Error('Chromium недоступен в текущем контейнере');
      wrapped.code = 'CHROMIUM_UNAVAILABLE';
      wrapped.details = { reason: String(error?.message || 'launch failed').split('\n')[0].slice(0, 180) };
      throw wrapped;
    });
  }
  return browserPromise;
}

app.get(['/', '/health', '/api/health'], async (_req, res) => {
  let chromiumAvailable = false;
  try {
    chromiumAvailable = Boolean(await getBrowser());
  } catch (error) {
    log({ event: 'chromium-health-failed', message: error?.message });
  }
  res.json(getDiagnostics({ service: 'specly-browser-parser', chromiumAvailable }));
});

app.post(['/', '/api/compare'], async (req, res) => {
  let context;
  try {
    const urls = req.body?.urls;
    validateRequest(urls);

    const browser = await getBrowser();
    const chromeVersion = String(browser.version() || '').replace(/^Chromium\s*/i, '').trim();
    const userAgent = process.env.BROWSER_USER_AGENT
      || `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${chromeVersion || '131.0.0.0'} Safari/537.36`;

    context = await browser.newContext({
      locale: 'ru-RU',
      timezoneId: 'Europe/Moscow',
      viewport: { width: 1920, height: 1080 },
      screen: { width: 1920, height: 1080 },
      userAgent,
      javaScriptEnabled: true,
      ignoreHTTPSErrors: true,
      colorScheme: 'light',
      extraHTTPHeaders: {
        'accept-language': 'ru-RU,ru;q=0.9,en-US;q=0.7,en;q=0.6'
      }
    });

    await context.addInitScript(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
      Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3, 4, 5] });
    });

    if (BLOCK_HEAVY_RESOURCES) {
      await context.route('**/*', async (route) => {
        const type = route.request().resourceType();
        if (type === 'media' || type === 'font') return route.abort();
        return route.continue();
      });
    }

    const browserFetcher = createBrowserFetcher(context);
    const result = await compareUrls(urls, { browserFetcher, logger: log });
    return res.status(200).json(result);
  } catch (error) {
    const payload = errorPayload(error);
    log({ event: 'compare-failed', code: error?.code, message: error?.message });
    return res.status(payload.status).json(payload.body);
  } finally {
    await context?.close().catch(() => {});
  }
});

export function createBrowserFetcher(context) {
  const sessionPages = new Map();

  return async (targetUrl, { store, sessionKey = null } = {}) => {
    const requested = validateProductUrl(targetUrl);
    const reusable = Boolean(sessionKey);
    const page = reusable
      ? await getSessionPage(context, sessionPages, sessionKey)
      : await context.newPage();

    try {
      const previousUrl = reusable && page.url() !== 'about:blank' ? page.url() : null;
      const navigationOptions = {
        waitUntil: 'domcontentloaded',
        timeout: NAV_TIMEOUT,
        ...(previousUrl ? { referer: previousUrl } : {})
      };
      const response = await page.goto(requested.href, navigationOptions);
      await waitForProductSignals(page, store, requested);
      await page.waitForLoadState('networkidle', { timeout: 2_500 }).catch(() => {});

      const finalUrl = page.url();
      validateRedirect(requested.href, finalUrl);
      const text = await page.locator('body').innerText({ timeout: 3_000 }).catch(() => '');
      const title = await page.title().catch(() => '');

      if (looksBlocked(text, title, finalUrl)) {
        throw new FetchError('UPSTREAM_BLOCKED', `${store?.name || requested.hostname}: Chromium получил антибот-страницу`, {
          host: new URL(finalUrl).hostname,
          status: response?.status() ?? null
        });
      }

      const html = await page.content();
      if (!html || html.length < 400) {
        throw new FetchError('EMPTY_PAGE', `${store?.name || requested.hostname}: Chromium получил пустую страницу`, {
          host: requested.hostname,
          status: response?.status() ?? null
        });
      }

      return {
        html,
        finalUrl,
        via: 'browser',
        status: response?.status() ?? null,
        sessionReused: Boolean(previousUrl)
      };
    } catch (error) {
      if (error?.code) throw error;
      throw new FetchError(error?.name === 'TimeoutError' ? 'UPSTREAM_TIMEOUT' : 'BROWSER_PARSE_FAILED',
        error?.name === 'TimeoutError' ? `${store?.name || requested.hostname}: таймаут Chromium` : `${store?.name || requested.hostname}: Chromium не смог загрузить страницу`,
        { host: requested.hostname });
    } finally {
      if (!reusable) await page.close().catch(() => {});
    }
  };
}

async function getSessionPage(context, sessionPages, sessionKey) {
  const existing = sessionPages.get(sessionKey);
  if (existing && !existing.isClosed()) return existing;
  const page = await context.newPage();
  sessionPages.set(sessionKey, page);
  return page;
}

async function waitForProductSignals(page, store, requested) {
  if (store?.id === 'ozon') {
    // Ozon renders product data dynamically. Wait for the product shell first,
    // then give the dedicated price widget a short independent window to appear.
    await page.locator('h1, script[type="application/ld+json"], meta[property="og:title"]')
      .first()
      .waitFor({ state: 'attached', timeout: READY_TIMEOUT })
      .catch(() => {});
    await page.locator('[data-widget="webPrice"], [data-widget="price"], [data-widget*="webPrice"]')
      .first()
      .waitFor({ state: 'attached', timeout: Math.min(READY_TIMEOUT, 5_000) })
      .catch(() => {});
    await page.waitForTimeout(800).catch(() => {});
    return;
  }

  const selectors = [];

  if (store?.id === 'dns' && requested.pathname.startsWith('/product/characteristics/')) {
    selectors.push('[class*="product-characteristics"]', '[class*="characteristics__spec"]');
  }

  selectors.push('h1', 'script[type="application/ld+json"]', '#__NEXT_DATA__', 'meta[property="og:title"]');
  await page.locator(selectors.join(', '))
    .first()
    .waitFor({ state: 'attached', timeout: READY_TIMEOUT })
    .catch(() => {});
}

function looksBlocked(text, title, url) {
  const sample = `${title}\n${text}`.slice(0, 16_000);
  if (/\/showcaptcha(?:[/?]|$)/i.test(url)) return true;
  return /(?:access to resource was blocked|access denied|подтвердите, что запросы отправляли вы, а не робот|имеем дело именно с вами, а не с ботом|ваше поведение похоже на поведение автоматизированных систем|captcha|checking your browser|verify you are human)/i.test(sample)
    && !/(?:характеристики|код товара|в корзину|цена|смартфон|ноутбук|телевизор|холодильник)/i.test(sample);
}

function validateRequest(urls) {
  if (!Array.isArray(urls) || urls.length !== 2) {
    const error = new Error('Нужно передать ровно две ссылки');
    error.code = 'INVALID_REQUEST';
    throw error;
  }
  if (urls[0] === urls[1]) {
    const error = new Error('Для сравнения нужны две разные ссылки');
    error.code = 'SAME_URLS';
    throw error;
  }
}

function log(entry) {
  const safe = {
    time: new Date().toISOString(),
    service: 'specly-browser-parser',
    ...entry
  };
  delete safe.url;
  console.log(JSON.stringify(safe));
}

const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`Specly browser parser listening on ${PORT}`);
});

async function shutdown() {
  server.close();
  const browser = await browserPromise?.catch(() => null);
  await browser?.close().catch(() => {});
}

process.once('SIGTERM', shutdown);
process.once('SIGINT', shutdown);
