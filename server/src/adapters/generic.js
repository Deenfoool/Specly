import { fetchHtml } from '../fetchPage.js';
import { parseCommonProduct } from './common.js';

export async function parseGenericStore(url, store) {
  const page = await fetchHtml(url);
  return parseCommonProduct({ html: page.html, url: page.finalUrl, store });
}
