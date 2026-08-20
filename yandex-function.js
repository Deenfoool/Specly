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

export const handler = async (event = {}) => {
  const method = String(event.httpMethod || event.requestContext?.http?.method || 'GET').toUpperCase();

  if (method === 'OPTIONS') return response(204, null);

  if (method === 'GET') {
    return response(200, getDiagnostics({ service: 'specly-parser-yandex', chromiumAvailable: false }));
  }

  if (method !== 'POST') {
    return response(405, { error: { code: 'METHOD_NOT_ALLOWED', message: 'Метод не поддерживается' } });
  }

  try {
    const body = parseBody(event);
    const result = await compareUrls(body.urls);
    return response(200, result);
  } catch (error) {
    const payload = errorPayload(error);
    return response(payload.status, payload.body);
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
