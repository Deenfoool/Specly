import { detectCategory } from '../category.js';
import { buildProductIdentity } from '../identity.js';
import { getWildberriesProductById } from '../offers/wildberries.js';
import { parseGenericStore } from './generic.js';

export async function parseWildberries(url, options = {}) {
  const id = productIdFromUrl(url);

  if (id) {
    try {
      const record = await getWildberriesProductById(id, options.wildberriesOptions || {});
      if (record?.title) return productFromRecord(url, record);
    } catch (error) {
      if (typeof options.logger === 'function') {
        try {
          options.logger({
            store: 'wildberries',
            strategy: 'public-search',
            event: 'failed',
            code: error?.code || 'WILDBERRIES_SEARCH_ERROR',
            reason: String(error?.message || 'Wildberries search failed').slice(0, 180)
          });
        } catch { /* diagnostics must never break parsing */ }
      }
    }
  }

  return parseGenericStore(url, 'Wildberries', 'wildberries', options);
}

function productFromRecord(url, record) {
  const title = record.title;
  const categoryResult = detectCategory({ title, lines: [] });
  const identity = buildProductIdentity({
    title,
    jsonLd: { brand: record.brand || null, sku: record.id || null, productID: record.id || null },
    category: categoryResult.category
  });

  return {
    store: 'Wildberries',
    source: 'wildberries.ru',
    url,
    title,
    image: null,
    price: record.price || null,
    available: record.available ?? null,
    category: categoryResult.category,
    categoryConfidence: categoryResult.confidence,
    identity,
    specs: {},
    specMeta: {},
    rawSpecs: {},
    specsStatus: 'external-source-required',
    partial: true,
    resolvedBy: 'wildberries-public-search',
    productId: record.id || null,
    rating: record.rating ?? null,
    reviewCount: record.reviewCount ?? null,
    totalQuantity: record.totalQuantity ?? null,
    supplier: record.supplier || null,
    supplierRating: record.supplierRating ?? null,
    offers: record.offer ? [record.offer] : []
  };
}

function productIdFromUrl(value) {
  try {
    return new URL(value).pathname.match(/\/catalog\/(\d+)\/detail\.aspx/i)?.[1] || null;
  } catch {
    return null;
  }
}
