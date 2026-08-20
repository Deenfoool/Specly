import { cleanText } from './html.js';

const BRANDS = [
  'Apple','Samsung','Xiaomi','Redmi','POCO','Huawei','Honor','Realme','OnePlus','Google','Nothing','Motorola','Nokia',
  'ASUS','Acer','Lenovo','HP','Dell','MSI','Gigabyte','Palit','Sapphire','PowerColor','AFOX','AMD','Intel','NVIDIA',
  'Sony','LG','Philips','TCL','Hisense','Haier','Bosch','Siemens','Electrolux','Indesit','Beko','Gorenje','Midea','Dyson',
  'JBL','Marshall','Sennheiser','Logitech','Razer','HyperX','Kingston','Crucial','Western Digital','Seagate'
];

const COLORS = [
  ['черный', /\b(?:черн(?:ый|ого)|black|graphite|графит)\b/i],
  ['белый', /\b(?:бел(?:ый|ого)|white)\b/i],
  ['серый', /\b(?:сер(?:ый|ого)|gray|grey|lightgray|silver|серебрист(?:ый|ого))\b/i],
  ['розовый', /\b(?:розов(?:ый|ого)|pink)\b/i],
  ['зеленый', /\b(?:зелен(?:ый|ого)|зелён(?:ый|ого)|green|olive)\b/i],
  ['синий', /\b(?:син(?:ий|его)|blue)\b/i],
  ['красный', /\b(?:красн(?:ый|ого)|red)\b/i]
];

export function buildProductIdentity({ title, jsonLd, category }) {
  const cleanedTitle = cleanText(title || '');
  const brand = cleanBrand(jsonLd?.brand) || detectBrand(cleanedTitle);
  const attributes = inferAttributes(cleanedTitle, category);
  const identifiers = {
    sku: cleanIdentifier(jsonLd?.sku || jsonLd?.productID),
    mpn: cleanIdentifier(jsonLd?.mpn),
    gtin: cleanIdentifier(jsonLd?.gtin || jsonLd?.gtin13 || jsonLd?.gtin14 || jsonLd?.ean),
    article: cleanIdentifier(jsonLd?.article || jsonLd?.vendorCode)
  };
  const explicitModel = cleanText(jsonLd?.model || '');
  const model = explicitModel || inferModel(cleanedTitle, brand, category, attributes);
  const variant = formatVariant(attributes, category);

  return {
    category,
    brand: brand || null,
    model: model || cleanedTitle || null,
    variant,
    sku: identifiers.sku || identifiers.mpn || null,
    identifiers,
    attributes,
    canonicalName: [brand, model, variant].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim() || cleanedTitle
  };
}

export function scoreIdentityMatch(expected, candidate) {
  if (!expected || !candidate) return 0;
  if (expected.category && candidate.category && expected.category !== candidate.category) return 0;

  const strong = strongIdentifierMatch(expected.identifiers, candidate.identifiers);
  if (strong === false) return 0;
  if (strong === true) return variantsCompatible(expected.attributes, candidate.attributes) ? 1 : 0;

  const expectedBrand = normalize(expected.brand);
  const candidateBrand = normalize(candidate.brand);
  if (expectedBrand && candidateBrand && expectedBrand !== candidateBrand) return 0;
  if (!variantsCompatible(expected.attributes, candidate.attributes)) return 0;

  const expectedTokens = modelTokens(expected.model || expected.canonicalName);
  const candidateTokens = new Set(modelTokens(candidate.model || candidate.canonicalName));
  if (!expectedTokens.length || !candidateTokens.size) return 0;
  let matched = 0;
  let total = 0;
  for (const token of expectedTokens) {
    const weight = /\d/.test(token) ? 2 : 1;
    total += weight;
    if (candidateTokens.has(token)) matched += weight;
  }
  const modelScore = total ? matched / total : 0;
  const brandScore = expectedBrand && candidateBrand ? 0.15 : 0.05;
  const variantScore = sharedVariantCount(expected.attributes, candidate.attributes) ? 0.15 : 0;
  return Math.min(1, modelScore * 0.75 + brandScore + variantScore);
}

export function isExactIdentityMatch(expected, candidate, threshold = 0.78) {
  return scoreIdentityMatch(expected, candidate) >= threshold;
}

function cleanBrand(value) {
  if (!value) return null;
  if (typeof value === 'string') return cleanText(value);
  if (typeof value === 'object') return cleanText(value.name || value.brand || '');
  return null;
}

function cleanIdentifier(value) {
  const text = cleanText(value || '');
  return text || null;
}

function detectBrand(title) {
  const lower = title.toLowerCase();
  return BRANDS.find((brand) => lower.includes(brand.toLowerCase())) || null;
}

function inferModel(title, brand, category, attributes) {
  let value = title
    .replace(/^(?:характеристики|купить|цена)\s+/i, '')
    .replace(/^(?:видеокарта|процессор|смартфон|мобильный телефон|ноутбук|монитор|телевизор|наушники|холодильник|стиральная машина|ssd|планшет)\s+/i, '');
  if (brand) value = value.replace(new RegExp(`^${escapeRegExp(brand)}\\s+`, 'i'), '');
  value = value.replace(/\s*[|—]\s*(?:DNS|М\.Видео|MVideo|Ozon|Wildberries|Ситилинк).*$/i, '');

  if (['smartphone', 'tablet', 'laptop'].includes(category)) {
    value = value
      .replace(/\b\d+\s*(?:GB|ГБ)?\s*[\/]\s*\d+\s*(?:GB|ГБ)(?![a-zа-я])/ig, ' ')
      .replace(/\b(?:64|128|256|512|1024)\s*(?:GB|ГБ)(?![a-zа-я])/ig, ' ');
  } else if (category === 'gpu') {
    value = value.replace(/\b\d+\s*(?:GB|ГБ)(?![a-zа-я])/ig, ' ');
  } else if (category === 'ssd') {
    value = value.replace(/\b(?:\d+\s*(?:GB|ГБ)|[1248]\s*(?:TB|ТБ))(?![a-zа-я])/ig, ' ');
  }

  if (attributes.color) {
    for (const [, pattern] of COLORS) value = value.replace(new RegExp(pattern.source, pattern.flags), ' ');
  }
  return cleanText(value.replace(/[,()]\s*$/g, '').replace(/\s+/g, ' '));
}

function inferAttributes(title, category) {
  const memoryPair = title.match(/\b(\d{1,3})\s*(?:GB|ГБ)?\s*[\/]\s*(\d{2,4})\s*(?:GB|ГБ)(?![a-zа-я])/i);
  const singleStorage = title.match(/\b(64|128|256|512|1024)\s*(?:GB|ГБ)(?![a-zа-я])/i);
  const gpuMemory = category === 'gpu' ? title.match(/\b(\d{1,2})\s*(?:GB|ГБ)(?![a-zа-я])/i) : null;
  const ssd = category === 'ssd' ? title.match(/\b(\d+(?:[.,]\d+)?)\s*(TB|ТБ|GB|ГБ)(?![a-zа-я])/i) : null;
  const color = COLORS.find(([, pattern]) => pattern.test(title))?.[0] || null;
  return {
    ramGb: memoryPair ? Number(memoryPair[1]) : null,
    storageGb: memoryPair ? Number(memoryPair[2]) : singleStorage && ['smartphone', 'tablet', 'laptop'].includes(category) ? Number(singleStorage[1]) : null,
    gpuMemoryGb: gpuMemory ? Number(gpuMemory[1]) : null,
    capacityGb: ssd ? Math.round(Number(ssd[1].replace(',', '.')) * (/тб|tb/i.test(ssd[2]) ? 1024 : 1)) : null,
    color
  };
}

function formatVariant(attributes, category) {
  if (attributes.ramGb && attributes.storageGb) return `${attributes.ramGb}/${attributes.storageGb} ГБ`;
  if (attributes.storageGb) return `${attributes.storageGb} ГБ`;
  if (category === 'gpu' && attributes.gpuMemoryGb) return `${attributes.gpuMemoryGb} ГБ`;
  if (category === 'ssd' && attributes.capacityGb) return `${attributes.capacityGb} ГБ`;
  return null;
}

function strongIdentifierMatch(a = {}, b = {}) {
  for (const key of ['gtin', 'mpn', 'article']) {
    const left = normalize(a?.[key]);
    const right = normalize(b?.[key]);
    if (!left || !right) continue;
    return left === right;
  }
  return null;
}

function variantsCompatible(a = {}, b = {}) {
  for (const key of ['ramGb', 'storageGb', 'gpuMemoryGb', 'capacityGb']) {
    if (a?.[key] != null && b?.[key] != null && Number(a[key]) !== Number(b[key])) return false;
  }
  return true;
}

function sharedVariantCount(a = {}, b = {}) {
  return ['ramGb', 'storageGb', 'gpuMemoryGb', 'capacityGb']
    .filter((key) => a?.[key] != null && b?.[key] != null && Number(a[key]) === Number(b[key])).length;
}

function modelTokens(value) {
  return [...new Set(normalize(value).split(' ').filter((token) => token.length >= 2 && !STOP_WORDS.has(token)))];
}

function normalize(value) {
  return String(value || '').toLowerCase().replace(/ё/g, 'е').replace(/[^a-zа-я0-9]+/gi, ' ').replace(/\s+/g, ' ').trim();
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const STOP_WORDS = new Set(['смартфон', 'телефон', 'ноутбук', 'видеокарта', 'монитор', 'телевизор', 'холодильник', 'купить', 'цена']);
