import { cleanText, decodeEntities, htmlToLines } from '../html.js';

export function extractDnsCharacteristicLines(html = '') {
  const pairs = [];

  const labels = extractClassTexts(html, isCharacteristicLabelClass);
  const values = extractClassTexts(html, isCharacteristicValueClass);
  for (let index = 0; index < Math.min(labels.length, values.length); index += 1) {
    addPair(pairs, labels[index], values[index]);
  }

  extractDefinitionPairs(html, pairs);
  extractTablePairs(html, pairs);

  const unique = dedupePairs(pairs);
  if (unique.length < 3) return htmlToLines(html);
  return unique.flatMap(({ label, value }) => [label, value]);
}

function extractClassTexts(html, matcher) {
  const values = [];
  const re = /<([a-z][\w:-]*)\b([^>]*\bclass=(['"])(.*?)\3[^>]*)>([\s\S]*?)<\/\1>/gi;
  let match;
  while ((match = re.exec(String(html))) && values.length < 800) {
    if (!matcher(match[4] || '')) continue;
    const text = cleanHtmlText(match[5]);
    if (text) values.push(text);
  }
  return values;
}

function isCharacteristicLabelClass(value) {
  const name = normalizeClass(value);
  return name.includes('product-characteristics__spec-title')
    || /characteristics.*(?:spec|item).*(?:title|name|label)/.test(name)
    || /(?:specification|parameter|property).*(?:title|name|label)/.test(name);
}

function isCharacteristicValueClass(value) {
  const name = normalizeClass(value);
  return name.includes('product-characteristics__spec-value')
    || /characteristics.*(?:spec|item).*value/.test(name)
    || /(?:specification|parameter|property).*value/.test(name);
}

function extractDefinitionPairs(html, pairs) {
  const re = /<dt\b[^>]*>([\s\S]*?)<\/dt>\s*<dd\b[^>]*>([\s\S]*?)<\/dd>/gi;
  let match;
  while ((match = re.exec(String(html))) && pairs.length < 800) {
    addPair(pairs, cleanHtmlText(match[1]), cleanHtmlText(match[2]));
  }
}

function extractTablePairs(html, pairs) {
  const rowRe = /<tr\b[^>]*>([\s\S]*?)<\/tr>/gi;
  let row;
  while ((row = rowRe.exec(String(html))) && pairs.length < 800) {
    const cells = [];
    const cellRe = /<(?:td|th)\b[^>]*>([\s\S]*?)<\/(?:td|th)>/gi;
    let cell;
    while ((cell = cellRe.exec(row[1])) && cells.length < 4) {
      const text = cleanHtmlText(cell[1]);
      if (text) cells.push(text);
    }
    if (cells.length >= 2) addPair(pairs, cells[0], cells[1]);
  }
}

function addPair(pairs, labelValue, valueValue) {
  const label = cleanText(labelValue || '');
  const value = cleanText(valueValue || '');
  if (!label || !value || label === value) return;
  if (label.length > 180 || value.length > 400) return;
  if (/^(?:характеристики|описание|отзывы|сравнение)$/i.test(label)) return;
  pairs.push({ label, value });
}

function dedupePairs(pairs) {
  const seen = new Set();
  const result = [];
  for (const pair of pairs) {
    const key = `${pair.label.toLowerCase()}\u0000${pair.value.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(pair);
  }
  return result;
}

function cleanHtmlText(value) {
  return cleanText(decodeEntities(String(value || '')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')));
}

function normalizeClass(value) {
  return String(value || '').toLowerCase().replace(/[_-]+/g, '-');
}
