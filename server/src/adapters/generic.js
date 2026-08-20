import { fetchHtml } from '../fetchPage.js';
import { parseCommonProduct } from './common.js';

export async function parseGenericStore(url, store, storeId, options = {}) {
  const page = await fetchHtml(url, options);
  return parseCommonProduct({ html: page.html, url: page.finalUrl, store, storeId, fetchInfo: page });
}
