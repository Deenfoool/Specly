import { createHmac } from 'node:crypto';

const API_URL = 'https://eco.taobao.com/router/rest';
const TIMEOUT_MS = 10_000;

export function aliexpressConfigured() {
  return Boolean(process.env.ALIEXPRESS_APP_KEY && process.env.ALIEXPRESS_APP_SECRET);
}

export async function searchAliExpressOffers(product, { limit = 3 } = {}) {
  if (!aliexpressConfigured()) return [];

  const keywords = buildSearchQuery(product);
  if (!keywords) return [];

  const params = {
    method: 'aliexpress.affiliate.product.query',
    app_key: process.env.ALIEXPRESS_APP_KEY,
    format: 'json',
    sign_method: 'hmac',
    timestamp: gmt8Timestamp(),
    v: '2.0',
    keywords,
    page_no: '1',
    page_size: '20',
    target_currency: process.env.ALIEXPRESS_TARGET_CURRENCY || 'RUB',
    target_language: process.env.ALIEXPRESS_TARGET_LANGUAGE || 'RU',
    ship_to_country: process.env.ALIEXPRESS_SHIP_TO_COUNTRY || 'RU',
    fields: 'product_id,product_title,product_detail_url,product_main_image_url,sale_price,sale_price_currency,target_sale_price,target_sale_price_currency,promotion_link,shop_id,shop_url'
  };

  if (process.env.ALIEXPRESS_TRACKING_ID) params.tracking_id = process.env.ALIEXPRESS_TRACKING_ID;
  if (process.env.ALIEXPRESS_APP_SIGNATURE) params.app_signature = process.env.ALIEXPRESS_APP_SIGNATURE;
  params.sign = signTopRequest(params, process.env.ALIEXPRESS_APP_SECRET);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const body = new URLSearchParams(params);
    const response = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'content-type': 'application/x-www-form-urlencoded;charset=utf-8',
        accept: 'application/json'
      },
      body,
      signal: controller.signal
    });

    if (!response.ok) return [];
    const payload = await response.json();
    const products = extractProducts(payload);

    return products
      .map((candidate) => ({ candidate, score: matchScore(product, candidate) }))
      .filter(({ score }) => score >= 0.52)
      .sort((a, b) => b.score - a.score || priceNumber(a.candidate) - priceNumber(b.candidate))
      .slice(0, limit)
      .map(({ candidate, score }) => toOffer(candidate, score));
  } catch {
    return [];
  } finally {
    clearTimeout(timer);
  }
}

export function signTopRequest(params, secret) {
  const text = Object.entries(params)
    .filter(([key, value]) => key !== 'sign' && value !== undefined && value !== null)
    .sort(([a], [b]) => a.localeCompare(b, 'en'))
    .map(([key, value]) => `${key}${value}`)
    .join('');

  return createHmac('md5', secret).update(text, 'utf8').digest('hex').toUpperCase();
}

function buildSearchQuery(product) {
  const identity = product?.identity || {};
  const parts = [identity.brand, identity.model, identity.variant].filter(Boolean);
  const value = parts.join(' ').replace(/\s+/g, ' ').trim() || product?.title || '';
  return value.slice(0, 180).trim();
}

function extractProducts(payload) {
  const response = payload?.aliexpress_affiliate_product_query_response;
  const result = response?.resp_result?.result;
  const products = result?.products?.product ?? result?.products ?? [];
  return Array.isArray(products) ? products : products ? [products] : [];
}

function toOffer(candidate, score) {
  const value = numberValue(candidate.target_sale_price ?? candidate.sale_price ?? candidate.app_sale_price);
  const currency = candidate.target_sale_price_currency
    || candidate.sale_price_currency
    || candidate.app_sale_price_currency
    || process.env.ALIEXPRESS_TARGET_CURRENCY
    || 'RUB';

  return {
    store: 'AliExpress',
    source: 'aliexpress.com',
    title: candidate.product_title || null,
    image: candidate.product_main_image_url || null,
    price: value === null ? null : { value, currency },
    available: null,
    url: candidate.promotion_link || candidate.product_detail_url || null,
    productId: candidate.product_id ? String(candidate.product_id) : null,
    shopId: candidate.shop_id ? String(candidate.shop_id) : null,
    shopUrl: candidate.shop_url || null,
    matchScore: Math.round(score * 100) / 100,
    provider: 'aliexpress-affiliate'
  };
}

function matchScore(product, candidate) {
  const expected = normalizeTokens(product?.identity?.canonicalName || product?.title || '');
  const actual = new Set(normalizeTokens(candidate?.product_title || ''));
  if (!expected.length || !actual.size) return 0;

  const brand = normalizeSimple(product?.identity?.brand || '');
  const title = normalizeSimple(candidate?.product_title || '');
  if (brand && !title.includes(brand)) return 0;

  const variantTokens = normalizeTokens(product?.identity?.variant || '').filter((token) => /\d/.test(token));
  if (variantTokens.length && variantTokens.some((token) => !actual.has(token))) return 0;

  let matchedWeight = 0;
  let totalWeight = 0;
  for (const token of expected) {
    const weight = /\d/.test(token) ? 2 : 1;
    totalWeight += weight;
    if (actual.has(token)) matchedWeight += weight;
  }
  return totalWeight ? matchedWeight / totalWeight : 0;
}

function normalizeTokens(value) {
  return [...new Set(normalizeSimple(value)
    .split(/\s+/)
    .filter((token) => token.length >= 2)
    .filter((token) => !STOP_WORDS.has(token)))];
}

function normalizeSimple(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[^a-zа-я0-9]+/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const STOP_WORDS = new Set([
  'купить','цена','характеристики','товар','смартфон','телефон','ноутбук','монитор','телевизор','наушники',
  'видеокарта','процессор','холодильник','стиральная','машина','ssd','для','with','the','and','new'
]);

function priceNumber(candidate) {
  return numberValue(candidate.target_sale_price ?? candidate.sale_price ?? candidate.app_sale_price) ?? Number.MAX_SAFE_INTEGER;
}

function numberValue(value) {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(String(value).replace(/[\s ]/g, '').replace(',', '.').replace(/[^\d.]/g, ''));
  return Number.isFinite(n) ? n : null;
}

function gmt8Timestamp(date = new Date()) {
  const shifted = new Date(date.getTime() + 8 * 60 * 60 * 1000);
  const pad = (value) => String(value).padStart(2, '0');
  return `${shifted.getUTCFullYear()}-${pad(shifted.getUTCMonth() + 1)}-${pad(shifted.getUTCDate())} ${pad(shifted.getUTCHours())}:${pad(shifted.getUTCMinutes())}:${pad(shifted.getUTCSeconds())}`;
}
