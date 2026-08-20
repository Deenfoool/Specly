import { findStoreByHost, findStoreByUrl } from './stores.js';

const MAX_BYTES = 3_000_000;
const TIMEOUT_MS = 12_000;
const READER_TIMEOUT_MS = 20_000;
const MAX_REDIRECTS = 3;

export class FetchError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = 'FetchError';
    this.code = code;
    this.details = details;
  }
}

export function validateProductUrl(value) {
  let url;
  try { url = new URL(value); }
  catch { throw new FetchError('INVALID_URL', 'Некорректная ссылка на товар'); }

  if (url.protocol !== 'https:') {
    throw new FetchError('UNSUPPORTED_PROTOCOL', 'Поддерживаются только HTTPS-ссылки');
  }

  const store = findStoreByHost(url.hostname);
  if (!store) {
    throw new FetchError('UNSUPPORTED_STORE', `Магазин ${url.hostname} пока не поддерживается`, { host: url.hostname });
  }

  url.username = '';
  url.password = '';
  url.hash = '';
  return url;
}

export function validateRedirect(fromValue, toValue) {
  const from = validateProductUrl(fromValue);
  const to = validateProductUrl(toValue);
  const fromStore = findStoreByUrl(from);
  const toStore = findStoreByUrl(to);
  if (!fromStore || !toStore || fromStore.id !== toStore.id) {
    throw new FetchError('BAD_REDIRECT', `Магазин перенаправил запрос на неподдерживаемый хост ${to.hostname}`, {
      host: to.hostname,
      fromStore: fromStore?.id || null,
      toStore: toStore?.id || null
    });
  }
  return to;
}

export async function fetchHtml(value, options = {}) {
  const url = validateProductUrl(value);
  const store = findStoreByUrl(url);
  const attempts = [];
  const strategies = store.fetchStrategies.filter((strategy) => strategy !== 'official-api');

  for (const strategy of strategies) {
    if (strategy === 'direct' && options.allowDirect === false) continue;
    if (strategy === 'browser' && typeof options.browserFetcher !== 'function') continue;
    if (strategy === 'reader' && options.allowReader === false) continue;

    try {
      logAttempt(options.logger, { store: store.id, strategy, url: url.href, event: 'attempt' });
      const result = strategy === 'direct'
        ? await (typeof options.directFetcher === 'function' ? options.directFetcher(url.href, { store }) : fetchDirect(url, options))
        : strategy === 'browser'
          ? await options.browserFetcher(url.href, { store })
          : await fetchViaReader(url, options);

      const finalUrl = validateRedirect(url.href, result.finalUrl || url.href).href;
      const html = String(result.html || '');
      if (!html.trim()) throw new FetchError('EMPTY_PAGE', `${store.name}: получена пустая страница`, { host: url.hostname });
      if (looksLikeBlockedHtml(html, result.finalUrl || url.href)) {
        throw new FetchError('UPSTREAM_BLOCKED', `${store.name}: источник вернул антибот-страницу`, {
          host: url.hostname,
          status: result.status ?? null
        });
      }
      if (!looksLikeProductDocument(html, result.finalUrl || url.href)) {
        throw new FetchError('PRODUCT_NOT_FOUND', `${store.name}: источник вернул оболочку сайта без карточки товара`, {
          host: url.hostname,
          status: result.status ?? null
        });
      }
      if (new TextEncoder().encode(html).byteLength > MAX_BYTES) {
        throw new FetchError('PAGE_TOO_LARGE', 'Страница магазина слишком большая для обработки', { host: url.hostname });
      }

      logAttempt(options.logger, { store: store.id, strategy, status: result.status ?? null, event: 'success' });
      return {
        html,
        finalUrl,
        via: result.via || strategy,
        status: result.status ?? null,
        attempts: [...attempts, { strategy, ok: true, status: result.status ?? null }]
      };
    } catch (error) {
      const attempt = safeAttempt(strategy, error);
      attempts.push(attempt);
      logAttempt(options.logger, { store: store.id, strategy, event: 'failed', ...attempt });
      if (['INVALID_URL', 'UNSUPPORTED_PROTOCOL', 'UNSUPPORTED_STORE', 'BAD_REDIRECT'].includes(error?.code)) throw error;
    }
  }

  const last = attempts.at(-1) || {};
  throw new FetchError(
    attempts.some((attempt) => attempt.code === 'EMPTY_PAGE') ? 'EMPTY_PAGE' : 'UPSTREAM_BLOCKED',
    `${store.name}: доступные способы получения страницы не сработали`,
    { host: url.hostname, url: url.href, attempts, finalReason: last.code || 'NO_STRATEGY' }
  );
}

async function fetchDirect(url, options) {
  return fetchDirectWithRedirects(url, url, 0, options);
}

async function fetchDirectWithRedirects(originalUrl, url, depth, options) {
  if (depth > MAX_REDIRECTS) throw new FetchError('TOO_MANY_REDIRECTS', 'Слишком много перенаправлений');

  let response;
  try {
    response = await request(url, Number(options.directTimeoutMs || TIMEOUT_MS), {
      redirect: 'manual',
      headers: {
        'user-agent': process.env.DIRECT_FETCH_USER_AGENT || 'Specly/0.4 (+https://github.com/Deenfoool/Specly)',
        accept: 'text/html,application/xhtml+xml',
        'accept-language': 'ru-RU,ru;q=0.9,en;q=0.6',
        'cache-control': 'no-cache'
      }
    });
  } catch (error) {
    throw new FetchError(error?.name === 'AbortError' ? 'UPSTREAM_TIMEOUT' : 'UPSTREAM_NETWORK_ERROR',
      error?.name === 'AbortError' ? 'Таймаут магазина' : 'Сетевая ошибка при обращении к магазину',
      { host: url.hostname });
  }

  if ([301, 302, 303, 307, 308].includes(response.status)) {
    const location = response.headers.get('location');
    if (!location) throw new FetchError('BAD_REDIRECT', 'Магазин вернул некорректное перенаправление');
    const redirected = validateRedirect(originalUrl.href, new URL(location, url).href);
    return fetchDirectWithRedirects(originalUrl, redirected, depth + 1, options);
  }

  if (!response.ok) {
    throw new FetchError([401, 403, 429].includes(response.status) ? 'UPSTREAM_BLOCKED' : 'UPSTREAM_HTTP_ERROR',
      `Магазин вернул HTTP ${response.status}`,
      { status: response.status, host: url.hostname });
  }

  const contentType = response.headers.get('content-type') || '';
  if (!contentType.includes('text/html') && !contentType.includes('application/xhtml+xml')) {
    throw new FetchError('UNEXPECTED_CONTENT_TYPE', 'По ссылке получена не HTML-страница', {
      contentType: contentType.slice(0, 120), host: url.hostname
    });
  }

  return {
    html: await readLimitedText(response, MAX_BYTES, 'Страница магазина слишком большая для обработки'),
    finalUrl: url.href,
    via: 'direct',
    status: response.status
  };
}

async function fetchViaReader(url, options = {}) {
  const readerUrl = `https://r.jina.ai/${url.href}`;
  const headers = {
    accept: 'text/plain, text/markdown;q=0.9, */*;q=0.5',
    'user-agent': 'Specly/0.4 (+https://github.com/Deenfoool/Specly)'
  };
  if (process.env.JINA_API_KEY) headers.authorization = `Bearer ${process.env.JINA_API_KEY}`;

  let response;
  try {
    response = await request(readerUrl, Number(options.readerTimeoutMs || READER_TIMEOUT_MS), { headers });
  } catch (error) {
    throw new FetchError(error?.name === 'AbortError' ? 'READER_TIMEOUT' : 'READER_UNAVAILABLE',
      error?.name === 'AbortError' ? 'Таймаут резервного reader-источника' : 'Reader-источник недоступен',
      { host: url.hostname });
  }

  if (!response.ok) {
    throw new FetchError('READER_UNAVAILABLE', `Reader-источник вернул HTTP ${response.status}`, {
      status: response.status, host: url.hostname
    });
  }

  return {
    html: await readLimitedText(response, MAX_BYTES, 'Ответ reader-источника слишком большой'),
    finalUrl: url.href,
    via: 'reader',
    status: response.status
  };
}

async function request(url, timeoutMs, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function readLimitedText(response, maxBytes, tooLargeMessage) {
  const reader = response.body?.getReader();
  if (!reader) {
    const text = await response.text();
    if (new TextEncoder().encode(text).byteLength > maxBytes) throw new FetchError('PAGE_TOO_LARGE', tooLargeMessage);
    return text;
  }

  const chunks = [];
  let total = 0;
  while (true) {
    const { value: chunk, done } = await reader.read();
    if (done) break;
    total += chunk.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      throw new FetchError('PAGE_TOO_LARGE', tooLargeMessage);
    }
    chunks.push(chunk);
  }

  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(bytes);
}

function safeAttempt(strategy, error) {
  return {
    strategy,
    ok: false,
    code: error?.code || 'UNKNOWN_FETCH_ERROR',
    status: Number.isInteger(error?.details?.status) ? error.details.status : null,
    reason: String(error?.message || 'unknown').slice(0, 180)
  };
}

function logAttempt(logger, entry) {
  if (typeof logger !== 'function') return;
  try { logger(entry); } catch { /* Diagnostics must never break parsing. */ }
}

function looksLikeBlockedHtml(html, finalUrl) {
  if (/\/showcaptcha(?:[/?]|$)/i.test(String(finalUrl))) return true;
  const sample = String(html).slice(0, 250_000);
  return /(?:access to resource was blocked|access denied|подтвердите, что запросы отправляли вы, а не робот|имеем дело именно с вами, а не с ботом|поведение похоже на поведение автоматизированных систем|verify you are human|checking your browser)/i.test(sample)
    && !/(?:<h1[^>]*>[^<]*(?:смартфон|ноутбук|телевизор|холодильник|видеокарта)|"@type"\s*:\s*"Product")/i.test(sample);
}

function looksLikeProductDocument(html, finalUrl) {
  const sample = String(html).slice(0, 600_000);
  if (/"@type"\s*:\s*"Product"/i.test(sample)) return true;
  if (/<h1\b[^>]*>[\s\S]{3,350}<\/h1>/i.test(sample)) return true;
  if (/^Title:\s*(?:смартфон|ноутбук|видеокарта|процессор|монитор|телевизор|холодильник|стиральная|пылесос|наушники|ssd)\b/im.test(sample)) return true;

  let url;
  try { url = new URL(finalUrl); } catch { return false; }
  const ids = url.pathname.match(/\d{5,}/g) || [];
  const hasTargetId = ids.some((id) => sample.includes(id));
  const metaProduct = /<meta[^>]+(?:name|property)=["'](?:description|og:title)["'][^>]+content=["'][^"']*(?:смартфон|ноутбук|видеокарт|процессор|монитор|телевизор|холодильник|стиральн|пылесос|наушник|ssd)/i.test(sample)
    || /<title[^>]*>[^<]*(?:смартфон|ноутбук|видеокарт|процессор|монитор|телевизор|холодильник|стиральн|пылесос|наушник|ssd)/i.test(sample);
  return hasTargetId && metaProduct;
}
