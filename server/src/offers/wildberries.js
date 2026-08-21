import { buildProductIdentity, scoreIdentityMatch } from '../identity.js';

const DEFAULT_ENDPOINTS = [
  'https://u-search.wb.ru/exactmatch/ru/common/v18/search',
  'https://search.wb.ru/exactmatch/ru/common/v18/search'
];
const TIMEOUT_MS = 8_000;
const DEFAULT_DEST = '-1257786';

export function wildberriesSearchConfigured() {
  return true;
}

export async function searchWildberriesOffers(product, options = {}) {
  if (product?.resolvedBy === 'wildberries-public-search'
    && (product?.offers || []).some((offer) => offer?.provider === 'wildberries-public-search')) {
    return [];
  }

  const queries = buildQueries(product);
  if (!queries.length) return [];

  const expectedId = wildberriesIdFromUrl(product?.url);
  const candidates = [];
  const seen = new Set();

  for (const query of queries.slice(0, 2)) {
    const products = await requestWildberriesSearch(query, options);
    for (const candidate of products) {
      const id = String(candidate?.id || '').trim();
      if (!id || seen.has(id)) continue;
      seen.add(id);
      candidates.push(candidate);
    }
    if (expectedId && candidates.some((candidate) => String(candidate?.id) === expectedId)) break;
  }

  return candidates
    .map((candidate) => ({ candidate, score: matchCandidate(product, candidate, expectedId) }))
    .filter(({ score }) => score >= 0.78)
    .sort((a, b) => b.score - a.score || offerPrice(a.candidate) - offerPrice(b.candidate))
    .slice(0, Number(options.limit || 3))
    .map(({ candidate, score }) => toWildberriesOffer(candidate, score, options));
}

export async function getWildberriesProductById(id, options = {}) {
  const target = String(id || '').trim();
  if (!/^\d{5,}$/.test(target)) return null;

  const products = await requestWildberriesSearch(target, options);
  const exact = products.find((candidate) => String(candidate?.id || '') === target);
  return exact ? toWildberriesRecord(exact, options) : null;
}

export async function requestWildberriesSearch(query, options = {}) {
  const endpoints = options.endpoint
    ? [String(options.endpoint)]
    : process.env.WILDBERRIES_SEARCH_ENDPOINT
      ? [String(process.env.WILDBERRIES_SEARCH_ENDPOINT)]
      : DEFAULT_ENDPOINTS;

  let lastError = null;
  for (const endpoint of endpoints) {
    try {
      const url = new URL(endpoint);
      url.searchParams.set('appType', '1');
      url.searchParams.set('curr', options.currency || process.env.WILDBERRIES_CURRENCY || 'rub');
      url.searchParams.set('dest', String(options.dest || process.env.WILDBERRIES_DEST || DEFAULT_DEST));
      url.searchParams.set('lang', options.lang || process.env.WILDBERRIES_LANG || 'ru');
      url.searchParams.set('page', String(options.page || 1));
      url.searchParams.set('query', String(query).slice(0, 180));
      url.searchParams.set('resultset', 'catalog');
      url.searchParams.set('sort', options.sort || 'popular');
      url.searchParams.set('spp', String(options.spp || 30));
      url.searchParams.set('suppressSpellcheck', 'false');

      const payload = await fetchJson(url, options);
      const products = payload?.products ?? payload?.data?.products ?? [];
      if (!Array.isArray(products)) return [];
      return products;
    } catch (error) {
      lastError = error;
    }
  }

  if (lastError) throw lastError;
  return [];
}

export function toWildberriesRecord(candidate, options = {}) {
  const offer = toWildberriesOffer(candidate, 1, options);
  return {
    id: String(candidate?.id || ''),
    title: candidate?.name || null,
    brand: candidate?.brand || null,
    price: offer.price,
    originalPrice: offer.originalPrice,
    available: offer.available,
    rating: numberOrNull(candidate?.reviewRating ?? candidate?.nmReviewRating ?? candidate?.rating),
    reviewCount: integerOrNull(candidate?.nmFeedbacks ?? candidate?.feedbacks),
    totalQuantity: integerOrNull(candidate?.totalQuantity),
    supplier: candidate?.supplier || null,
    supplierRating: numberOrNull(candidate?.supplierRating),
    offer
  };
}

function buildQueries(product) {
  const identity = product?.identity || {};
  const canonical = [identity.brand, identity.model, identity.variant].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
  const fallback = String(product?.title || '').replace(/\s+/g, ' ').trim();
  const id = wildberriesIdFromUrl(product?.url);
  return [...new Set([id, canonical, fallback].filter((value) => value && String(value).length >= 5))];
}

function matchCandidate(product, candidate, expectedId) {
  const id = String(candidate?.id || '').trim();
  if (expectedId && id === expectedId) return 1;

  const candidateIdentity = buildProductIdentity({
    title: candidate?.name || '',
    jsonLd: { brand: candidate?.brand || null, sku: id || null },
    category: product?.category || 'generic'
  });

  if (!colorsCompatible(product?.identity, candidateIdentity)) return 0;
  return scoreIdentityMatch(product?.identity, candidateIdentity);
}

function colorsCompatible(expected, candidate) {
  const left = normalize(expected?.attributes?.color);
  const right = normalize(candidate?.attributes?.color);
  return !left || !right || left === right;
}

function toWildberriesOffer(candidate, score, options = {}) {
  const id = String(candidate?.id || '').trim() || null;
  const current = offerPrice(candidate);
  const original = originalPrice(candidate);
  const quantity = integerOrNull(candidate?.totalQuantity);
  const dest = String(options.dest || process.env.WILDBERRIES_DEST || DEFAULT_DEST);

  return {
    store: 'Wildberries',
    source: 'wildberries.ru',
    title: candidate?.name || null,
    brand: candidate?.brand || null,
    price: Number.isFinite(current) ? { value: current, currency: 'RUB' } : null,
    originalPrice: Number.isFinite(original) ? { value: original, currency: 'RUB' } : null,
    available: quantity == null ? null : quantity > 0,
    totalQuantity: quantity,
    rating: numberOrNull(candidate?.reviewRating ?? candidate?.nmReviewRating ?? candidate?.rating),
    reviewCount: integerOrNull(candidate?.nmFeedbacks ?? candidate?.feedbacks),
    supplier: candidate?.supplier || null,
    supplierRating: numberOrNull(candidate?.supplierRating),
    url: id ? `https://www.wildberries.ru/catalog/${id}/detail.aspx` : null,
    productId: id,
    matchScore: Math.round(Number(score || 0) * 100) / 100,
    provider: 'wildberries-public-search',
    regionDest: dest,
    priceNote: 'Цена и наличие Wildberries могут зависеть от региона, аккаунта и способа оплаты.'
  };
}

function offerPrice(candidate) {
  const prices = (Array.isArray(candidate?.sizes) ? candidate.sizes : [])
    .map((size) => centsToRub(size?.price?.product ?? size?.price?.wallet ?? size?.price?.basic))
    .filter((value) => Number.isFinite(value) && value > 0);
  return prices.length ? Math.min(...prices) : Number.POSITIVE_INFINITY;
}

function originalPrice(candidate) {
  const prices = (Array.isArray(candidate?.sizes) ? candidate.sizes : [])
    .map((size) => centsToRub(size?.price?.basic))
    .filter((value) => Number.isFinite(value) && value > 0);
  return prices.length ? Math.min(...prices) : Number.NaN;
}

function centsToRub(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number / 100 : Number.NaN;
}

async function fetchJson(url, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Number(options.timeoutMs || TIMEOUT_MS));
  const fetchImpl = options.fetchImpl || fetch;
  try {
    const response = await fetchImpl(url, {
      headers: {
        accept: 'application/json,text/plain,*/*',
        'accept-language': 'ru-RU,ru;q=0.9,en;q=0.5',
        'user-agent': process.env.WILDBERRIES_USER_AGENT || 'Specly/0.4 (+https://github.com/Deenfoool/Specly)'
      },
      signal: controller.signal
    });
    if (!response.ok) {
      const error = new Error(`Wildberries search API вернул HTTP ${response.status}`);
      error.code = 'WILDBERRIES_SEARCH_ERROR';
      error.details = { status: response.status, host: url.hostname };
      throw error;
    }
    return await response.json();
  } catch (error) {
    if (error?.code) throw error;
    const wrapped = new Error(error?.name === 'AbortError'
      ? 'Таймаут публичного поиска Wildberries'
      : 'Публичный поиск Wildberries недоступен');
    wrapped.code = 'WILDBERRIES_SEARCH_ERROR';
    wrapped.details = { host: url.hostname };
    throw wrapped;
  } finally {
    clearTimeout(timer);
  }
}

function wildberriesIdFromUrl(value) {
  try {
    const match = new URL(value).pathname.match(/\/catalog\/(\d+)\/detail\.aspx/i);
    return match?.[1] || null;
  } catch {
    return null;
  }
}

function numberOrNull(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function integerOrNull(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.round(number) : null;
}

function normalize(value) {
  return String(value || '').toLowerCase().replace(/ё/g, 'е').replace(/[^a-zа-я0-9]+/gi, ' ').trim();
}
