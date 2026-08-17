import { compareUrls } from './server/src/compare.js';
import { FetchError } from './server/src/fetchPage.js';

const CORS_HEADERS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET,POST,OPTIONS',
  'access-control-allow-headers': 'content-type',
  'access-control-max-age': '86400',
  'content-type': 'application/json; charset=utf-8'
};

export const handler = async (event = {}) => {
  const method = String(event.httpMethod || event.requestContext?.http?.method || 'GET').toUpperCase();

  if (method === 'OPTIONS') return response(204, null);

  if (method === 'GET') {
    return response(200, {
      ok: true,
      service: 'specly-parser-yandex',
      version: '0.3.0-universal',
      stores: [
        'dns-shop.ru',
        'mvideo.ru',
        'ozon.ru',
        'market.yandex.ru',
        'wildberries.ru',
        'citilink.ru',
        'megamarket.ru',
        'vseinstrumenti.ru',
        'eldorado.ru',
        'aliexpress.ru'
      ]
    });
  }

  if (method !== 'POST') {
    return response(405, { error: { code: 'METHOD_NOT_ALLOWED', message: 'Метод не поддерживается' } });
  }

  try {
    const body = parseBody(event);
    const result = await compareUrls(body.urls);
    return response(200, result);
  } catch (error) {
    const status = statusFor(error);
    return response(status, {
      error: {
        code: error.code || 'INTERNAL_ERROR',
        message: status >= 500 ? safeServerMessage(error) : error.message,
        ...(error.details ? { details: error.details } : {})
      }
    });
  }
};

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

function statusFor(error) {
  if (error instanceof FetchError) {
    if (['INVALID_URL', 'UNSUPPORTED_PROTOCOL', 'UNSUPPORTED_STORE'].includes(error.code)) return 400;
    return 502;
  }
  if (['INVALID_REQUEST', 'SAME_URLS', 'DNS_CATALOG_URL', 'PAYLOAD_TOO_LARGE', 'INVALID_JSON'].includes(error.code)) return 400;
  if (error.code === 'PRODUCT_PARSE_FAILED') return 422;
  return 500;
}

function safeServerMessage(error) {
  if (error instanceof FetchError || error.code === 'PRODUCT_PARSE_FAILED') return error.message;
  return 'Внутренняя ошибка парсера';
}
