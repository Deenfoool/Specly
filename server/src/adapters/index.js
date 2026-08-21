import { validateProductUrl } from '../fetchPage.js';
import { detectCategory } from '../category.js';
import { buildProductIdentity } from '../identity.js';
import { findStoreByHost, supportedStores as registryStores } from '../stores.js';
import { parseDns } from './dns.js';
import { parseMvideo } from './mvideo.js';
import { parseOzon } from './ozon.js';
import { parseWildberries } from './wildberries.js';
import { parseGenericStore } from './generic.js';

const ADAPTERS = {
  dns: parseDns,
  mvideo: parseMvideo,
  ozon: parseOzon,
  wildberries: parseWildberries
};

export async function parseProduct(value, options = {}) {
  const url = validateProductUrl(value);
  const store = findStoreByHost(url.hostname);
  const parser = ADAPTERS[store.adapter];

  try {
    return parser
      ? await parser(url.href, options)
      : await parseGenericStore(url.href, store.name, store.id, options);
  } catch (error) {
    if (!isPartialEligible(error)) throw error;
    const partial = buildUrlIdentityProduct(url, store, error);
    if (!partial) throw error;
    return partial;
  }
}

export function buildUrlIdentityProduct(urlValue, store, error = null) {
  const url = urlValue instanceof URL ? urlValue : validateProductUrl(urlValue);
  const title = titleFromProductUrl(url, store.id);
  if (!title) return null;

  const detected = detectCategory({ title, lines: [] });
  const identity = buildProductIdentity({ title, jsonLd: urlIdentifiers(url, store.id), category: detected.category });
  return {
    store: store.name,
    source: url.hostname.replace(/^www\./, ''),
    url: url.href,
    title,
    image: null,
    price: null,
    available: null,
    category: detected.category,
    categoryConfidence: detected.confidence,
    identity,
    specs: {},
    specMeta: {},
    rawSpecs: {},
    specsStatus: 'unavailable',
    partial: true,
    resolvedBy: 'url-identity',
    errors: error ? [{
      code: error.code || 'PRODUCT_PARSE_FAILED',
      message: error.message,
      details: error.details || null
    }] : [],
    offers: [{
      store: store.name,
      source: url.hostname.replace(/^www\./, ''),
      price: null,
      available: null,
      url: url.href,
      match: 'source-url'
    }]
  };
}

export function supportedStores() {
  return registryStores();
}

function isPartialEligible(error) {
  return [
    'UPSTREAM_BLOCKED', 'EMPTY_PAGE', 'UPSTREAM_HTTP_ERROR', 'UPSTREAM_TIMEOUT',
    'UPSTREAM_NETWORK_ERROR', 'READER_UNAVAILABLE', 'READER_TIMEOUT',
    'UNEXPECTED_CONTENT_TYPE', 'PRODUCT_NOT_FOUND', 'PRODUCT_PARSE_FAILED',
    'WILDBERRIES_SEARCH_ERROR'
  ].includes(error?.code);
}

function titleFromProductUrl(url, storeId) {
  const parts = url.pathname.split('/').filter(Boolean);
  let slug = null;

  if (storeId === 'dns') slug = parts[2];
  else if (storeId === 'mvideo') slug = parts.at(-1)?.replace(/-\d{6,}$/, '');
  else if (storeId === 'ozon') slug = parts[1]?.replace(/-\d{6,}$/, '');
  else if (storeId === 'yandex-market') slug = parts[1];
  else if (storeId === 'citilink') slug = parts[1]?.replace(/-\d{5,}$/, '');
  else if (storeId === 'vseinstrumenti') slug = parts[1]?.replace(/-\d{5,}$/, '');
  else slug = parts.find((part) => /[a-zа-я].*[-_]/i.test(part));

  if (!slug || /^\d+$/.test(slug)) return null;
  const title = decodeURIComponent(slug)
    .replace(/\b(\d{1,3})-(\d{2,4})(gb|гб)\b/gi, '$1/$2 $3')
    .replace(/[-_]+/g, ' ')
    .replace(/\b(?:kupit|cena|price)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return title.length >= 8 ? title.replace(/^./, (letter) => letter.toUpperCase()) : null;
}

function urlIdentifiers(url, storeId) {
  const ids = url.pathname.match(/\d{5,}/g) || [];
  const sku = ids.at(-1) || null;
  return { sku, productID: sku, mpn: storeId === 'wildberries' ? sku : null };
}
