import test from 'node:test';
import assert from 'node:assert/strict';
import { htmlToLines } from '../src/html.js';
import { normalizeGpuSpecs, buildComparison } from '../src/normalizer.js';
import { toCharacteristicsUrl, extractProductCandidates } from '../src/adapters/dns.js';

const mvideoFixture = `
<html><body><h1>Видеокарта MSI GeForce GTX 1060 6GT OCV1</h1>
<div>Объем видеопамяти</div><div>6 ГБ</div>
<div>Тип видеопамяти</div><div>GDDR5</div>
<div>Разрядность шины памяти</div><div>192 Бит</div>
<div>Частота графического процессора</div><div>1759 МГц</div>
<div>Рекомендуемая мощность БП</div><div>400 Вт</div>
<div>Длина</div><div>24.3 см</div></body></html>`;

const dnsFixture = `
<html><body><h1>Характеристики Видеокарта AFOX AMD Radeon RX 580 2048SP</h1>
<li>Графический процессор</li><li>Radeon RX 580</li>
<li>Интерфейс</li><li>PCIe 3.0</li>
<li>Частота видеочипа</li><li>от 1168 МГц до 1244 МГц</li>
<li>Видеопамять</li><li>8 ГБ GDDR5</li>
<li>Шина памяти</li><li>256 бит</li></body></html>`;

test('normalizes M.Video GPU specs', () => {
  const { specs } = normalizeGpuSpecs(htmlToLines(mvideoFixture), 'Видеокарта MSI GeForce GTX 1060 6GT OCV1');
  assert.equal(specs.gpu, 'GeForce GTX 1060');
  assert.equal(specs.video_memory_gb, 6);
  assert.equal(specs.memory_type, 'GDDR5');
  assert.equal(specs.memory_bus_bit, 192);
  assert.equal(specs.core_clock_mhz, 1759);
  assert.equal(specs.recommended_psu_w, 400);
  assert.equal(specs.length_mm, 243);
});

test('normalizes DNS GPU specs and uses highest clock from a range', () => {
  const { specs } = normalizeGpuSpecs(htmlToLines(dnsFixture), 'Видеокарта AFOX AMD Radeon RX 580 2048SP');
  assert.equal(specs.gpu, 'Radeon RX 580');
  assert.equal(specs.video_memory_gb, 8);
  assert.equal(specs.memory_type, 'GDDR5');
  assert.equal(specs.memory_bus_bit, 256);
  assert.equal(specs.core_clock_mhz, 1244);
  assert.equal(specs.pcie, 'PCIe 3.0');
});

test('builds comparison with a winner only where direction makes sense', () => {
  const a = normalizeGpuSpecs(htmlToLines(dnsFixture), 'RX 580');
  const b = normalizeGpuSpecs(htmlToLines(mvideoFixture), 'GTX 1060');
  const rows = buildComparison({ specs: a.specs }, { specs: b.specs });
  const vram = rows.find((row) => row.key === 'video_memory_gb');
  const gpu = rows.find((row) => row.key === 'gpu');
  assert.equal(vram.winner, 0);
  assert.equal(vram.different, true);
  assert.equal(gpu.winner, null);
});

test('converts DNS product URL to characteristics URL', () => {
  assert.equal(
    toCharacteristicsUrl('https://www.dns-shop.ru/product/abc/card-name/'),
    'https://www.dns-shop.ru/product/characteristics/abc/card-name/'
  );
});

test('extracts candidate products from DNS catalog HTML', () => {
  const html = '<a href="/product/abc/videokarta-test/">Видеокарта Test RX 580</a>';
  assert.deepEqual(extractProductCandidates(html), [
    { title: 'Видеокарта Test RX 580', url: 'https://www.dns-shop.ru/product/abc/videokarta-test/' }
  ]);
});
