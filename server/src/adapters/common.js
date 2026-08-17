import { cleanText, extractMeta, extractTagText, findProductJsonLd, htmlToLines } from '../html.js';
import { detectCategory } from '../category.js';
import { buildProductIdentity } from '../identity.js';
import { normalizeProductSpecs } from '../universalNormalizer.js';

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

  const cleanedTitle = cleanTitle(title);
  const categoryResult = detectCategory({ title: cleanedTitle, lines, jsonLd });
  const identity = buildProductIdentity({ title: cleanedTitle, jsonLd, category: categoryResult.category });
  const image = normalizeImage(jsonLd?.image) || extractMeta(html, 'og:image');
  const price = extractPrice(jsonLd, html, lines);
  const normalized = normalizeProductSpecs({ category: categoryResult.category, lines, title: cleanedTitle });
  const source = new URL(url).hostname.replace(/^www\./, '');

  return {
    store,
    source,
    url,
    title: cleanedTitle,
    image,
    price,
    available: extractAvailability(jsonLd),
    category: categoryResult.category,
    categoryConfidence: categoryResult.confidence,
    identity,
    specs: normalized.specs,
    specMeta: normalized.meta,
    rawSpecs: normalized.raw,
    offers: price ? [{ store, source, price, available: extractAvailability(jsonLd), url }] : []
  };
}

function extractPrice(jsonLd, html, lines) {
  const offer = Array.isArray(jsonLd?.offers) ? jsonLd.offers[0] : jsonLd?.offers;
  let value = numberValue(offer?.price ?? offer?.lowPrice ?? extractMeta(html, 'product:price:amount'));
  let currency = offer?.priceCurrency ?? extractMeta(html, 'product:price:currency') ?? null;

  if (value === null) {
    for (const line of lines.slice(0, 350)) {
      const match = String(line).match(/(?:^|\s)(\d{1,3}(?:[\s ]\d{3})+|\d{4,9})\s*(?:₽|руб\.?|р\.)\b/i);
      if (!match) continue;
      value = numberValue(match[1]);
      currency = 'RUB';
      break;
    }
  }

  if (value !== null && !currency) currency = 'RUB';
  return value === null ? null : { value, currency };
}

function extractAvailability(jsonLd) {
  const offer = Array.isArray(jsonLd?.offers) ? jsonLd.offers[0] : jsonLd?.offers;
  const availability = String(offer?.availability || '').toLowerCase();
  if (!availability) return null;
  if (availability.includes('instock') || availability.includes('limitedavailability')) return true;
  if (availability.includes('outofstock') || availability.includes('soldout')) return false;
  return null;
}

function extractReaderTitle(lines) {
  for (const line of lines.slice(0, 20)) {
    const match = String(line).match(/^Title:\s*(.+)$/i);
    if (match?.[1]) return cleanMarkdownText(match[1]);
  }
  return null;
}

function extractProductHeading(lines) {
  for (const line of lines.slice(0, 160)) {
    const text = cleanMarkdownText(line);
    if (text.length < 12 || text.length > 220) continue;
    if (/^(?:Видеокарта|Процессор|Смартфон|Ноутбук|Монитор|Телевизор|Наушники|Холодильник|Стиральная машина|Пылесос|SSD|Планшет)\b/i.test(text)) return text;
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
    .replace(/\s*[|—-]\s*(?:DNS|М\.Видео|MVideo|Ozon|Wildberries|Ситилинк|Яндекс Маркет|Мегамаркет|Эльдорадо).*$/i, '')
    .trim();
}

function numberValue(value) {
  if (value === null || value === undefined) return null;
  const n = Number(String(value).replace(/[\s ]/g, '').replace(',', '.').replace(/[^\d.]/g, ''));
  return Number.isFinite(n) ? n : null;
}
