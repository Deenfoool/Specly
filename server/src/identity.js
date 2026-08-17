import { cleanText } from './html.js';

const BRANDS = [
  'Apple','Samsung','Xiaomi','Redmi','POCO','Huawei','Honor','Realme','OnePlus','Google','Nothing','Motorola','Nokia',
  'ASUS','Acer','Lenovo','HP','Dell','MSI','Gigabyte','Palit','Sapphire','PowerColor','AFOX','AMD','Intel','NVIDIA',
  'Sony','LG','Philips','TCL','Hisense','Haier','Bosch','Siemens','Electrolux','Indesit','Beko','Gorenje','Midea','Dyson',
  'JBL','Marshall','Sennheiser','Logitech','Razer','HyperX','Kingston','Crucial','Western Digital','Seagate'
];

export function buildProductIdentity({ title, jsonLd, category }) {
  const cleanedTitle = cleanText(title || '');
  const brand = cleanBrand(jsonLd?.brand) || detectBrand(cleanedTitle);
  const sku = cleanText(jsonLd?.sku || jsonLd?.mpn || jsonLd?.productID || '') || null;
  const model = cleanText(jsonLd?.model || jsonLd?.mpn || '') || inferModel(cleanedTitle, brand, category);
  const variant = inferVariant(cleanedTitle, category);

  return {
    category,
    brand: brand || null,
    model: model || cleanedTitle || null,
    variant,
    sku,
    canonicalName: [brand, model, variant].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim() || cleanedTitle
  };
}

function cleanBrand(value) {
  if (!value) return null;
  if (typeof value === 'string') return cleanText(value);
  if (typeof value === 'object') return cleanText(value.name || value.brand || '');
  return null;
}

function detectBrand(title) {
  const lower = title.toLowerCase();
  return BRANDS.find((brand) => lower.includes(brand.toLowerCase())) || null;
}

function inferModel(title, brand, category) {
  let value = title
    .replace(/^(характеристики|купить|цена)\s+/i, '')
    .replace(/^(видеокарта|процессор|смартфон|ноутбук|монитор|телевизор|наушники|холодильник|стиральная машина|ssd|планшет)\s+/i, '');
  if (brand) value = value.replace(new RegExp(`^${escapeRegExp(brand)}\\s+`, 'i'), '');
  value = value.replace(/\s*[|—-]\s*(?:DNS|М\.Видео|MVideo|Ozon|Wildberries|Ситилинк).*$/i, '');
  return cleanText(value);
}

function inferVariant(title, category) {
  const patterns = category === 'smartphone' || category === 'tablet' || category === 'laptop'
    ? [/(?:\d+\s*(?:GB|ГБ)\s*\/\s*)?\d+\s*(?:GB|ГБ)\b/i, /\b(?:128|256|512|1024)\s*(?:GB|ГБ)\b/i]
    : category === 'gpu'
      ? [/\b\d+\s*(?:GB|ГБ)\b/i]
      : category === 'ssd'
        ? [/\b(?:\d+\s*(?:GB|ГБ)|[1248]\s*(?:TB|ТБ))\b/i]
        : [];

  for (const pattern of patterns) {
    const match = title.match(pattern);
    if (match) return cleanText(match[0]);
  }
  return null;
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
