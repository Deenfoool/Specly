const MAX_BYTES = 3_000_000;
const TIMEOUT_MS = 12_000;
const MAX_REDIRECTS = 3;

const SUPPORTED_HOSTS = new Set([
  'dns-shop.ru', 'www.dns-shop.ru',
  'mvideo.ru', 'www.mvideo.ru'
]);

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

  if (url.protocol !== 'https:') throw new FetchError('UNSUPPORTED_PROTOCOL', 'Поддерживаются только HTTPS-ссылки');
  if (!SUPPORTED_HOSTS.has(url.hostname.toLowerCase())) {
    throw new FetchError('UNSUPPORTED_STORE', `Магазин ${url.hostname} пока не поддерживается`, { host: url.hostname });
  }
  url.hash = '';
  return url;
}

export async function fetchHtml(value) {
  return fetchHtmlWithRedirects(validateProductUrl(value), 0);
}

async function fetchHtmlWithRedirects(url, depth) {
  if (depth > MAX_REDIRECTS) throw new FetchError('TOO_MANY_REDIRECTS', 'Слишком много перенаправлений');

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  let response;
  try {
    response = await fetch(url, {
      redirect: 'manual',
      signal: controller.signal,
      headers: {
        'user-agent': 'Mozilla/5.0 (compatible; Specly/0.1; +https://github.com/Deenfoool/Specly)',
        'accept': 'text/html,application/xhtml+xml',
        'accept-language': 'ru-RU,ru;q=0.9,en;q=0.6',
        'cache-control': 'no-cache'
      }
    });
  } catch (error) {
    if (error?.name === 'AbortError') throw new FetchError('UPSTREAM_TIMEOUT', 'Магазин слишком долго отвечает');
    throw new FetchError('UPSTREAM_UNAVAILABLE', 'Не удалось загрузить страницу магазина');
  } finally { clearTimeout(timer); }

  if ([301, 302, 303, 307, 308].includes(response.status)) {
    const location = response.headers.get('location');
    if (!location) throw new FetchError('BAD_REDIRECT', 'Магазин вернул некорректное перенаправление');
    const redirected = new URL(location, url);
    validateProductUrl(redirected.href);
    return fetchHtmlWithRedirects(redirected, depth + 1);
  }

  if (!response.ok) throw new FetchError('UPSTREAM_HTTP_ERROR', `Магазин вернул HTTP ${response.status}`, { status: response.status });
  const contentType = response.headers.get('content-type') ?? '';
  if (!contentType.includes('text/html') && !contentType.includes('application/xhtml+xml')) {
    throw new FetchError('UNEXPECTED_CONTENT_TYPE', 'По ссылке получена не HTML-страница', { contentType });
  }

  const reader = response.body?.getReader();
  if (!reader) return { html: await response.text(), finalUrl: url.href };
  const chunks = [];
  let total = 0;
  while (true) {
    const { value: chunk, done } = await reader.read();
    if (done) break;
    total += chunk.byteLength;
    if (total > MAX_BYTES) {
      await reader.cancel();
      throw new FetchError('PAGE_TOO_LARGE', 'Страница магазина слишком большая для обработки');
    }
    chunks.push(chunk);
  }

  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return { html: new TextDecoder().decode(bytes), finalUrl: url.href };
}
