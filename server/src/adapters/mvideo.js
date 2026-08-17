import { fetchHtml } from '../fetchPage.js';
import { parseCommonProduct } from './common.js';

export async function parseMvideo(url) {
  const page = await fetchHtml(url);
  return parseCommonProduct({ html: page.html, url: page.finalUrl, store: 'М.Видео' });
}
