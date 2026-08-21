import { getYandexMarketOffer, yandexMarketConfigured } from './yandexMarket.js';
import { searchAliExpressOffers, aliexpressConfigured } from './aliexpress.js';
import { searchWildberriesOffers, wildberriesSearchConfigured } from './wildberries.js';

export async function enrichProductOffers(product, { providers = null } = {}) {
  const existing = Array.isArray(product.offers) ? product.offers : [];
  const activeProviders = providers || [
    { id: 'wildberries-public-search', resolve: searchWildberriesOffers },
    { id: 'yandex-market-affiliate', resolve: getYandexMarketOffer },
    { id: 'aliexpress-affiliate', resolve: searchAliExpressOffers }
  ];

  const results = await Promise.allSettled(activeProviders.map((provider) => provider.resolve(product)));
  const providerOffers = results.flatMap((result) => result.status === 'fulfilled'
    ? Array.isArray(result.value) ? result.value : result.value ? [result.value] : []
    : []);
  const offerErrors = results
    .map((result, index) => result.status === 'rejected' ? {
      code: 'OFFERS_UNAVAILABLE',
      provider: activeProviders[index].id,
      message: String(result.reason?.message || 'Провайдер предложений недоступен').slice(0, 180)
    } : null)
    .filter(Boolean);

  const combined = [
    ...providerOffers,
    ...existing,
  ];

  return {
    ...product,
    offers: dedupeOffers(combined),
    offerErrors: [...(product.offerErrors || []), ...offerErrors]
  };
}

export function getOfferProviderStatus() {
  return {
    wildberriesPublicSearch: wildberriesSearchConfigured(),
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
