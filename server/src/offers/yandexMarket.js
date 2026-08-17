import { detectCategory } from '../category.js';
import { buildProductIdentity } from '../identity.js';

const API_URL = 'https://api.content.market.yandex.ru/v3/affiliate/partner/link/create';
const TIMEOUT_MS = 8_000;

export function yandexMarketConfigured() {
  return Boolean(
    process.env.YANDEX_MARKET_AFFILIATE_TOKEN
    && (process.env.YANDEX_MARKET_PLACE_ID || process.env.YANDEX_MARKET_CLID)
  );
}

export async function resolveYandexMarketProduct(url) {
  if (!yandexMarketConfigured()) {
    const error = new Error('Для Яндекс Маркета нужен официальный Referral API. Добавь YANDEX_MARKET_AFFILIATE_TOKEN и YANDEX_MARKET_PLACE_ID (или YANDEX_MARKET_CLID) в переменные окружения Yandex Cloud Function.');
    error.code = 'YANDEX_MARKET_API_NOT_CONFIGURED';
    error.details = {
      host: 'market.yandex.ru',
      requiredEnv: [
        'YANDEX_MARKET_AFFILIATE_TOKEN',
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

  if (process.env.YANDEX_MARKET_PLACE_ID) {
    requestUrl.searchParams.set('place_id', process.env.YANDEX_MARKET_PLACE_ID);
  } else {
    requestUrl.searchParams.set('clid', process.env.YANDEX_MARKET_CLID);
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const token = process.env.YANDEX_MARKET_AFFILIATE_TOKEN.trim();
    const authorization = /^(OAuth|Bearer)\s/i.test(token) ? token : `OAuth ${token}`;
    const response = await fetch(requestUrl, {
      headers: {
        Authorization: authorization,
        Accept: 'application/json'
      },
      signal: controller.signal
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok || (payload?.status && payload.status !== 'OK')) {
      if (!strict) return null;
      const error = new Error(`Яндекс Маркет API не смог получить товар${response.status ? ` (HTTP ${response.status})` : ''}`);
      error.code = 'YANDEX_MARKET_API_ERROR';
      error.details = { host: 'market.yandex.ru', status: response.status };
      throw error;
    }

    const link = payload?.link || {};
    const price = numberValue(payload?.price);
    if (!link?.url && !link?.title && price === null) {
      if (!strict) return null;
      const error = new Error('Яндекс Маркет API не вернул данные о товаре');
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
