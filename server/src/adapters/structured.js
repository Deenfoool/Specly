import { cleanText } from '../html.js';

export function extractStructuredProduct(html, url, storeId) {
  const states = extractJsonStates(html);
  if (!states.length) return { product: null, lines: [], provider: null };

  const known = storeId === 'citilink' ? extractCitilink(states) : null;
  const candidate = known || findBestProductCandidate(states, url);
  if (!candidate) return { product: null, lines: [], provider: null };

  return {
    product: toProductShape(candidate),
    lines: collectSpecLines(candidate),
    provider: known ? 'citilink-next-data' : 'embedded-json'
  };
}

function extractJsonStates(html) {
  const states = [];
  const scriptRe = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
  let match;
  while ((match = scriptRe.exec(String(html))) && states.length < 12) {
    const attrs = match[1] || '';
    const raw = (match[2] || '').trim();
    if (!raw || raw.length > 2_500_000) continue;
    if (!/(?:application\/json|__NEXT_DATA__|__NUXT_DATA__|initialState|preloadedState)/i.test(attrs)) continue;
    try { states.push(JSON.parse(raw)); } catch { /* Ignore malformed hydration state. */ }
  }
  return states;
}

function extractCitilink(states) {
  for (const state of states) {
    const base = state?.props?.initialState?.productPage?.productHeader?.payload?.productBase
      || state?.props?.pageProps?.initialState?.productPage?.productHeader?.payload?.productBase;
    if (base?.name && base?.id) return base;
  }
  return null;
}

function findBestProductCandidate(states, url) {
  const targetIds = String(url || '').match(/\d{5,}/g) || [];
  let best = null;
  let bestScore = 0;
  let visited = 0;
  const stack = [...states];

  while (stack.length && visited < 25_000) {
    const value = stack.pop();
    visited += 1;
    if (!value || typeof value !== 'object') continue;

    if (!Array.isArray(value)) {
      const score = candidateScore(value, targetIds);
      if (score > bestScore) {
        best = value;
        bestScore = score;
      }
    }

    for (const child of Array.isArray(value) ? value : Object.values(value)) {
      if (child && typeof child === 'object') stack.push(child);
    }
  }

  return bestScore >= 7 ? best : null;
}

function candidateScore(value, targetIds) {
  const title = cleanText(value.name || value.title || value.productName || value.shortName || '');
  if (title.length < 8 || title.length > 350) return 0;
  let score = 3;
  const id = String(value.id ?? value.productId ?? value.sku ?? value.nmId ?? '');
  if (targetIds.some((target) => target === id || id.includes(target))) score += 8;
  if (value.brand || value.brandName) score += 2;
  if (value.price || value.salePrice || value.offers) score += 2;
  if (value.properties || value.characteristics || value.specifications || value.attributes) score += 3;
  if (value.image || value.images || value.picture) score += 1;
  return score;
}

function toProductShape(value) {
  const brandValue = value.brand?.name || value.brandName || value.brand || null;
  const image = pickImage(value.image || value.images || value.picture || value.pictures);
  const price = value.price?.current ?? value.price?.value ?? value.price ?? value.salePrice ?? value.finalPrice ?? null;
  const current = numberValue(price);
  return {
    '@type': 'Product',
    name: value.name || value.title || value.productName || value.shortName || null,
    brand: brandValue ? { name: cleanText(brandValue) } : null,
    sku: String(value.sku ?? value.productId ?? value.id ?? value.nmId ?? '').trim() || null,
    mpn: cleanText(value.mpn || value.vendorCode || value.article || value.searchDescription || '') || null,
    gtin: cleanText(value.gtin || value.ean || value.barcode || '') || null,
    model: cleanText(value.model || '') || null,
    image,
    category: value.category?.name || value.categoryName || value.category || null,
    offers: current && current > 0 ? {
      price: current,
      priceCurrency: value.currency || value.priceCurrency || 'RUB',
      availability: value.isAvailable === false ? 'https://schema.org/OutOfStock' : 'https://schema.org/InStock'
    } : null
  };
}

function collectSpecLines(value) {
  const lines = [];
  const seen = new Set();
  const stack = [value];
  let visited = 0;

  while (stack.length && visited < 10_000 && lines.length < 500) {
    const item = stack.pop();
    visited += 1;
    if (!item || typeof item !== 'object') continue;

    const label = cleanText(item.name || item.title || item.label || item.key || '');
    const rawValue = item.value ?? item.displayValue ?? item.text ?? item.values;
    const textValue = primitiveText(rawValue);
    if (label && textValue && label !== textValue && label.length <= 100 && textValue.length <= 220) {
      const key = `${label.toLowerCase()}\u0000${textValue.toLowerCase()}`;
      if (!seen.has(key)) {
        seen.add(key);
        lines.push(label, textValue);
      }
    }

    for (const child of Array.isArray(item) ? item : Object.values(item)) {
      if (child && typeof child === 'object') stack.push(child);
    }
  }
  return lines;
}

function primitiveText(value) {
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return cleanText(value);
  if (Array.isArray(value) && value.every((item) => ['string', 'number', 'boolean'].includes(typeof item))) {
    return cleanText(value.join(', '));
  }
  return '';
}

function pickImage(value) {
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = pickImage(item);
      if (found) return found;
    }
  }
  if (value && typeof value === 'object') {
    return value.url || value.src || pickImage(value.sources) || null;
  }
  return null;
}

function numberValue(value) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(String(value).replace(/[\s ]/g, '').replace(',', '.').replace(/[^\d.]/g, ''));
  return Number.isFinite(number) ? number : null;
}
