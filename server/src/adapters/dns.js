import { htmlToLines } from '../html.js';
import { fetchHtml } from '../fetchPage.js';
import { parseCommonProduct } from './common.js';

export async function parseDns(url) {
  const parsed = new URL(url);
  if (parsed.pathname.startsWith('/catalog/')) {
    const { html } = await fetchHtml(url);
    const candidates = extractProductCandidates(html, parsed.origin);
    const error = new Error('Ссылка DNS ведёт на каталог, а не на конкретный товар');
    error.code = 'DNS_CATALOG_URL';
    error.details = { candidates };
    throw error;
  }

  const main = await fetchHtml(url);
  const characteristicsUrl = toCharacteristicsUrl(main.finalUrl);
  let extraLines = [];

  if (characteristicsUrl && characteristicsUrl !== main.finalUrl) {
    try {
      const full = await fetchHtml(characteristicsUrl);
      extraLines = htmlToLines(full.html);
    } catch {
      // Summary specs from the main product page are still useful.
    }
  }

  return parseCommonProduct({ html: main.html, url: main.finalUrl, store: 'DNS', extraLines });
}

export function toCharacteristicsUrl(value) {
  const url = new URL(value);
  const match = url.pathname.match(/^\/product\/(?!characteristics\/)(.+)$/);
  if (!match) return value;
  url.pathname = `/product/characteristics/${match[1]}`;
  return url.href;
}

export function extractProductCandidates(html, origin = 'https://www.dns-shop.ru') {
  const results = [];
  const seen = new Set();
  const re = /<a\b[^>]*href=["']([^"']*\/product\/(?!characteristics\/)[^"'#?]+\/)[^"']*["'][^>]*>([\s\S]*?)<\/a>/gi;
  let match;
  while ((match = re.exec(html)) && results.length < 6) {
    const href = new URL(match[1], origin).href;
    if (seen.has(href)) continue;
    const title = match[2].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    if (!/видеокарт/i.test(title)) continue;
    seen.add(href);
    results.push({ title, url: href });
  }
  return results;
}
