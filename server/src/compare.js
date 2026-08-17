import { parseProduct } from './adapters/index.js';
import { buildUniversalComparison, buildUniversalSummary } from './universalNormalizer.js';
import { enrichProductOffers, getOfferProviderStatus } from './offers/index.js';

export async function compareUrls(urls) {
  if (!Array.isArray(urls) || urls.length !== 2) {
    const error = new Error('Нужно передать ровно две ссылки');
    error.code = 'INVALID_REQUEST';
    throw error;
  }
  if (urls[0] === urls[1]) {
    const error = new Error('Для сравнения нужны две разные ссылки');
    error.code = 'SAME_URLS';
    throw error;
  }

  const parsedProducts = await Promise.all(urls.map(parseProduct));
  const products = await Promise.all(parsedProducts.map(enrichProductOffers));
  const mixed = products[0].category !== products[1].category;
  const comparison = buildUniversalComparison(products[0], products[1]);
  const partial = products.some((product) => product.specsStatus === 'external-source-required');

  if (!comparison.length && !mixed && !partial) {
    const error = new Error('Не удалось извлечь сопоставимые характеристики');
    error.code = 'PRODUCT_PARSE_FAILED';
    throw error;
  }

  const category = mixed ? 'mixed' : (products[0].category || 'generic');
  const summary = comparison.length
    ? buildUniversalSummary(comparison, { mixed })
    : 'Товары распознаны, но для одной из карточек характеристики недоступны через официальный API. Цена, наличие и ссылка уже получены; характеристики будут дополнены из браузерного или другого доверенного источника.';

  return {
    category,
    categories: products.map((product) => product.category || 'generic'),
    mixedCategories: mixed,
    partialComparison: partial || !comparison.length,
    products: products.map(toPublicProduct),
    comparison,
    summary,
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
    specsStatus: product.specsStatus || 'available',
    resolvedBy: product.resolvedBy || null,
    offers: Array.isArray(product.offers) ? product.offers : []
  };
}
