import { getYandexMarketOffer, yandexMarketConfigured } from './yandexMarket.js';
import { searchAliExpressOffers, aliexpressConfigured } from './aliexpress.js';

export async function enrichProductOffers(product) {
  const existing = Array.isArray(product.offers) ? product.offers : [];

  const [yandexOffer, aliOffers] = await Promise.all([
    getYandexMarketOffer(product),
    searchAliExpressOffers(product)
  ]);

  const combined = [
    ...(yandexOffer ? [yandexOffer] : []),
    ...existing,
    ...aliOffers
  ];

  return {
    ...product,
    offers: dedupeOffers(combined)
  };
}

export function getOfferProviderStatus() {
  return {
    yandexMarketAffiliate: yandexMarketConfigured(),
    aliexpressAffiliate: aliexpressConfigured()
  };
}

function dedupeOffers(offers) {
  const seen = new Set();
  const result = [];

  for (const offer of offers) {
    if (!offer) continue;
    const key = offerKey(offer);
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(offer);
  }

  return result;
}

function offerKey(offer) {
  if (offer.provider === 'yandex-market-affiliate') return 'store:yandex-market';
  if (offer.productId) return `${normalize(offer.store)}:product:${offer.productId}`;

  const url = normalizeUrl(offer.url);
  if (url) return `url:${url}`;

  return [normalize(offer.store), normalize(offer.title), offer.price?.value ?? offer.price ?? ''].join('|');
}

function normalize(value) {
  return String(value || '').toLowerCase().replace(/\s+/g, ' ').trim();
}

function normalizeUrl(value) {
  try {
    const url = new URL(value);
    url.hash = '';
    for (const name of [...url.searchParams.keys()]) {
      if (/^(utm_|yclid|clid|mclid|ref|refid)/i.test(name)) url.searchParams.delete(name);
    }
    return url.href;
  } catch {
    return '';
  }
}
