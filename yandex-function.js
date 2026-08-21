import { compareUrls } from './server/src/compare.js';
import { getDiagnostics } from './server/src/diagnostics.js';
import { errorPayload } from './server/src/http.js';

const CORS_HEADERS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET,POST,OPTIONS',
  'access-control-allow-headers': 'content-type',
  'access-control-max-age': '86400',
  'content-type': 'application/json; charset=utf-8'
};

const BROWSER_PROXY_TIMEOUT_MS = Number(process.env.BROWSER_PARSER_TIMEOUT_MS || 60_000);

export const handler = async (event = {}) => {
  const method = String(event.httpMethod || event.requestContext?.http?.method || 'GET').toUpperCase();

  if (method === 'OPTIONS') return response(204, null);

  if (method === 'GET') {
    return response(200, {
      ...getDiagnostics({ service: 'specly-parser-yandex', chromiumAvailable: false }),
      browserProxyConfigured: Boolean(getBrowserParserEndpoint())
    });
  }

  if (method !== 'POST') {
    return response(405, { error: { code: 'METHOD_NOT_ALLOWED', message: 'Метод не поддерживается' } });
  }

  try {
    const body = parseBody(event);
    const endpoint = getBrowserParserEndpoint();
    const result = endpoint
      ? await compareViaBrowserParser(endpoint, body.urls)
      : await compareUrls(body.urls);
    return response(200, result);
  } catch (error) {
    const payload = errorPayload(error);
    return response(payload.status, payload.body);
  }
};

async function compareViaBrowserParser(endpoint, urls) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), BROWSER_PROXY_TIMEOUT_MS);

  try {
    const url = new URL('/api/compare', ensureTrailingSlash(endpoint));
    const upstream = await fetch(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json'
      },
      body: JSON.stringify({ urls }),
      signal: controller.signal
    });

    const payload = await upstream.json().catch(() => null);
    if (!upstream.ok) {
      const error = new Error(payload?.error?.message || `Chromium parser вернул HTTP ${upstream.status}`);
      error.code = payload?.error?.code || 'BROWSER_PROXY_ERROR';
      error.details = {
        ...(payload?.error?.details || {}),
        upstreamStatus: upstream.status
      };
      throw error;
    }

    if (!payload || typeof payload !== 'object') {
      const error = new Error('Chromium parser вернул некорректный ответ');
      error.code = 'BROWSER_PROXY_ERROR';
      throw error;
    }

    return payload;
  } catch (error) {
    if (error?.code) throw error;
    const wrapped = new Error(error?.name === 'AbortError'
      ? 'Таймаут Chromium parser'
      : 'Не удалось обратиться к Chromium parser');
    wrapped.code = error?.name === 'AbortError' ? 'BROWSER_PROXY_TIMEOUT' : 'BROWSER_PROXY_UNAVAILABLE';
    wrapped.details = { reason: String(error?.message || 'upstream unavailable').slice(0, 180) };
    throw wrapped;
  } finally {
    clearTimeout(timer);
  }
}

function getBrowserParserEndpoint() {
  const raw = String(process.env.BROWSER_PARSER_ENDPOINT || '').trim();
  if (!raw) return null;
  try {
    const url = new URL(raw);
    if (url.protocol !== 'https:') return null;
    return url.href;
  } catch {
    return null;
  }
}

function ensureTrailingSlash(value) {
  return value.endsWith('/') ? value : `${value}/`;
}

function parseBody(event) {
  if (event.body == null || event.body === '') return {};
  if (typeof event.body === 'object') return event.body;

  let raw = String(event.body);
  if (event.isBase64Encoded) raw = Buffer.from(raw, 'base64').toString('utf8');

  try {
    return JSON.parse(raw || '{}');
  } catch {
    const error = new Error('Некорректный JSON');
    error.code = 'INVALID_JSON';
    throw error;
  }
}

function response(statusCode, payload) {
  return {
    statusCode,
    headers: CORS_HEADERS,
    body: payload == null ? '' : JSON.stringify(payload)
  };
}
