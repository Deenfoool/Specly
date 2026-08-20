import { FetchError } from './fetchPage.js';

export function statusForError(error) {
  if (error?.code === 'CHROMIUM_UNAVAILABLE') return 503;
  if (error instanceof FetchError) {
    if (['INVALID_URL', 'UNSUPPORTED_PROTOCOL', 'UNSUPPORTED_STORE', 'BAD_REDIRECT'].includes(error.code)) return 400;
    return 502;
  }
  if (['INVALID_REQUEST', 'SAME_URLS', 'DNS_CATALOG_URL', 'PAYLOAD_TOO_LARGE', 'INVALID_JSON', 'YANDEX_MARKET_API_NOT_CONFIGURED'].includes(error?.code)) return 400;
  if (['PRODUCT_NOT_FOUND', 'PRODUCT_PARSE_FAILED'].includes(error?.code)) return 422;
  if (error?.code === 'YANDEX_MARKET_API_ERROR') return 502;
  return 500;
}

export function errorPayload(error) {
  const status = statusForError(error);
  const canExpose = error instanceof FetchError
    || status < 500
    || ['PRODUCT_PARSE_FAILED', 'YANDEX_MARKET_API_ERROR', 'CHROMIUM_UNAVAILABLE'].includes(error?.code);
  return {
    status,
    body: {
      error: {
        code: error?.code || 'INTERNAL_ERROR',
        message: canExpose ? error.message : 'Внутренняя ошибка парсера',
        ...(error?.details ? { details: error.details } : {})
      }
    }
  };
}
