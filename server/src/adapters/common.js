import { extractMeta, extractTagText, findProductJsonLd, htmlToLines } from '../html.js';
import { normalizeGpuSpecs } from '../normalizer.js';

export function parseCommonProduct({ html, url, store, extraLines = [] }) {
  const jsonLd = findProductJsonLd(html);
  const title = jsonLd?.name
    || extractMeta(html, 'og:title')
    || extractTagText(html, 'h1')
    || extractTagText(html, 'title')
    || 'Товар без названия';

  const image = normalizeImage(jsonLd?.image) || extractMeta(html, 'og:image');
  const price = extractPrice(jsonLd, html);
  const lines = [...htmlToLines(html), ...extraLines].filter(Boolean);
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

function extractPrice(jsonLd, html) {
  const offer = Array.isArray(jsonLd?.offers) ? jsonLd.offers[0] : jsonLd?.offers;
  const value = numberValue(offer?.price ?? offer?.lowPrice ?? extractMeta(html, 'product:price:amount'));
  const currency = offer?.priceCurrency ?? extractMeta(html, 'product:price:currency') ?? (value !== null ? 'RUB' : null);
  return value === null ? null : { value, currency };
}

function normalizeImage(value) {
  if (Array.isArray(value)) return value[0] ?? null;
  if (typeof value === 'object') return value?.url ?? null;
  return typeof value === 'string' ? value : null;
}

function cleanTitle(value) {
  return String(value).replace(/\s*[|—-]\s*(?:DNS|М\.Видео|MVideo).*$/i, '').trim();
}

function numberValue(value) {
  if (value === null || value === undefined) return null;
  const n = Number(String(value).replace(/\s/g, '').replace(',', '.').replace(/[^\d.]/g, ''));
  return Number.isFinite(n) ? n : null;
}
