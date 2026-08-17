import { validateProductUrl } from '../fetchPage.js';
import { parseDns } from './dns.js';
import { parseMvideo } from './mvideo.js';

export async function parseProduct(value) {
  const url = validateProductUrl(value);
  const host = url.hostname.toLowerCase();
  if (host.endsWith('dns-shop.ru')) return parseDns(url.href);
  if (host.endsWith('mvideo.ru')) return parseMvideo(url.href);
  const error = new Error('Магазин пока не поддерживается');
  error.code = 'UNSUPPORTED_STORE';
  throw error;
}
