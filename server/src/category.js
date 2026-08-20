import { cleanText, normalizeLabel } from './html.js';

const CATEGORY_RULES = [
  ['gpu', [/видеокарт/i, /\bvideokart/i, /graphics card/i, /geforce\s+(?:rtx|gtx|gt)/i, /radeon\s+rx/i]],
  ['cpu', [/процессор/i, /processor/i, /\b(?:ryzen|core\s+i[3579]|xeon|celeron|pentium)\b/i]],
  ['smartphone', [/смартфон/i, /\bsmartfon/i, /мобильн(?:ый|ого) телефон/i, /smartphone/i, /\biphone\b/i, /\bgalaxy\s+[asz]/i]],
  ['laptop', [/ноутбук/i, /\bnoutbuk/i, /laptop/i, /ультрабук/i, /macbook/i]],
  ['monitor', [/монитор/i, /monitor/i]],
  ['tv', [/телевизор/i, /\btelevizor/i, /\btv\b/i, /smart tv/i]],
  ['ssd', [/\bssd\b/i, /твердотельн/i, /solid state/i]],
  ['headphones', [/наушник/i, /гарнитур/i, /headphones?/i, /headset/i]],
  ['refrigerator', [/холодильник/i, /\bholodilnik/i, /refrigerator/i]],
  ['washing-machine', [/стиральн(?:ая|ой) машин/i, /washer/i, /washing machine/i]],
  ['vacuum-cleaner', [/пылесос/i, /vacuum/i]],
  ['microwave', [/микроволнов/i, /свч/i, /microwave/i]],
  ['dishwasher', [/посудомоеч/i, /dishwasher/i]],
  ['tablet', [/планшет/i, /\bipad\b/i, /tablet/i]],
  ['camera', [/фотоаппарат/i, /камера/i, /camera/i]],
  ['router', [/маршрутизатор/i, /роутер/i, /router/i]],
  ['keyboard', [/клавиатур/i, /keyboard/i]],
  ['mouse', [/мышь/i, /mouse/i]],
  ['speaker', [/акустик/i, /колонк/i, /speaker/i]]
];

export function detectCategory({ title = '', lines = [], jsonLd = null } = {}) {
  const explicit = categoryFromJsonLd(jsonLd);
  const haystack = cleanText([title, ...lines.slice(0, 500)].join(' '));
  let best = { category: explicit || 'generic', score: explicit ? 8 : 0, evidence: explicit ? ['json-ld'] : [] };

  for (const [category, patterns] of CATEGORY_RULES) {
    let score = 0;
    const evidence = [];
    for (const pattern of patterns) {
      if (pattern.test(title)) {
        score += 5;
        evidence.push(`title:${pattern.source}`);
      } else if (pattern.test(haystack)) {
        score += 2;
        evidence.push(`page:${pattern.source}`);
      }
    }
    if (score > best.score) best = { category, score, evidence };
  }

  return {
    category: best.score >= 2 ? best.category : 'generic',
    confidence: Math.min(1, best.score / 10),
    evidence: best.evidence
  };
}

function categoryFromJsonLd(jsonLd) {
  const value = normalizeLabel(jsonLd?.category || '');
  if (!value) return null;
  for (const [category, patterns] of CATEGORY_RULES) {
    if (patterns.some((pattern) => pattern.test(value))) return category;
  }
  return null;
}
