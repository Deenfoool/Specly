import test from 'node:test';
import assert from 'node:assert/strict';
import { parseDns, dnsBrowserSessionKey } from '../src/adapters/dns.js';
import { extractDnsCharacteristicLines } from '../src/adapters/dnsStructured.js';

const productUrl = 'https://www.dns-shop.ru/product/7ea8826afd6cd9cb/67-smartfon-samsung-galaxy-a56-256-gb-cernyj/';

const mainHtml = `<!doctype html><html><head>
<script type="application/ld+json">{
  "@type":"Product",
  "name":"Смартфон Samsung Galaxy A56 5G 8/256 ГБ черный",
  "brand":{"name":"Samsung"},
  "sku":"7ea8826afd6cd9cb"
}</script>
<meta property="og:title" content="Смартфон Samsung Galaxy A56 5G 8/256 ГБ черный">
</head><body><h1>Смартфон Samsung Galaxy A56 5G 8/256 ГБ черный</h1></body></html>`;

const characteristicsHtml = `<!doctype html><html><body>
<h1>Характеристики Смартфон Samsung Galaxy A56 5G 8/256 ГБ черный</h1>
<div class="product-characteristics__spec-title">Оперативная память</div>
<div class="product-characteristics__spec-value">8 ГБ</div>
<div class="product-characteristics__spec-title">Встроенная память</div>
<div class="product-characteristics__spec-value">256 ГБ</div>
<div class="product-characteristics__spec-title">Частота обновления экрана</div>
<div class="product-characteristics__spec-value">120 Гц</div>
<div class="product-characteristics__spec-title">Вес</div>
<div class="product-characteristics__spec-value">198 г</div>
</body></html>`;

test('DNS characteristics extractor preserves label/value ordering', () => {
  const lines = extractDnsCharacteristicLines(characteristicsHtml);
  assert.deepEqual(lines.slice(0, 8), [
    'Оперативная память', '8 ГБ',
    'Встроенная память', '256 ГБ',
    'Частота обновления экрана', '120 Гц',
    'Вес', '198 г'
  ]);
});

test('DNS product and characteristics URLs share one browser session key', () => {
  assert.equal(dnsBrowserSessionKey(productUrl), 'dns:7ea8826afd6cd9cb');
  assert.equal(
    dnsBrowserSessionKey('https://www.dns-shop.ru/product/characteristics/7ea8826afd6cd9cb/67-smartfon-samsung-galaxy-a56-256-gb-cernyj/'),
    'dns:7ea8826afd6cd9cb'
  );
});

test('DNS parser reuses browser session and consumes structured characteristics', async () => {
  const calls = [];
  const product = await parseDns(productUrl, {
    allowDirect: false,
    allowReader: false,
    browserFetcher: async (url, context = {}) => {
      calls.push({ url, sessionKey: context.sessionKey });
      return {
        html: url.includes('/product/characteristics/') ? characteristicsHtml : mainHtml,
        finalUrl: url,
        via: 'browser',
        status: 200
      };
    }
  });

  assert.equal(calls.length, 2);
  assert.equal(calls[0].sessionKey, 'dns:7ea8826afd6cd9cb');
  assert.equal(calls[1].sessionKey, calls[0].sessionKey);
  assert.equal(product.category, 'smartphone');
  assert.equal(product.specs.ram_gb, 8);
  assert.equal(product.specs.storage_gb, 256);
  assert.equal(product.specs.display_refresh_hz, 120);
  assert.equal(product.specs.weight_g, 198);
});
