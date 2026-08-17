import { cleanText, findLabeledValue, normalizeLabel } from './html.js';
import { normalizeGpuSpecs } from './normalizer.js';

const COMMON = [
  def('weight_g', 'Вес', ['Вес', 'Масса'], false, 'lower', parseWeight, 'г'),
  def('width_mm', 'Ширина', ['Ширина'], false, 'context', parseLength, 'мм'),
  def('height_mm', 'Высота', ['Высота'], false, 'context', parseLength, 'мм'),
  def('depth_mm', 'Глубина', ['Глубина'], false, 'context', parseLength, 'мм'),
  def('length_mm', 'Длина', ['Длина'], false, 'context', parseLength, 'мм'),
  def('warranty_months', 'Гарантия', ['Гарантия', 'Срок гарантии'], false, 'higher', parseMonths, 'мес.')
];

const PROFILES = {
  smartphone: [
    def('display_size_in', 'Диагональ экрана', ['Диагональ экрана', 'Диагональ'], true, 'context', parseInches, '″'),
    def('display_refresh_hz', 'Частота экрана', ['Частота обновления экрана', 'Частота обновления', 'Частота экрана'], true, 'higher', parseHz, 'Гц'),
    def('ram_gb', 'Оперативная память', ['Оперативная память', 'Объем оперативной памяти', 'Объём оперативной памяти', 'RAM'], true, 'higher', parseGb, 'ГБ'),
    def('storage_gb', 'Встроенная память', ['Встроенная память', 'Объем встроенной памяти', 'Объём встроенной памяти', 'Память'], true, 'higher', parseStorageGb, 'ГБ'),
    def('battery_mah', 'Аккумулятор', ['Емкость аккумулятора', 'Ёмкость аккумулятора', 'Аккумулятор'], true, 'higher', parseMah, 'мА·ч'),
    def('main_camera_mp', 'Основная камера', ['Основная камера', 'Разрешение основной камеры'], false, 'context', parseMp, 'Мп'),
    def('nfc', 'NFC', ['NFC'], false, 'neutral', parseBoolean),
    def('wireless_charging', 'Беспроводная зарядка', ['Беспроводная зарядка'], false, 'neutral', parseBoolean)
  ],
  laptop: [
    def('display_size_in', 'Диагональ экрана', ['Диагональ экрана', 'Диагональ'], true, 'context', parseInches, '″'),
    def('display_refresh_hz', 'Частота экрана', ['Частота обновления экрана', 'Частота обновления'], false, 'higher', parseHz, 'Гц'),
    def('ram_gb', 'Оперативная память', ['Оперативная память', 'Объем оперативной памяти', 'Объём оперативной памяти', 'RAM'], true, 'higher', parseGb, 'ГБ'),
    def('storage_gb', 'Накопитель', ['Объем SSD', 'Объём SSD', 'Объем накопителя', 'Объём накопителя', 'SSD'], true, 'higher', parseStorageGb, 'ГБ'),
    def('cpu_model', 'Процессор', ['Модель процессора', 'Процессор'], true, 'context', textValue),
    def('gpu_model', 'Видеокарта', ['Модель видеокарты', 'Видеокарта', 'Графический ускоритель'], true, 'context', textValue),
    def('battery_wh', 'Аккумулятор', ['Емкость аккумулятора', 'Ёмкость аккумулятора'], false, 'higher', parseWh, 'Вт·ч')
  ],
  cpu: [
    def('cores', 'Ядра', ['Количество ядер', 'Число ядер', 'Ядра'], true, 'higher', parseCount, 'шт.'),
    def('threads', 'Потоки', ['Количество потоков', 'Число потоков', 'Потоки'], true, 'higher', parseCount, 'шт.'),
    def('base_clock_ghz', 'Базовая частота', ['Базовая частота', 'Тактовая частота'], true, 'context', parseGhz, 'ГГц'),
    def('boost_clock_ghz', 'Максимальная частота', ['Максимальная частота', 'Turbo частота', 'Частота в турбо режиме'], true, 'context', parseGhz, 'ГГц'),
    def('tdp_w', 'TDP', ['TDP', 'Тепловыделение', 'Энергопотребление'], true, 'lower', parseWatt, 'Вт'),
    def('socket', 'Сокет', ['Сокет', 'Разъем процессора', 'Разъём процессора'], true, 'context', textValue)
  ],
  monitor: [
    def('display_size_in', 'Диагональ', ['Диагональ экрана', 'Диагональ'], true, 'context', parseInches, '″'),
    def('resolution', 'Разрешение', ['Разрешение экрана', 'Максимальное разрешение', 'Разрешение'], true, 'context', parseResolution),
    def('refresh_hz', 'Частота обновления', ['Частота обновления', 'Максимальная частота обновления'], true, 'higher', parseHz, 'Гц'),
    def('response_ms', 'Время отклика', ['Время отклика', 'Отклик'], true, 'lower', parseMs, 'мс'),
    def('brightness_nits', 'Яркость', ['Яркость'], false, 'higher', parseNits, 'кд/м²'),
    def('panel_type', 'Тип матрицы', ['Тип матрицы', 'Технология матрицы'], true, 'context', textValue)
  ],
  tv: [
    def('display_size_in', 'Диагональ', ['Диагональ экрана', 'Диагональ'], true, 'context', parseInches, '″'),
    def('resolution', 'Разрешение', ['Разрешение экрана', 'Разрешение'], true, 'context', parseResolution),
    def('refresh_hz', 'Частота обновления', ['Частота обновления', 'Частота экрана'], true, 'higher', parseHz, 'Гц'),
    def('panel_type', 'Технология экрана', ['Технология экрана', 'Тип матрицы', 'Тип экрана'], true, 'context', textValue),
    def('smart_tv', 'Smart TV', ['Smart TV', 'Смарт ТВ'], false, 'neutral', parseBoolean),
    def('hdmi_count', 'HDMI', ['Количество HDMI', 'HDMI'], false, 'higher', parseCount, 'шт.')
  ],
  ssd: [
    def('capacity_gb', 'Объём', ['Объем накопителя', 'Объём накопителя', 'Объем SSD', 'Объём SSD', 'Емкость', 'Ёмкость'], true, 'higher', parseStorageGb, 'ГБ'),
    def('interface', 'Интерфейс', ['Интерфейс', 'Интерфейс подключения'], true, 'context', textValue),
    def('read_mbps', 'Скорость чтения', ['Скорость чтения', 'Максимальная скорость чтения'], true, 'higher', parseMbps, 'МБ/с'),
    def('write_mbps', 'Скорость записи', ['Скорость записи', 'Максимальная скорость записи'], true, 'higher', parseMbps, 'МБ/с'),
    def('form_factor', 'Форм-фактор', ['Форм-фактор'], false, 'context', textValue)
  ],
  headphones: [
    def('connection', 'Подключение', ['Тип подключения', 'Подключение'], true, 'context', textValue),
    def('battery_hours', 'Автономность', ['Время работы', 'Время автономной работы'], true, 'higher', parseHours, 'ч'),
    def('anc', 'Шумоподавление', ['Активное шумоподавление', 'Шумоподавление', 'ANC'], true, 'neutral', parseBoolean),
    def('frequency_min_hz', 'Мин. частота', ['Минимальная воспроизводимая частота', 'Минимальная частота'], false, 'lower', parseHz, 'Гц'),
    def('frequency_max_hz', 'Макс. частота', ['Максимальная воспроизводимая частота', 'Максимальная частота'], false, 'higher', parseHz, 'Гц')
  ],
  refrigerator: [
    def('total_volume_l', 'Общий объём', ['Общий объем', 'Общий объём', 'Объем холодильника', 'Объём холодильника'], true, 'higher', parseLiters, 'л'),
    def('freezer_volume_l', 'Объём морозильника', ['Объем морозильной камеры', 'Объём морозильной камеры'], false, 'higher', parseLiters, 'л'),
    def('noise_db', 'Уровень шума', ['Уровень шума', 'Шум'], true, 'lower', parseDb, 'дБ'),
    def('energy_class', 'Класс энергопотребления', ['Класс энергопотребления', 'Класс энергоэффективности'], true, 'context', textValue),
    def('no_frost', 'No Frost', ['No Frost', 'Система No Frost'], false, 'neutral', parseBoolean)
  ],
  'washing-machine': [
    def('load_kg', 'Загрузка белья', ['Максимальная загрузка', 'Загрузка белья', 'Макс. загрузка'], true, 'higher', parseKg, 'кг'),
    def('spin_rpm', 'Скорость отжима', ['Скорость отжима', 'Максимальная скорость отжима'], true, 'higher', parseRpm, 'об/мин'),
    def('noise_db', 'Уровень шума', ['Уровень шума', 'Шум'], false, 'lower', parseDb, 'дБ'),
    def('energy_class', 'Класс энергопотребления', ['Класс энергопотребления', 'Класс энергоэффективности'], true, 'context', textValue),
    def('drying', 'Сушка', ['Сушка', 'Функция сушки'], true, 'neutral', parseBoolean)
  ],
  'vacuum-cleaner': [
    def('power_w', 'Мощность', ['Мощность', 'Потребляемая мощность'], true, 'context', parseWatt, 'Вт'),
    def('suction_w', 'Мощность всасывания', ['Мощность всасывания'], true, 'higher', parseWatt, 'Вт'),
    def('dust_l', 'Контейнер', ['Объем пылесборника', 'Объём пылесборника', 'Объем контейнера', 'Объём контейнера'], false, 'higher', parseLiters, 'л'),
    def('battery_minutes', 'Автономность', ['Время работы от аккумулятора', 'Время работы'], true, 'higher', parseMinutes, 'мин')
  ]
};

export function normalizeProductSpecs({ category = 'generic', lines = [], title = '' }) {
  const specs = {};
  const raw = {};
  const meta = {};

  if (category === 'gpu') {
    const gpu = normalizeGpuSpecs(lines, title);
    Object.assign(specs, gpu.specs);
    Object.assign(raw, gpu.raw);
    for (const [key, value] of Object.entries(gpu.specs)) {
      meta[key] = legacyGpuMeta(key, value);
    }
  }

  const definitions = [...(PROFILES[category] || []), ...COMMON];
  applyDefinitions(definitions, lines, specs, raw, meta);
  applyGenericPairs(lines, specs, raw, meta);

  return { specs, raw, meta };
}

export function buildUniversalComparison(productA, productB) {
  const mixed = productA.category && productB.category && productA.category !== productB.category;
  const keys = [...new Set([...Object.keys(productA.specs || {}), ...Object.keys(productB.specs || {})])];

  return keys
    .filter((key) => !mixed || (productA.specs?.[key] !== undefined && productB.specs?.[key] !== undefined))
    .map((key) => {
      const a = productA.specs?.[key];
      const b = productB.specs?.[key];
      const definition = productA.specMeta?.[key] || productB.specMeta?.[key] || genericMeta(key);
      const different = !sameValue(a, b);
      const winner = determineWinner(a, b, definition.preference);
      return {
        key,
        label: definition.label,
        values: [a ?? null, b ?? null],
        displayValues: [display(definition, a), display(definition, b)],
        different,
        important: Boolean(definition.important),
        preference: definition.preference || 'neutral',
        winner,
        note: buildNote(definition, a, b, winner, different)
      };
    })
    .sort((a, b) => Number(b.important) - Number(a.important) || a.label.localeCompare(b.label, 'ru'));
}

export function buildUniversalSummary(comparison, { mixed = false } = {}) {
  if (!comparison.length) {
    return mixed
      ? 'Товары относятся к разным категориям. Общих сопоставимых характеристик пока не найдено.'
      : 'Не удалось найти сопоставимые характеристики.';
  }
  const diffs = comparison.filter((row) => row.different);
  if (!diffs.length) return 'По найденным характеристикам различий нет.';
  const focus = (diffs.filter((row) => row.important).length ? diffs.filter((row) => row.important) : diffs).slice(0, 4);
  const prefix = mixed ? 'Товары разных категорий. ' : '';
  return `${prefix}${diffs.length} отличий. ${focus.map((row) => `${row.label}: ${row.note}`).join(' • ')}`;
}

function applyDefinitions(definitions, lines, specs, raw, meta) {
  for (const definition of definitions) {
    if (specs[definition.key] !== undefined) continue;
    const source = findLabeledValue(lines, definition.aliases);
    if (!source) continue;
    const value = definition.parse(source);
    if (value === null || value === undefined || value === '') continue;
    specs[definition.key] = value;
    raw[definition.key] = source;
    meta[definition.key] = definition;
  }
}

function applyGenericPairs(lines, specs, raw, meta) {
  const seen = new Set();
  for (let i = 0; i < lines.length - 1 && seen.size < 80; i += 1) {
    const label = cleanText(lines[i]);
    const value = cleanText(lines[i + 1]);
    if (!looksLikeLabel(label) || !looksLikeValue(value)) continue;
    const normalized = normalizeLabel(label).replace(/[:：]$/, '');
    const key = `generic:${slug(normalized)}`;
    if (seen.has(key) || specs[key] !== undefined) continue;
    seen.add(key);
    specs[key] = value;
    raw[key] = value;
    meta[key] = { key, label: cleanText(label.replace(/[:：]$/, '')), important: false, preference: 'neutral', format: String };
  }
}

function looksLikeLabel(value) {
  if (value.length < 2 || value.length > 70) return false;
  if (/https?:\/\/|₽|руб\.?|\d{4,}/i.test(value)) return false;
  if (/^(купить|в корзину|доставка|отзывы|описание|характеристики|похожие товары|главная)$/i.test(value)) return false;
  return /[а-яa-z]/i.test(value);
}

function looksLikeValue(value) {
  if (!value || value.length > 120 || /https?:\/\//i.test(value)) return false;
  return /\d|да$|нет$|есть$|отсутствует$|gb|гб|tb|тб|мм|см|кг|г\b|вт|гц|hz|ips|oled|amoled|va\b|tn\b|usb|hdmi|wi-?fi|bluetooth|no frost/i.test(value);
}

function def(key, label, aliases, important, preference, parse, unit = null) {
  return { key, label, aliases, important, preference, parse, unit, format: unit ? (value) => `${formatNumber(value)} ${unit}` : String };
}

function legacyGpuMeta(key) {
  const known = {
    gpu: ['Графический процессор', true, 'neutral'], video_memory_gb: ['Видеопамять', true, 'higher', 'ГБ'],
    memory_type: ['Тип памяти', true, 'context'], memory_bus_bit: ['Шина памяти', true, 'higher', 'бит'],
    core_clock_mhz: ['Частота GPU', true, 'context', 'МГц'], memory_clock_mhz: ['Частота памяти', false, 'context', 'МГц'],
    tdp_w: ['Энергопотребление (TDP)', true, 'lower', 'Вт'], power_connector: ['Доп. питание', true, 'context'],
    recommended_psu_w: ['Рекомендуемый БП', true, 'lower', 'Вт'], pcie: ['Интерфейс', true, 'context'],
    length_mm: ['Длина', true, 'context', 'мм'], width_mm: ['Ширина', false, 'context', 'мм'], height_mm: ['Высота', false, 'context', 'мм'],
    hdmi_count: ['HDMI', false, 'higher', 'шт.'], displayport_count: ['DisplayPort', false, 'higher', 'шт.']
  };
  const [label, important, preference, unit] = known[key] || [humanizeKey(key), false, 'neutral', null];
  return { key, label, important, preference, unit, format: unit ? (value) => `${formatNumber(value)} ${unit}` : String };
}

function genericMeta(key) {
  return { key, label: key.startsWith('generic:') ? humanizeKey(key.slice(8)) : humanizeKey(key), important: false, preference: 'neutral', format: String };
}

function display(definition, value) {
  if (value === undefined || value === null || value === '') return '—';
  return definition.format ? definition.format(value) : String(value);
}

function sameValue(a, b) {
  if (a === undefined || a === null || b === undefined || b === null) return false;
  if (typeof a === 'number' && typeof b === 'number') return Math.abs(a - b) < 1e-9;
  return normalizeLabel(a) === normalizeLabel(b);
}

function determineWinner(a, b, preference) {
  if (a === undefined || a === null || b === undefined || b === null || sameValue(a, b)) return null;
  if (!['higher', 'lower'].includes(preference) || typeof a !== 'number' || typeof b !== 'number') return null;
  return preference === 'higher' ? (a > b ? 0 : 1) : (a < b ? 0 : 1);
}

function buildNote(definition, a, b, winner, different) {
  if (!different) return 'Одинаково';
  if (a === undefined || a === null) return 'Нет данных у первого товара';
  if (b === undefined || b === null) return 'Нет данных у второго товара';
  if (typeof a === 'number' && typeof b === 'number') {
    const delta = Math.abs(a - b);
    const formatted = definition.unit ? `${formatNumber(delta)} ${definition.unit}` : formatNumber(delta);
    if (winner === 0) return `Первый товар предпочтительнее; разница ${formatted}`;
    if (winner === 1) return `Второй товар предпочтительнее; разница ${formatted}`;
    return `Разница ${formatted}`;
  }
  return 'Значения отличаются';
}

function textValue(value) { return cleanText(value) || null; }
function parseBoolean(value) {
  const text = normalizeLabel(value);
  if (/^(да|есть|поддерживается|имеется|yes|true)$/.test(text)) return 'Да';
  if (/^(нет|отсутствует|не поддерживается|no|false)$/.test(text)) return 'Нет';
  return cleanText(value) || null;
}
function parseCount(value) { return firstNumber(value); }
function parseGb(value) { return unitNumber(value, /([\d.,]+)\s*(?:гб|gb)/i); }
function parseStorageGb(value) {
  const tb = unitNumber(value, /([\d.,]+)\s*(?:тб|tb)/i);
  if (tb !== null) return tb * 1024;
  return parseGb(value);
}
function parseWatt(value) { return unitNumber(value, /([\d.,]+)\s*(?:вт|w)/i); }
function parseWh(value) { return unitNumber(value, /([\d.,]+)\s*(?:вт[·* ]?ч|wh)/i); }
function parseHz(value) { return unitNumber(value, /([\d.,]+)\s*(?:гц|hz)/i); }
function parseGhz(value) {
  const ghz = unitNumber(value, /([\d.,]+)\s*(?:ггц|ghz)/i);
  if (ghz !== null) return ghz;
  const mhz = unitNumber(value, /([\d.,]+)\s*(?:мгц|mhz)/i);
  return mhz === null ? null : mhz / 1000;
}
function parseMah(value) { return unitNumber(value, /([\d.,]+)\s*(?:ма[·* ]?ч|mah)/i); }
function parseMp(value) { return unitNumber(value, /([\d.,]+)\s*(?:мп|mp)/i); }
function parseMs(value) { return unitNumber(value, /([\d.,]+)\s*(?:мс|ms)/i); }
function parseNits(value) { return unitNumber(value, /([\d.,]+)\s*(?:кд\/?м²|нит|nits?)/i); }
function parseMbps(value) { return unitNumber(value, /([\d.,]+)\s*(?:мб\/?с|mb\/?s)/i); }
function parseLiters(value) { return unitNumber(value, /([\d.,]+)\s*(?:л|l)\b/i); }
function parseDb(value) { return unitNumber(value, /([\d.,]+)\s*(?:дб|db)/i); }
function parseKg(value) { return unitNumber(value, /([\d.,]+)\s*(?:кг|kg)/i); }
function parseRpm(value) { return unitNumber(value, /([\d.,]+)\s*(?:об\/?мин|rpm)/i); }
function parseHours(value) { return unitNumber(value, /([\d.,]+)\s*(?:ч|час|hours?|h)\b/i); }
function parseMinutes(value) { return unitNumber(value, /([\d.,]+)\s*(?:мин|minutes?)/i); }
function parseInches(value) { return unitNumber(value, /([\d.,]+)\s*(?:″|"|дюйм|inch)/i) ?? firstNumber(value); }
function parseWeight(value) {
  const kg = unitNumber(value, /([\d.,]+)\s*(?:кг|kg)/i);
  if (kg !== null) return kg * 1000;
  return unitNumber(value, /([\d.,]+)\s*(?:г|g)\b/i);
}
function parseLength(value) {
  const mm = unitNumber(value, /([\d.,]+)\s*(?:мм|mm)/i); if (mm !== null) return mm;
  const cm = unitNumber(value, /([\d.,]+)\s*(?:см|cm)/i); if (cm !== null) return cm * 10;
  const m = unitNumber(value, /([\d.,]+)\s*(?:м|m)\b/i); return m === null ? null : m * 1000;
}
function parseMonths(value) {
  const months = unitNumber(value, /([\d.,]+)\s*(?:мес|месяц)/i); if (months !== null) return months;
  const years = unitNumber(value, /([\d.,]+)\s*(?:год|года|лет)/i); return years === null ? null : years * 12;
}
function parseResolution(value) {
  const match = String(value).match(/\b(\d{3,5})\s*[x×х]\s*(\d{3,5})\b/i);
  return match ? `${match[1]}×${match[2]}` : cleanText(value) || null;
}
function firstNumber(value) {
  const match = String(value).match(/[\d]+(?:[.,]\d+)?/);
  return match ? numberValue(match[0]) : null;
}
function unitNumber(value, pattern) {
  const match = String(value).match(pattern);
  return match ? numberValue(match[1]) : null;
}
function numberValue(value) {
  const n = Number(String(value ?? '').replace(/[\s ]/g, '').replace(',', '.').replace(/[^\d.-]/g, ''));
  return Number.isFinite(n) ? n : null;
}
function slug(value) {
  return normalizeLabel(value).replace(/[^a-zа-я0-9]+/gi, '_').replace(/^_+|_+$/g, '').slice(0, 80) || 'field';
}
function humanizeKey(value) { return cleanText(String(value).replace(/[_-]+/g, ' ')).replace(/^./, (c) => c.toUpperCase()); }
function formatNumber(value) { return Number.isInteger(value) ? String(value) : String(Math.round(value * 100) / 100); }
