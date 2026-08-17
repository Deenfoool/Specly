import { compareUrls } from '../server/src/compare.js';
import { FetchError } from '../server/src/fetchPage.js';

export default async function handler(req, res) {
  applyCors(req, res);

  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') {
    return res.status(405).json({ error: { code: 'METHOD_NOT_ALLOWED', message: 'Метод не поддерживается' } });
  }

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    const result = await compareUrls(body.urls);
    res.setHeader('cache-control', 'no-store');
    return res.status(200).json(result);
  } catch (error) {
    const status = statusFor(error);
    return res.status(status).json({
      error: {
        code: error.code || 'INTERNAL_ERROR',
        message: status >= 500 ? safeServerMessage(error) : error.message,
        ...(error.details ? { details: error.details } : {})
      }
    });
  }
}

function applyCors(req, res) {
  const configured = String(process.env.ALLOWED_ORIGINS || '*')
    .split(',').map((value) => value.trim()).filter(Boolean);
  const origin = req.headers.origin;
  if (configured.includes('*')) res.setHeader('access-control-allow-origin', '*');
  else if (origin && configured.includes(origin)) {
    res.setHeader('access-control-allow-origin', origin);
    res.setHeader('vary', 'Origin');
  }
  res.setHeader('access-control-allow-methods', 'POST,OPTIONS');
  res.setHeader('access-control-allow-headers', 'content-type');
  res.setHeader('access-control-max-age', '86400');
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
