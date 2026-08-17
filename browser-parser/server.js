import express from 'express';
import { chromium } from 'playwright';
import { htmlToLines } from '../server/src/html.js';
import { parseCommonProduct } from '../server/src/adapters/common.js';
import { buildComparison, buildSummary } from '../server/src/normalizer.js';

const PORT = Number(process.env.PORT || 8080);
const NAV_TIMEOUT = Number(process.env.NAV_TIMEOUT_MS || 25000);
const SUPPORTED_HOSTS = new Set([
  'dns-shop.ru', 'www.dns-shop.ru',
  'mvideo.ru', 'www.mvideo.ru'
]);

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
      channel: 'chromium',
      args: ['--disable-dev-shm-usage']
    }).catch((error) => {
      browserPromise = undefined;
      throw error;
    });
  }
  return browserPromise;
}

app.get('/', (_req, res) => {
  res.json({ ok: true, service: 'specly-browser-parser', version: '0.1.0' });
});

app.post('/', async (req, res) => {
  try {
    const urls = req.body?.urls;
    if (!Array.isArray(urls) || urls.length !== 2) {
      return res.status(400).json({ error: { code: 'INVALID_REQUEST', message: 'Нужно передать ровно две ссылки' } });
    }
    if (urls[0] === urls[1]) {
      return res.status(400).json({ error: { code: 'SAME_URLS', message: 'Для сравнения нужны две разные ссылки' } });
    }

    const browser = await getBrowser();
    const products = await Promise.all(urls.map((url) => parseProduct(browser, url)));
    const comparison = buildComparison(products[0], products[1]);

    if (!comparison.length) {
      return res.status(422).json({ error: { code: 'PRODUCT_PARSE_FAILED', message: 'Не удалось извлечь сопоставимые характеристики' } });
    }

    return res.json({
      category: 'gpu',
      products,
      comparison,
      summary: buildSummary(comparison)
    });
  } catch (error) {
    const status = error?.status || 502;
    return res.status(status).json({
      error: {
        code: error?.code || 'BROWSER_PARSE_FAILED',
        message: error?.message || 'Не удалось прочитать страницу магазина',
        ...(error?.details ? { details: error.details } : {})
      }
    });
  }
});

async function parseProduct(browser, value) {
  const url = validateUrl(value);
  const context = await browser.newContext({
    locale: 'ru-RU',
    timezoneId: 'Europe/Moscow',
    viewport: { width: 1365, height: 900 },
    userAgent: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36'
  });

  try {
    await context.route('**/*', async (route) => {
      const type = route.request().resourceType();
      if (type === 'image' || type === 'media' || type === 'font') return route.abort();
      return route.continue();
    });

    if (url.hostname.endsWith('dns-shop.ru')) return await parseDns(context, url);
    return await parseMvideo(context, url);
  } finally {
    await context.close().catch(() => {});
  }
}

async function parseDns(context, url) {
  const page = await context.newPage();

  if (url.pathname.startsWith('/catalog/')) {
    await loadPublicPage(page, url.href, 'DNS');
    const candidates = await page.locator('a[href*="/product/"]').evaluateAll((links) => {
      const result = [];
      const seen = new Set();
      for (const link of links) {
        if (result.length >= 6) break;
        const href = link.href;
        const title = (link.textContent || '').replace(/\s+/g, ' ').trim();
        if (!href || !/\/product\/(?!characteristics\/)/i.test(href) || !/видеокарт/i.test(title) || seen.has(href)) continue;
        seen.add(href);
        result.push({ title, url: href });
      }
      return result;
    });
    const error = new Error('Ссылка DNS ведёт на каталог, а не на конкретный товар');
    error.code = 'DNS_CATALOG_URL';
    error.status = 400;
    error.details = { candidates };
    throw error;
  }

  const main = await loadPublicPage(page, url.href, 'DNS');
  const characteristicsUrl = toDnsCharacteristicsUrl(main.finalUrl);
  let extraLines = [];

  if (characteristicsUrl !== main.finalUrl) {
    try {
      const full = await loadPublicPage(page, characteristicsUrl, 'DNS');
      extraLines = htmlToLines(full.html);
    } catch (error) {
      // Основная карточка всё ещё может содержать достаточно характеристик.
      if (error?.code !== 'UPSTREAM_BLOCKED') throw error;
    }
  }

  return parseCommonProduct({
    html: main.html,
    url: main.finalUrl,
    store: 'DNS',
    extraLines
  });
}

async function parseMvideo(context, url) {
  const page = await context.newPage();
  const loaded = await loadPublicPage(page, url.href, 'М.Видео');
  return parseCommonProduct({ html: loaded.html, url: loaded.finalUrl, store: 'М.Видео' });
}

async function loadPublicPage(page, targetUrl, store) {
  let response = await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: NAV_TIMEOUT });
  await page.waitForTimeout(2500);
  await page.waitForLoadState('networkidle', { timeout: 4000 }).catch(() => {});

  // Если защита выставила cookie через JavaScript, один обычный reload позволяет
  // браузеру повторить публичный запрос уже с полученным состоянием.
  let text = await bodyText(page);
  if (looksBlocked(text, await page.title()) && [401, 403, 429].includes(response?.status())) {
    response = await page.reload({ waitUntil: 'domcontentloaded', timeout: NAV_TIMEOUT }).catch(() => response);
    await page.waitForTimeout(2000);
    text = await bodyText(page);
  }

  const finalUrl = page.url();
  const final = validateUrl(finalUrl);
  if (!SUPPORTED_HOSTS.has(final.hostname.toLowerCase())) {
    const error = new Error(`${store}: неожиданное перенаправление на ${final.hostname}`);
    error.code = 'BAD_REDIRECT';
    error.details = { host: final.hostname, url: finalUrl };
    throw error;
  }

  if (looksBlocked(text, await page.title())) {
    const error = new Error(`${final.hostname} не пропустил серверный Chromium`);
    error.code = 'UPSTREAM_BLOCKED';
    error.details = { host: final.hostname, status: response?.status() ?? null, url: finalUrl };
    throw error;
  }

  const html = await page.content();
  if (!html || html.length < 500) {
    const error = new Error(`${store}: получена пустая страница`);
    error.code = 'EMPTY_PAGE';
    error.details = { host: final.hostname, url: finalUrl };
    throw error;
  }

  return { html, finalUrl };
}

function validateUrl(value) {
  let url;
  try { url = new URL(value); }
  catch {
    const error = new Error('Некорректная ссылка на товар');
    error.code = 'INVALID_URL';
    error.status = 400;
    throw error;
  }

  if (url.protocol !== 'https:') {
    const error = new Error('Поддерживаются только HTTPS-ссылки');
    error.code = 'UNSUPPORTED_PROTOCOL';
    error.status = 400;
    throw error;
  }
  if (!SUPPORTED_HOSTS.has(url.hostname.toLowerCase())) {
    const error = new Error(`Магазин ${url.hostname} пока не поддерживается`);
    error.code = 'UNSUPPORTED_STORE';
    error.status = 400;
    error.details = { host: url.hostname };
    throw error;
  }
  url.hash = '';
  return url;
}

function toDnsCharacteristicsUrl(value) {
  const url = new URL(value);
  const match = url.pathname.match(/^\/product\/(?!characteristics\/)(.+)$/);
  if (!match) return value;
  url.pathname = `/product/characteristics/${match[1]}`;
  return url.href;
}

async function bodyText(page) {
  return page.locator('body').innerText({ timeout: 3000 }).catch(() => '');
}

function looksBlocked(text, title = '') {
  const sample = `${title}\n${text}`.slice(0, 12000);
  return /(?:access denied|forbidden|unauthorized|qrator|провер(?:ка|яем) браузер|доступ ограничен|доступ запрещен|captcha|robot check)/i.test(sample)
    && !/(?:характеристики|видеокарта|каталог товаров)/i.test(sample);
}

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Specly browser parser listening on ${PORT}`);
});
