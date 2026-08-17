import { cleanText, extractMeta, extractTagText, findProductJsonLd, htmlToLines } from '../html.js';
import { normalizeGpuSpecs } from '../normalizer.js';

export function parseCommonProduct({ html, url, store, extraLines = [] }) {
  const jsonLd = findProductJsonLd(html);
  const lines = [...htmlToLines(html), ...extraLines].filter(Boolean);
  const title = jsonLd?.name
    || extractMeta(html, 'og:title')
    || extractTagText(html, 'h1')
    || extractTagText(html, 'title')
    || extractReaderTitle(lines)
    || extractProductHeading(lines)
    || 'Товар без названия';

  const image = normalizeImage(jsonLd?.image) || extractMeta(html, 'og:image');
  const price = extractPrice(jsonLd, html, lines);
  const { specs, raw } = normalizeGpuSpecs(lines, title);

  return {
    store,
    source: new URL(url).hostname.replace(/^www\./, ''),
    url,
    title: cleanTitle(title),
    image,
    price,
    specs,
    rawSpecs: raw
  };
}

function extractPrice(jsonLd, html, lines) {
  const offer = Array.isArray(jsonLd?.offers) ? jsonLd.offers[0] : jsonLd?.offers;
  let value = numberValue(offer?.price ?? offer?.lowPrice ?? extractMeta(html, 'product:price:amount'));
  let currency = offer?.priceCurrency ?? extractMeta(html, 'product:price:currency') ?? null;

  if (value === null) {
    for (const line of lines.slice(0, 250)) {
      const match = String(line).match(/(?:^|\s)(\d{1,3}(?:[\s ]\d{3})+|\d{4,7})\s*(?:₽|руб\.?|р\.)\b/i);
      if (!match) continue;
      value = numberValue(match[1]);
      currency = 'RUB';
      break;
    }
  }

  if (value !== null && !currency) currency = 'RUB';
  return value === null ? null : { value, currency };
}

function extractReaderTitle(lines) {
  for (const line of lines.slice(0, 20)) {
    const match = String(line).match(/^Title:\s*(.+)$/i);
    if (match?.[1]) return cleanMarkdownText(match[1]);
  }
  return null;
}

function extractProductHeading(lines) {
  for (const line of lines.slice(0, 120)) {
    const text = cleanMarkdownText(line);
    if (/^Видеокарта\b/i.test(text) && text.length > 12 && text.length < 220) return text;
  }
  return null;
}

function cleanMarkdownText(value) {
  return cleanText(String(value)
    .replace(/^#{1,6}\s+/, '')
    .replace(/^[-*+]\s+/, '')
    .replace(/\[([^\]]+)\]\([^\)]+\)/g, '$1'));
}

function normalizeImage(value) {
  if (Array.isArray(value)) return value[0] ?? null;
  if (typeof value === 'object') return value?.url ?? null;
  return typeof value === 'string' ? value : null;
}

function cleanTitle(value) {
  return cleanMarkdownText(value)
    .replace(/\s*[|—-]\s*(?:DNS|М\.Видео|MVideo).*$/i, '')
    .trim();
}

function numberValue(value) {
  if (value === null || value === undefined) return null;
  const n = Number(String(value).replace(/[\s ]/g, '').replace(',', '.').replace(/[^\d.]/g, ''));
  return Number.isFinite(n) ? n : null;
}
