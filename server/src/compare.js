import { parseProduct } from './adapters/index.js';
import { buildUniversalComparison, buildUniversalSummary } from './universalNormalizer.js';

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
  const mixed = parsedProducts[0].category !== parsedProducts[1].category;
  const comparison = buildUniversalComparison(parsedProducts[0], parsedProducts[1]);

  if (!comparison.length && !mixed) {
    const error = new Error('Не удалось извлечь сопоставимые характеристики');
    error.code = 'PRODUCT_PARSE_FAILED';
    throw error;
  }

  const category = mixed ? 'mixed' : (parsedProducts[0].category || 'generic');

  return {
    category,
    categories: parsedProducts.map((product) => product.category || 'generic'),
    mixedCategories: mixed,
    products: parsedProducts.map(toPublicProduct),
    comparison,
    summary: buildUniversalSummary(comparison, { mixed })
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
    offers: Array.isArray(product.offers) ? product.offers : []
  };
}
