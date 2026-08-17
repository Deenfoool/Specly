import { parseProduct } from './adapters/index.js';
import { buildComparison, buildSummary } from './normalizer.js';

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

  const products = await Promise.all(urls.map(parseProduct));
  const comparison = buildComparison(products[0], products[1]);

  if (!comparison.length) {
    const error = new Error('Не удалось извлечь сопоставимые характеристики');
    error.code = 'PRODUCT_PARSE_FAILED';
    throw error;
  }

  return {
    category: 'gpu',
    products,
    comparison,
    summary: buildSummary(comparison)
  };
}
