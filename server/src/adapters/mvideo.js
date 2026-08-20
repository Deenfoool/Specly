import { fetchHtml } from '../fetchPage.js';
import { parseCommonProduct } from './common.js';

export async function parseMvideo(url, options = {}) {
  const page = await fetchHtml(url, options);
  return parseCommonProduct({ html: page.html, url: page.finalUrl, store: 'М.Видео', storeId: 'mvideo', fetchInfo: page });
}
