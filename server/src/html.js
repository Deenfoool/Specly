const ENTITY_MAP = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', laquo: '«', raquo: '»'
};

export function decodeEntities(value = '') {
  return String(value)
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([\da-f]+);/gi, (_, code) => String.fromCodePoint(parseInt(code, 16)))
    .replace(/&([a-z]+);/gi, (match, name) => ENTITY_MAP[name.toLowerCase()] ?? match);
}

export function cleanText(value = '') {
  return decodeEntities(value).replace(/\s+/g, ' ').trim();
}

export function htmlToLines(html = '') {
  const text = String(html)
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(?:div|p|li|dt|dd|tr|td|th|span|section|article|h[1-6]|label|strong|b)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ');

  return decodeEntities(text)
    .split(/\n+/)
    .map(cleanText)
    .filter(Boolean)
    .filter((line) => line.length <= 500);
}

export function extractMeta(html, property) {
  const escaped = property.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const patterns = [
    new RegExp(`<meta[^>]+(?:property|name)=["']${escaped}["'][^>]+content=["']([^"']+)["'][^>]*>`, 'i'),
    new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${escaped}["'][^>]*>`, 'i')
  ];
  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match) return cleanText(match[1]);
  }
  return null;
}

export function extractTagText(html, tag) {
  const match = html.match(new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i'));
  if (!match) return null;
  return cleanText(match[1].replace(/<[^>]+>/g, ' '));
}

export function extractJsonLd(html) {
  const blocks = [];
  const re = /<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let match;
  while ((match = re.exec(html))) {
    const raw = decodeEntities(match[1]).trim();
    try {
      blocks.push(JSON.parse(raw));
    } catch {
      // Broken JSON-LD must not break the whole product parse.
    }
  }
  return blocks.flatMap(flattenJsonLd);
}

function flattenJsonLd(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value.flatMap(flattenJsonLd);
  if (typeof value !== 'object') return [];
  if (Array.isArray(value['@graph'])) return [value, ...value['@graph'].flatMap(flattenJsonLd)];
  return [value];
}

export function findProductJsonLd(html) {
  return extractJsonLd(html).find((item) => {
    const type = item?.['@type'];
    return type === 'Product' || (Array.isArray(type) && type.includes('Product'));
  }) ?? null;
}

export function findLabeledValue(lines, aliases) {
  const aliasSet = aliases.map(normalizeLabel);
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const normalized = normalizeLabel(line);
    for (const alias of aliasSet) {
      if (normalized === alias) return nextValue(lines, i + 1);
      if (normalized.startsWith(`${alias}:`)) {
        const value = cleanText(line.slice(line.indexOf(':') + 1));
        if (value) return value;
      }
      if (normalized.startsWith(`${alias} `)) {
        const rawAlias = aliases[aliasSet.indexOf(alias)];
        const value = cleanText(line.slice(rawAlias.length).replace(/^\s*[:—-]?\s*/, ''));
        if (value && value.length < 120) return value;
      }
    }
  }
  return null;
}

function nextValue(lines, start) {
  for (let i = start; i < Math.min(lines.length, start + 5); i += 1) {
    const value = cleanText(lines[i]);
    if (!value) continue;
    if (/^(характеристики|основные параметры|общие параметры|заводские данные)$/i.test(value)) continue;
    return value;
  }
  return null;
}

export function normalizeLabel(value = '') {
  return cleanText(value).toLowerCase().replace(/ё/g, 'е');
}
