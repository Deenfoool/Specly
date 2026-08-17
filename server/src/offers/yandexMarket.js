import { detectCategory } from '../category.js';
import { buildProductIdentity } from '../identity.js';

const API_URL = 'https://api.content.market.yandex.ru/v3/affiliate/partner/link/create';
const TIMEOUT_MS = 8_000;

export function getYandexMarketConfigStatus() {
  const authKey = getAuthKey();
  const placeIdRaw = String(process.env.YANDEX_MARKET_PLACE_ID || '').trim();
  const clidRaw = String(process.env.YANDEX_MARKET_CLID || '').trim();
  const placeId = numericId(placeIdRaw);
  const clid = numericId(clidRaw);

  return {
    configured: Boolean(authKey && (placeId || clid)),
    authKey: Boolean(authKey),
    authKeyVariable: process.env.YANDEX_MARKET_AUTH_KEY
      ? 'YANDEX_MARKET_AUTH_KEY'
      : process.env.YANDEX_MARKET_AFFILIATE_TOKEN
        ? 'YANDEX_MARKET_AFFILIATE_TOKEN'
        : null,
    placeId: Boolean(placeIdRaw),
    placeIdValid: Boolean(placeId),
    clid: Boolean(clidRaw),
    clidValid: Boolean(clid)
  };
}

export function yandexMarketConfigured() {
  return getYandexMarketConfigStatus().configured;
}

export async function resolveYandexMarketProduct(url) {
  if (!yandexMarketConfigured()) {
    const status = getYandexMarketConfigStatus();
    const error = new Error('Для Яндекс Маркета нужен ключ Referral API и числовой YANDEX_MARKET_PLACE_ID (или YANDEX_MARKET_CLID). Ключ вида y0__... укажи в YANDEX_MARKET_AUTH_KEY.');
    error.code = 'YANDEX_MARKET_API_NOT_CONFIGURED';
    error.details = {
      host: 'market.yandex.ru',
      config: status,
      requiredEnv: [
        'YANDEX_MARKET_AUTH_KEY',
        'YANDEX_MARKET_PLACE_ID или YANDEX_MARKET_CLID'
      ]
    };
    throw error;
  }

  const offer = await requestYandexMarketOffer(url, {}, { strict: true });
  const title = offer.title || 'Товар Яндекс Маркета';
  const detected = detectCategory({ title, lines: [] });
  const identity = buildProductIdentity({ title, jsonLd: null, category: detected.category });

  return {
    store: 'Яндекс Маркет',
    source: 'market.yandex.ru',
    url,
    title,
    image: offer.image || null,
    price: offer.price || null,
    available: offer.available ?? null,
    category: detected.category,
    categoryConfidence: detected.confidence,
    identity,
    specs: {},
    specMeta: {},
    rawSpecs: [],
    offers: [offer],
    specsStatus: 'external-source-required',
    resolvedBy: 'yandex-market-affiliate'
  };
}

export async function getYandexMarketOffer(product) {
  if (!yandexMarketConfigured()) return null;
  if (!isYandexMarketUrl(product?.url)) return null;
  return requestYandexMarketOffer(product.url, product, { strict: false });
}

async function requestYandexMarketOffer(url, fallback = {}, { strict = false } = {}) {
  const requestUrl = new URL(API_URL);
  requestUrl.searchParams.set('url', url);
  requestUrl.searchParams.set('format', 'json');

  const placeId = numericId(process.env.YANDEX_MARKET_PLACE_ID);
  const clid = numericId(process.env.YANDEX_MARKET_CLID);
  if (placeId) requestUrl.searchParams.set('place_id', placeId);
  else if (clid) requestUrl.searchParams.set('clid', clid);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(requestUrl, {
      headers: {
        Authorization: authorizationHeader(getAuthKey()),
        Accept: 'application/json'
      },
      signal: controller.signal
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok || (payload?.status && payload.status !== 'OK')) {
      if (!strict) return null;
      const apiMessage = payload?.message || payload?.error || payload?.errors?.[0]?.message || null;
      const error = new Error(`Яндекс Маркет Referral API вернул HTTP ${response.status}${apiMessage ? `: ${apiMessage}` : ''}`);
      error.code = 'YANDEX_MARKET_API_ERROR';
      error.details = { host: 'market.yandex.ru', status: response.status };
      throw error;
    }

    const link = payload?.link || {};
    const price = numberValue(payload?.price);
    if (!link?.url && !link?.title && price === null) {
      if (!strict) return null;
      const error = new Error('Яндекс Маркет Referral API не вернул данные о товаре');
      error.code = 'YANDEX_MARKET_API_ERROR';
      error.details = { host: 'market.yandex.ru' };
      throw error;
    }

    return {
      store: 'Яндекс Маркет',
      source: 'market.yandex.ru',
      title: link?.title || fallback.title || null,
      image: link?.productPhoto || fallback.image || null,
      price: price === null ? fallback.price || null : { value: price, currency: 'RUB' },
      available: payload?.stockAmount == null ? null : Number(payload.stockAmount) > 0,
      stockAmount: payload?.stockAmount ?? null,
      url: link?.url || url,
      shortUrl: link?.shortUrl || null,
      provider: 'yandex-market-affiliate'
    };
  } catch (error) {
    if (!strict) return null;
    if (error?.code) throw error;
    const wrapped = new Error(error?.name === 'AbortError'
      ? 'Таймаут официального API Яндекс Маркета'
      : 'Не удалось обратиться к официальному API Яндекс Маркета');
    wrapped.code = 'YANDEX_MARKET_API_ERROR';
    wrapped.details = { host: 'market.yandex.ru' };
    throw wrapped;
  } finally {
    clearTimeout(timer);
  }
}

function getAuthKey() {
  return String(
    process.env.YANDEX_MARKET_AUTH_KEY
    || process.env.YANDEX_MARKET_AFFILIATE_TOKEN
    || ''
  ).trim();
}

function authorizationHeader(value) {
  const key = String(value || '').trim().replace(/^(?:OAuth|Bearer)\s+/i, '');
  return `OAuth ${key}`;
}

function numericId(value) {
  const id = String(value || '').trim();
  return /^\d+$/.test(id) ? id : null;
}

function isYandexMarketUrl(value) {
  try {
    const host = new URL(value).hostname.toLowerCase();
    return host === 'market.yandex.ru' || host.endsWith('.market.yandex.ru');
  } catch {
    return false;
  }
}

function numberValue(value) {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(String(value).replace(/[\s ]/g, '').replace(',', '.').replace(/[^\d.]/g, ''));
  return Number.isFinite(n) ? n : null;
}
