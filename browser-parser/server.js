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
      args: ['--disable-dev-shm-usage']
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
    context = await browser.newContext({
      locale: 'ru-RU',
      timezoneId: 'Europe/Moscow',
      viewport: { width: 1365, height: 900 }
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
  return async (targetUrl, { store } = {}) => {
    const requested = validateProductUrl(targetUrl);
    const page = await context.newPage();
    try {
      const response = await page.goto(requested.href, { waitUntil: 'domcontentloaded', timeout: NAV_TIMEOUT });
      await waitForProductSignals(page);
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
        status: response?.status() ?? null
      };
    } catch (error) {
      if (error?.code) throw error;
      throw new FetchError(error?.name === 'TimeoutError' ? 'UPSTREAM_TIMEOUT' : 'BROWSER_PARSE_FAILED',
        error?.name === 'TimeoutError' ? `${store?.name || requested.hostname}: таймаут Chromium` : `${store?.name || requested.hostname}: Chromium не смог загрузить страницу`,
        { host: requested.hostname });
    } finally {
      await page.close().catch(() => {});
    }
  };
}

async function waitForProductSignals(page) {
  await page.locator('h1, script[type="application/ld+json"], #__NEXT_DATA__, meta[property="og:title"]')
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
