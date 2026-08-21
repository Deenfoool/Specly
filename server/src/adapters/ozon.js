import { cleanText, decodeEntities } from '../html.js';
import { fetchHtml } from '../fetchPage.js';
import { parseCommonProduct } from './common.js';

const PRICE_KEYS = ['currentPrice', 'finalPrice', 'cardPrice', 'salePrice', 'price'];
const RATING_KEYS = ['rating', 'ratingValue', 'averageRating'];
const REVIEW_KEYS = ['reviewCount', 'reviewsCount', 'review_count'];

export async function parseOzon(url, options = {}) {
  const sessionKey = `ozon:${productIdFromUrl(url) || url}`;
  const loaded = await fetchHtml(url, { ...options, browserSessionKey: sessionKey });
  const signals = extractOzonSignals(loaded.html, loaded.finalUrl);

  const product = parseCommonProduct({
    html: loaded.html,
    url: loaded.finalUrl,
    store: 'Ozon',
    storeId: 'ozon',
    extraLines: signals.specLines,
    fetchInfo: loaded
  });

  const price = signals.price || product.price;
  const offers = (product.offers || []).map((offer, index) => index === 0 ? { ...offer, price } : offer);

  return {
    ...product,
    price,
    offers,
    rating: signals.rating,
    reviewCount: signals.reviewCount,
    productId: signals.productId || productIdFromUrl(loaded.finalUrl),
    resolvedBy: signals.provider || product.resolvedBy
  };
}

export function extractOzonSignals(html, url = '') {
  const states = extractJsonStates(html);
  const targetId = productIdFromUrl(url);
  const candidate = findProductCandidate(states, targetId);
  const widgetPrice = priceFromWidget(html);
  const statePrice = candidate ? findNamedNumber(candidate, PRICE_KEYS, { min: 10, max: 100_000_000 }) : null;
  const rating = firstDefined(
    candidate ? findNamedNumber(candidate, RATING_KEYS, { min: 1, max: 5 }) : null,
    ratingFromWidget(html),
    ratingFromHtml(html)
  );
  const reviewCount = firstDefined(
    candidate ? findNamedNumber(candidate, REVIEW_KEYS, { min: 0, max: 100_000_000, integer: true }) : null,
    reviewsFromWidget(html),
    reviewsFromHtml(html)
  );
  const specLines = candidate ? collectSpecLines(candidate) : [];
  const candidateId = candidate ? extractCandidateId(candidate) : null;

  return {
    productId: candidateId || targetId,
    price: statePrice != null
      ? { value: statePrice, currency: 'RUB' }
      : widgetPrice != null
        ? { value: widgetPrice, currency: 'RUB' }
        : null,
    rating,
    reviewCount,
    specLines,
    provider: candidate ? 'ozon-embedded-state' : widgetPrice != null ? 'ozon-widget' : null
  };
}

function extractJsonStates(html) {
  const states = [];
  const source = String(html || '');
  const scriptRe = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
  let match;
  while ((match = scriptRe.exec(source)) && states.length < 30) {
    const attrs = match[1] || '';
    const raw = decodeEntities(match[2] || '').trim();
    if (!raw || raw.length > 3_000_000) continue;

    if (/^(?:\{|\[)/.test(raw)) {
      try { states.push(JSON.parse(raw)); } catch { /* ignore */ }
    }

    const assignment = raw.match(/(?:window\.)?(?:__INITIAL_STATE__|__PRELOADED_STATE__|initialState)\s*=\s*([\s\S]+)/i);
    if (assignment) {
      const json = trimJsonAssignment(assignment[1]);
      try { states.push(JSON.parse(json)); } catch { /* ignore */ }
    }

    for (const attrName of ['data-state', 'data-json', 'data-props']) {
      const attr = new RegExp(`${attrName}=["']([^"']{2,})["']`, 'i').exec(attrs)?.[1];
      if (!attr) continue;
      try { states.push(JSON.parse(decodeEntities(attr))); } catch { /* ignore */ }
    }
  }
  return states;
}

function trimJsonAssignment(value) {
  let text = String(value || '').trim().replace(/;\s*$/, '');
  const first = text.search(/[\[{]/);
  if (first > 0) text = text.slice(first);
  return text;
}

function findProductCandidate(states, targetId) {
  let best = null;
  let bestScore = 0;
  let visited = 0;
  const stack = [...states];

  while (stack.length && visited < 40_000) {
    const node = stack.pop();
    visited += 1;
    if (!node || typeof node !== 'object') continue;

    if (!Array.isArray(node)) {
      const score = candidateScore(node, targetId);
      if (score > bestScore) {
        best = node;
        bestScore = score;
      }
    }

    for (const child of Array.isArray(node) ? node : Object.values(node)) {
      if (child && typeof child === 'object') stack.push(child);
    }
  }

  return bestScore >= 6 ? best : null;
}

function candidateScore(node, targetId) {
  const title = cleanText(node.name || node.title || node.productName || node.shortName || '');
  const id = extractCandidateId(node);
  let score = 0;
  if (title.length >= 8 && title.length <= 400) score += 3;
  if (targetId && id && (id === targetId || String(id).includes(targetId))) score += 10;
  if (id) score += 1;
  if (node.price != null || node.currentPrice != null || node.finalPrice != null || node.cardPrice != null || node.offers) score += 2;
  if (node.characteristics || node.attributes || node.properties || node.specifications) score += 3;
  if (node.image || node.images || node.imageUrl || node.pictures) score += 1;
  return score;
}

function extractCandidateId(node) {
  const value = node?.id ?? node?.productId ?? node?.product_id ?? node?.sku ?? node?.skuId ?? node?.offerId;
  return value == null ? null : String(value).trim() || null;
}

function findNamedNumber(root, keys, options = {}) {
  const keySet = new Set(keys.map((key) => key.toLowerCase()));
  const stack = [root];
  let visited = 0;

  while (stack.length && visited < 20_000) {
    const node = stack.pop();
    visited += 1;
    if (!node || typeof node !== 'object') continue;

    if (!Array.isArray(node)) {
      for (const [key, value] of Object.entries(node)) {
        if (keySet.has(key.toLowerCase())) {
          const number = numberValue(value);
          if (validNumber(number, options)) return options.integer ? Math.round(number) : number;
        }
        if (value && typeof value === 'object') stack.push(value);
      }
    } else {
      for (const value of node) if (value && typeof value === 'object') stack.push(value);
    }
  }
  return null;
}

function collectSpecLines(root) {
  const lines = [];
  const seen = new Set();
  const stack = [{ value: root, insideSpecs: false }];
  let visited = 0;

  while (stack.length && visited < 20_000 && lines.length < 600) {
    const { value, insideSpecs } = stack.pop();
    visited += 1;
    if (!value || typeof value !== 'object') continue;

    if (!Array.isArray(value)) {
      const label = cleanText(value.name || value.title || value.label || value.key || '');
      const raw = value.value ?? value.displayValue ?? value.text ?? value.values;
      const text = primitiveText(raw);
      if (insideSpecs && label && text && label !== text && label.length <= 120 && text.length <= 300) {
        const dedupe = `${label.toLowerCase()}\u0000${text.toLowerCase()}`;
        if (!seen.has(dedupe)) {
          seen.add(dedupe);
          lines.push(label, text);
        }
      }

      for (const [key, child] of Object.entries(value)) {
        if (!child || typeof child !== 'object') continue;
        const nextInside = insideSpecs || /characteristic|attribute|propert|specific|feature|param/i.test(key);
        stack.push({ value: child, insideSpecs: nextInside });
      }
    } else {
      for (const child of value) if (child && typeof child === 'object') stack.push({ value: child, insideSpecs });
    }
  }
  return lines;
}

function priceFromWidget(html) {
  const text = widgetText(html, ['webPrice', 'price']);
  if (!text) return null;
  return moneyFromText(text);
}

function ratingFromWidget(html) {
  const text = widgetText(html, ['webReviewRating']);
  if (!text) return null;
  const match = text.replace(',', '.').match(/(?:^|\s)([1-5](?:\.\d{1,2})?)(?:\s|$)/);
  return match ? Number(match[1]) : null;
}

function reviewsFromWidget(html) {
  const text = widgetText(html, ['webReviewCount']);
  if (!text) return null;
  const match = text.match(/(\d[\d\s  ]*)\s*(?:отзыв|review)/i) || text.match(/\b(\d[\d\s  ]{0,12})\b/);
  return match ? integerValue(match[1]) : null;
}

function widgetText(html, names) {
  const source = String(html || '');
  for (const name of names) {
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const patterns = [
      new RegExp(`<([a-z][\\w:-]*)\\b[^>]*data-widget=["']${escaped}["'][^>]*>([\\s\\S]*?)<\\/\\1>`, 'i'),
      new RegExp(`<([a-z][\\w:-]*)\\b[^>]*data-widget=["'][^"']*${escaped}[^"']*["'][^>]*>([\\s\\S]*?)<\\/\\1>`, 'i')
    ];
    for (const pattern of patterns) {
      const match = source.match(pattern);
      if (match?.[2]) return cleanText(match[2].replace(/<[^>]+>/g, ' '));
    }
  }
  return null;
}

function ratingFromHtml(html) {
  for (const pattern of [
    /["']ratingValue["']\s*:\s*["']?([1-5](?:[.,]\d{1,2})?)/i,
    /["']averageRating["']\s*:\s*["']?([1-5](?:[.,]\d{1,2})?)/i,
    /["']rating["']\s*:\s*["']?([1-5](?:[.,]\d{1,2})?)/i
  ]) {
    const match = String(html).match(pattern);
    if (match) return Number(match[1].replace(',', '.'));
  }
  return null;
}

function reviewsFromHtml(html) {
  for (const pattern of [
    /["']reviewCount["']\s*:\s*["']?(\d+)/i,
    /["']reviewsCount["']\s*:\s*["']?(\d+)/i,
    /["']review_count["']\s*:\s*["']?(\d+)/i
  ]) {
    const match = String(html).match(pattern);
    if (match) return Number(match[1]);
  }
  return null;
}

function moneyFromText(value) {
  const match = String(value || '').match(/(\d[\d\s  ]{1,14})\s*(?:₽|руб\.?|RUB)/i);
  return match ? integerValue(match[1]) : null;
}

function numberValue(value) {
  if (value == null || value === '') return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'object') {
    for (const key of ['value', 'amount', 'price']) {
      const number = numberValue(value[key]);
      if (number != null) return number;
    }
    return null;
  }
  const match = String(value).replace(',', '.').match(/-?\d+(?:\.\d+)?/);
  return match ? Number(match[0]) : null;
}

function integerValue(value) {
  const digits = String(value || '').replace(/[^\d]/g, '');
  return digits ? Number(digits) : null;
}

function validNumber(number, { min = -Infinity, max = Infinity } = {}) {
  return Number.isFinite(number) && number >= min && number <= max;
}

function primitiveText(value) {
  if (['string', 'number', 'boolean'].includes(typeof value)) return cleanText(value);
  if (Array.isArray(value) && value.every((item) => ['string', 'number', 'boolean'].includes(typeof item))) return cleanText(value.join(', '));
  return '';
}

function productIdFromUrl(value) {
  try {
    const pathname = new URL(value).pathname;
    const ids = pathname.match(/\d{6,}/g) || [];
    return ids.at(-1) || null;
  } catch {
    return null;
  }
}

function firstDefined(...values) {
  return values.find((value) => value !== null && value !== undefined) ?? null;
}
