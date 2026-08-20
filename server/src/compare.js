import { parseProduct } from './adapters/index.js';
import { buildUniversalComparison, buildUniversalSummary } from './universalNormalizer.js';
import { enrichProductOffers, getOfferProviderStatus } from './offers/index.js';

export async function compareUrls(urls, options = {}) {
  if (!Array.isArray(urls) || urls.length !== 2) {
    const error = new Error('Нужно передать ровно две ссылки');
    error.code = 'INVALID_REQUEST';
    throw error;
  }
  if (sameUrl(urls[0], urls[1])) {
    const error = new Error('Для сравнения нужны две разные ссылки');
    error.code = 'SAME_URLS';
    throw error;
  }

  const parsedProducts = await Promise.all(urls.map((url) => parseProduct(url, options)));
  const products = await Promise.all(parsedProducts.map((product) => enrichProductOffers(product, options.offerOptions)));
  const mixed = products[0].category !== products[1].category;
  const comparison = buildUniversalComparison(products[0], products[1]);
  const partial = products.some((product) => product.partial || product.specsStatus !== 'available');

  if (!comparison.length && !mixed && !partial) {
    const error = new Error('Не удалось извлечь сопоставимые характеристики');
    error.code = 'PRODUCT_PARSE_FAILED';
    throw error;
  }

  const category = mixed ? 'mixed' : (products[0].category || 'generic');
  const summary = comparison.length
    ? buildUniversalSummary(comparison, { mixed })
    : 'Товары распознаны частично: для одной из карточек характеристики сейчас недоступны. Specly сохранил подтверждённые данные, ссылку и найденные предложения вместо полного отказа.';

  return {
    category,
    categories: products.map((product) => product.category || 'generic'),
    mixedCategories: mixed,
    partialComparison: partial || !comparison.length,
    products: products.map(toPublicProduct),
    comparison,
    summary,
    status: partial ? 'partial' : 'complete',
    errors: collectErrors(products),
    offerProviders: getOfferProviderStatus()
  };
}

function toPublicProduct(product) {
  return {
    store: product.store,
    source: product.source,
    url: product.url,
    title: product.title,
    image: product.image,
    price: product.price,
    available: product.available ?? null,
    category: product.category || 'generic',
    categoryConfidence: product.categoryConfidence ?? 0,
    identity: product.identity || null,
    specs: product.specs || {},
    specMeta: product.specMeta || {},
    specsStatus: product.specsStatus || 'available',
    partial: Boolean(product.partial),
    resolvedBy: product.resolvedBy || null,
    offers: Array.isArray(product.offers) ? product.offers : [],
    errors: Array.isArray(product.errors) ? product.errors : [],
    offerErrors: Array.isArray(product.offerErrors) ? product.offerErrors : [],
    fetchAttempts: Array.isArray(product.fetchAttempts) ? product.fetchAttempts : []
  };
}

function sameUrl(a, b) {
  try {
    const left = new URL(a);
    const right = new URL(b);
    left.hash = '';
    right.hash = '';
    return left.href === right.href;
  } catch {
    return a === b;
  }
}

function collectErrors(products) {
  return products.flatMap((product, productIndex) => [
    ...(product.errors || []).map((error) => ({ ...error, productIndex })),
    ...(product.offerErrors || []).map((error) => ({ ...error, productIndex }))
  ]);
}
