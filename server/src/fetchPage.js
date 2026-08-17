const MAX_BYTES = 3_000_000;
const TIMEOUT_MS = 12_000;
const READER_TIMEOUT_MS = 20_000;
const MAX_REDIRECTS = 3;
const READER_FALLBACK_STATUSES = new Set([401, 403, 429]);

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

  let response;
  try {
    response = await request(url, TIMEOUT_MS, {
      redirect: 'manual',
      headers: {
        'user-agent': 'Mozilla/5.0 (compatible; Specly/0.2; +https://github.com/Deenfoool/Specly)',
        'accept': 'text/html,application/xhtml+xml',
        'accept-language': 'ru-RU,ru;q=0.9,en;q=0.6',
        'cache-control': 'no-cache'
      }
    });
  } catch (error) {
    if (error?.name === 'AbortError') {
      return fetchViaReader(url, { directError: 'timeout' });
    }
    return fetchViaReader(url, { directError: 'network' });
  }

  if ([301, 302, 303, 307, 308].includes(response.status)) {
    const location = response.headers.get('location');
    if (!location) throw new FetchError('BAD_REDIRECT', 'Магазин вернул некорректное перенаправление');
    const redirected = new URL(location, url);
    validateProductUrl(redirected.href);
    return fetchHtmlWithRedirects(redirected, depth + 1);
  }

  if (!response.ok) {
    if (READER_FALLBACK_STATUSES.has(response.status)) {
      return fetchViaReader(url, { directStatus: response.status });
    }
    throw new FetchError(
      'UPSTREAM_HTTP_ERROR',
      `Магазин вернул HTTP ${response.status}`,
      { status: response.status, host: url.hostname, url: url.href }
    );
  }

  const contentType = response.headers.get('content-type') ?? '';
  if (!contentType.includes('text/html') && !contentType.includes('application/xhtml+xml')) {
    throw new FetchError('UNEXPECTED_CONTENT_TYPE', 'По ссылке получена не HTML-страница', {
      contentType,
      host: url.hostname,
      url: url.href
    });
  }

  return {
    html: await readLimitedText(response, MAX_BYTES, 'Страница магазина слишком большая для обработки'),
    finalUrl: url.href,
    via: 'direct'
  };
}

async function fetchViaReader(url, directDetails = {}) {
  // Jina Reader работает только с публично доступными URL и здесь используется
  // как резервный способ чтения страницы, если магазин режет дата-центровый IP Vercel.
  const readerUrl = `https://r.jina.ai/${url.href}`;
  const headers = {
    'accept': 'text/plain, text/markdown;q=0.9, */*;q=0.5',
    'user-agent': 'Specly/0.2 (+https://github.com/Deenfoool/Specly)'
  };

  if (process.env.JINA_API_KEY) {
    headers.authorization = `Bearer ${process.env.JINA_API_KEY}`;
  }

  let response;
  try {
    response = await request(readerUrl, READER_TIMEOUT_MS, { headers });
  } catch (error) {
    const reason = error?.name === 'AbortError' ? 'таймаут резервного источника' : 'резервный источник недоступен';
    throw new FetchError('UPSTREAM_BLOCKED', `Магазин блокирует серверный доступ; ${reason}`, {
      host: url.hostname,
      url: url.href,
      ...directDetails
    });
  }

  if (!response.ok) {
    throw new FetchError('UPSTREAM_BLOCKED', 'Магазин блокирует серверный доступ, резервный источник тоже не смог прочитать страницу', {
      host: url.hostname,
      url: url.href,
      readerStatus: response.status,
      ...directDetails
    });
  }

  const text = await readLimitedText(response, MAX_BYTES, 'Ответ резервного источника слишком большой');
  if (!text.trim()) {
    throw new FetchError('UPSTREAM_BLOCKED', 'Резервный источник вернул пустую страницу', {
      host: url.hostname,
      url: url.href,
      ...directDetails
    });
  }

  return { html: text, finalUrl: url.href, via: 'reader' };
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
    if (new TextEncoder().encode(text).byteLength > maxBytes) {
      throw new FetchError('PAGE_TOO_LARGE', tooLargeMessage);
    }
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
