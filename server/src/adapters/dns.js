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

export function extractProductCandidates(content, origin = 'https://www.dns-shop.ru') {
  const results = [];
  const seen = new Set();

  const add = (hrefValue, titleValue) => {
    if (results.length >= 6) return;
    let href;
    try { href = new URL(hrefValue, origin).href; }
    catch { return; }
    if (!/\/product\/(?!characteristics\/)/i.test(href) || seen.has(href)) return;

    const title = String(titleValue || '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/^#{1,6}\s+/, '')
      .replace(/\s+/g, ' ')
      .trim();
    if (!/видеокарт/i.test(title)) return;

    seen.add(href);
    results.push({ title, url: href });
  };

  const htmlRe = /<a\b[^>]*href=["']([^"']*\/product\/(?!characteristics\/)[^"'#?]+\/)[^"']*["'][^>]*>([\s\S]*?)<\/a>/gi;
  let match;
  while ((match = htmlRe.exec(content)) && results.length < 6) add(match[1], match[2]);

  // Jina Reader и похожие reader-сервисы возвращают Markdown-ссылки.
  const markdownRe = /\[([^\]]*видеокарт[^\]]*)\]\((https?:\/\/[^\s)]+\/product\/(?!characteristics\/)[^\s)#?]+\/?[^\s)]*)\)/gi;
  while ((match = markdownRe.exec(content)) && results.length < 6) add(match[2], match[1]);

  // Некоторые reader-ответы выводят URL отдельной строкой рядом с названием.
  const lines = String(content).split(/\r?\n/);
  for (let i = 0; i < lines.length && results.length < 6; i += 1) {
    const urlMatch = lines[i].match(/https?:\/\/[^\s)]+\/product\/(?!characteristics\/)[^\s)#?]+\/?/i);
    if (!urlMatch) continue;
    const nearby = [lines[i - 2], lines[i - 1], lines[i], lines[i + 1], lines[i + 2]].filter(Boolean).join(' ');
    add(urlMatch[0], nearby);
  }

  return results;
}
