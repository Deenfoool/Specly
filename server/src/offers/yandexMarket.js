const API_URL = 'https://api.content.market.yandex.ru/v3/affiliate/partner/link/create';
const TIMEOUT_MS = 8_000;

export function yandexMarketConfigured() {
  return Boolean(
    process.env.YANDEX_MARKET_AFFILIATE_TOKEN
    && (process.env.YANDEX_MARKET_PLACE_ID || process.env.YANDEX_MARKET_CLID)
  );
}

export async function getYandexMarketOffer(product) {
  if (!yandexMarketConfigured()) return null;
  if (!isYandexMarketUrl(product?.url)) return null;

  const requestUrl = new URL(API_URL);
  requestUrl.searchParams.set('url', product.url);
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

    if (!response.ok) return null;
    const payload = await response.json();
    if (payload?.status && payload.status !== 'OK') return null;

    const link = payload?.link;
    const price = numberValue(payload?.price);
    if (!link?.url && price === null) return null;

    return {
      store: 'Яндекс Маркет',
      source: 'market.yandex.ru',
      title: link?.title || product.title || null,
      image: link?.productPhoto || product.image || null,
      price: price === null ? product.price || null : { value: price, currency: 'RUB' },
      available: payload?.stockAmount == null ? null : Number(payload.stockAmount) > 0,
      stockAmount: payload?.stockAmount ?? null,
      url: link?.url || product.url,
      shortUrl: link?.shortUrl || null,
      provider: 'yandex-market-affiliate'
    };
  } catch {
    return null;
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
