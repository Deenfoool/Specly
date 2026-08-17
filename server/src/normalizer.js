import { cleanText, findLabeledValue } from './html.js';

const DEFINITIONS = [
  { key: 'gpu', label: 'Графический процессор', aliases: ['Графический процессор', 'Видеокарта', 'GPU'], important: true, preference: 'neutral', parse: parseGpu },
  { key: 'video_memory_gb', label: 'Видеопамять', aliases: ['Объем видеопамяти', 'Объём видеопамяти', 'Видеопамять'], important: true, preference: 'higher', parse: parseGb, format: (v) => `${formatNumber(v)} ГБ`, unit: 'ГБ' },
  { key: 'memory_type', label: 'Тип памяти', aliases: ['Тип видеопамяти', 'Тип памяти'], important: true, preference: 'context', parse: parseMemoryType },
  { key: 'memory_bus_bit', label: 'Шина памяти', aliases: ['Разрядность шины памяти', 'Шина памяти'], important: true, preference: 'higher', parse: parseBit, format: (v) => `${formatNumber(v)} бит`, unit: 'бит' },
  { key: 'core_clock_mhz', label: 'Частота GPU', aliases: ['Частота графического процессора', 'Частота видеочипа', 'Частота GPU'], important: true, preference: 'context', parse: parseMhz, format: (v) => `${formatNumber(v)} МГц`, unit: 'МГц' },
  { key: 'memory_clock_mhz', label: 'Частота памяти', aliases: ['Частота памяти'], important: false, preference: 'context', parse: parseMhz, format: (v) => `${formatNumber(v)} МГц`, unit: 'МГц' },
  { key: 'tdp_w', label: 'Энергопотребление (TDP)', aliases: ['Энергопотребление', 'Потребляемая мощность', 'TDP'], important: true, preference: 'lower', parse: parseWatt, format: (v) => `${formatNumber(v)} Вт`, unit: 'Вт' },
  { key: 'power_connector', label: 'Доп. питание', aliases: ['Разъем питания', 'Разъём питания', 'Дополнительное питание'], important: true, preference: 'context', parse: textValue },
  { key: 'recommended_psu_w', label: 'Рекомендуемый БП', aliases: ['Рекомендуемая мощность БП', 'Рекомендуемая мощность блока питания'], important: true, preference: 'lower', parse: parseWatt, format: (v) => `${formatNumber(v)} Вт`, unit: 'Вт' },
  { key: 'pcie', label: 'Интерфейс', aliases: ['Интерфейс подключения', 'Интерфейс'], important: true, preference: 'context', parse: parsePcie },
  { key: 'length_mm', label: 'Длина', aliases: ['Длина'], important: true, preference: 'context', parse: parseMillimeters, format: (v) => `${formatNumber(v)} мм`, unit: 'мм' },
  { key: 'width_mm', label: 'Ширина', aliases: ['Ширина'], important: false, preference: 'context', parse: parseMillimeters, format: (v) => `${formatNumber(v)} мм`, unit: 'мм' },
  { key: 'height_mm', label: 'Высота', aliases: ['Высота'], important: false, preference: 'context', parse: parseMillimeters, format: (v) => `${formatNumber(v)} мм`, unit: 'мм' },
  { key: 'hdmi_count', label: 'HDMI', aliases: ['Выход HDMI', 'HDMI'], important: false, preference: 'higher', parse: parseCount, format: (v) => `${formatNumber(v)} шт.`, unit: 'шт.' },
  { key: 'displayport_count', label: 'DisplayPort', aliases: ['DisplayPort', 'Выход DisplayPort'], important: false, preference: 'higher', parse: parseCount, format: (v) => `${formatNumber(v)} шт.`, unit: 'шт.' }
];

export function normalizeGpuSpecs(lines, title = '') {
  const specs = {};
  const raw = {};

  for (const def of DEFINITIONS) {
    const source = findLabeledValue(lines, def.aliases);
    if (!source) continue;
    const value = def.parse(source);
    if (value !== null && value !== undefined && value !== '') {
      specs[def.key] = value;
      raw[def.key] = source;
    }
  }

  applySummaryFallbacks(specs, title, lines.join(' '));
  return { specs, raw };
}

export function buildComparison(productA, productB) {
  return DEFINITIONS
    .filter((def) => productA.specs[def.key] !== undefined || productB.specs[def.key] !== undefined)
    .map((def) => {
      const a = productA.specs[def.key];
      const b = productB.specs[def.key];
      const different = !sameValue(a, b);
      const winner = determineWinner(a, b, def.preference);
      return {
        key: def.key,
        label: def.label,
        values: [a ?? null, b ?? null],
        displayValues: [display(def, a), display(def, b)],
        different,
        important: def.important,
        preference: def.preference,
        winner,
        note: buildNote(def, a, b, winner, different)
      };
    });
}

export function buildSummary(comparison) {
  const diffs = comparison.filter((row) => row.different);
  if (!diffs.length) return 'По найденным характеристикам различий нет.';
  const important = diffs.filter((row) => row.important);
  const focus = (important.length ? important : diffs).slice(0, 4);
  const text = focus.map((row) => `${row.label}: ${row.note}`).join(' • ');
  return `${diffs.length} отличий. ${text}`;
}

function applySummaryFallbacks(specs, title, allText) {
  if (!specs.gpu) {
    const gpu = `${title} ${allText}`.match(/(?:GeForce\s+(?:RTX|GTX|GT)\s*\d{3,4}(?:\s*Ti|\s*SUPER)?|Radeon\s+RX\s*\d{3,4}(?:\s*XT|\s*GRE)?)/i);
    if (gpu) specs.gpu = cleanText(gpu[0]);
  }
  const memoryMatch = allText.match(/(\d+(?:[.,]\d+)?)\s*ГБ\s*(GDDR\dX?)/i);
  if (memoryMatch) {
    if (specs.video_memory_gb === undefined) specs.video_memory_gb = numberValue(memoryMatch[1]);
    if (!specs.memory_type) specs.memory_type = memoryMatch[2].toUpperCase();
  }
  if (specs.memory_bus_bit === undefined) {
    const m = allText.match(/(?:шина[^\d]{0,30})?(\d{2,4})\s*бит/i);
    if (m) specs.memory_bus_bit = numberValue(m[1]);
  }
  if (!specs.pcie) {
    const m = allText.match(/PCI(?:\s*Express|e)?\s*\d(?:\.\d)?/i);
    if (m) specs.pcie = parsePcie(m[0]);
  }
}

function display(def, value) {
  if (value === undefined || value === null || value === '') return '—';
  return def.format ? def.format(value) : String(value);
}

function sameValue(a, b) {
  if (a === undefined || a === null || b === undefined || b === null) return false;
  if (typeof a === 'number' && typeof b === 'number') return Math.abs(a - b) < 1e-9;
  return cleanText(a).toLowerCase() === cleanText(b).toLowerCase();
}

function determineWinner(a, b, preference) {
  if (a === undefined || a === null || b === undefined || b === null) return null;
  if (sameValue(a, b)) return null;
  if (!['higher', 'lower'].includes(preference) || typeof a !== 'number' || typeof b !== 'number') return null;
  if (preference === 'higher') return a > b ? 0 : 1;
  return a < b ? 0 : 1;
}

function buildNote(def, a, b, winner, different) {
  if (!different) return 'Одинаково';
  if (a === undefined || a === null) return 'Нет данных у первого товара';
  if (b === undefined || b === null) return 'Нет данных у второго товара';
  if (typeof a === 'number' && typeof b === 'number') {
    const delta = Math.abs(a - b);
    const formatted = def.unit ? `${formatNumber(delta)} ${def.unit}` : formatNumber(delta);
    if (winner === 0) return `Первый товар предпочтительнее по этому параметру; разница ${formatted}`;
    if (winner === 1) return `Второй товар предпочтительнее по этому параметру; разница ${formatted}`;
    return `Разница ${formatted}`;
  }
  return 'Значения отличаются';
}

function textValue(value) { return cleanText(value) || null; }
function parseGpu(value) {
  const text = cleanText(value);
  const match = text.match(/(?:GeForce\s+(?:RTX|GTX|GT)\s*\d{3,4}(?:\s*Ti|\s*SUPER)?|Radeon\s+RX\s*\d{3,4}(?:\s*XT|\s*GRE)?)/i);
  return match ? cleanText(match[0]) : text || null;
}
function parseGb(value) { return parseUnit(value, /([\d.,]+)\s*(?:гб|gb)/i); }
function parseBit(value) { return parseUnit(value, /([\d.,]+)\s*(?:бит|bit)/i); }
function parseMhz(value) {
  const matches = [...String(value).matchAll(/([\d.,]+)\s*(?:мгц|mhz)/gi)].map((m) => numberValue(m[1])).filter(Number.isFinite);
  return matches.length ? Math.max(...matches) : null;
}
function parseWatt(value) { return parseUnit(value, /([\d.,]+)\s*(?:вт|w)/i); }
function parseMemoryType(value) { return String(value).match(/GDDR\dX?/i)?.[0]?.toUpperCase() ?? textValue(value); }
function parsePcie(value) {
  const m = String(value).match(/PCI(?:\s*Express|e)?\s*(\d(?:\.\d)?)/i);
  return m ? `PCIe ${m[1]}` : textValue(value);
}
function parseMillimeters(value) {
  const n = numberValue(String(value).match(/[\d.,]+/)?.[0]);
  if (!Number.isFinite(n)) return null;
  if (/см/i.test(value)) return n * 10;
  if (/(?:^|\s)м(?:\s|$)/i.test(value) && !/мм|см/i.test(value)) return n * 1000;
  return n;
}
function parseCount(value) {
  const m = String(value).match(/(\d+)\s*(?:шт|x|×)?/i);
  return m ? Number(m[1]) : null;
}
function parseUnit(value, re) {
  const m = String(value).match(re);
  return m ? numberValue(m[1]) : null;
}
function numberValue(value) {
  const n = Number(String(value ?? '').replace(',', '.').replace(/\s/g, ''));
  return Number.isFinite(n) ? n : null;
}
function formatNumber(value) { return Number.isInteger(value) ? String(value) : String(Math.round(value * 100) / 100); }
