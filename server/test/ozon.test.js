import test from 'node:test';
import assert from 'node:assert/strict';
import { extractOzonSignals, parseOzon } from '../src/adapters/ozon.js';

const URL = 'https://www.ozon.ru/product/samsung-smartfon-galaxy-a56-5g-8-256-gb-2129618340/';

function fixture({ withStatePrice = true } = {}) {
  const product = {
    id: '2129618340',
    name: 'Смартфон Samsung Galaxy A56 5G 8/256 ГБ розовый',
    brand: 'Samsung',
    ...(withStatePrice ? { currentPrice: 54990 } : {}),
    rating: 4.8,
    reviewsCount: 1284,
    characteristics: [
      { name: 'Оперативная память', value: '8 ГБ' },
      { name: 'Встроенная память', value: '256 ГБ' },
      { name: 'Частота обновления экрана', value: '120 Гц' },
      { name: 'Вес', value: '198 г' }
    ]
  };

  return `<!doctype html><html><head>
<meta property="og:title" content="Смартфон Samsung Galaxy A56 5G 8/256 ГБ розовый — купить на Ozon">
</head><body>
<h1>Смартфон Samsung Galaxy A56 5G 8/256 ГБ розовый</h1>
<div data-widget="webPrice"><span>55 990 ₽</span></div>
<div data-widget="webReviewRating"><span>4,8</span></div>
<div data-widget="webReviewCount"><span>1 284 отзывов</span></div>
<script type="application/json">${JSON.stringify({ page: { product } })}</script>
</body></html>`;
}

test('Ozon extractor prioritizes exact product state and extracts metadata/spec lines', () => {
  const result = extractOzonSignals(fixture(), URL);
  assert.equal(result.productId, '2129618340');
  assert.deepEqual(result.price, { value: 54990, currency: 'RUB' });
  assert.equal(result.rating, 4.8);
  assert.equal(result.reviewCount, 1284);
  assert.ok(result.specLines.includes('Оперативная память'));
  assert.ok(result.specLines.includes('8 ГБ'));
  assert.equal(result.provider, 'ozon-embedded-state');
});

test('Ozon extractor falls back to webPrice widget when state has no price', () => {
  const result = extractOzonSignals(fixture({ withStatePrice: false }), URL);
  assert.deepEqual(result.price, { value: 55990, currency: 'RUB' });
});

test('Ozon adapter feeds embedded characteristics into universal normalization', async () => {
  const html = fixture();
  const product = await parseOzon(URL, {
    allowReader: false,
    directFetcher: async (url) => ({ html, finalUrl: url, via: 'direct', status: 200 })
  });

  assert.equal(product.store, 'Ozon');
  assert.equal(product.category, 'smartphone');
  assert.equal(product.productId, '2129618340');
  assert.equal(product.price.value, 54990);
  assert.equal(product.rating, 4.8);
  assert.equal(product.reviewCount, 1284);
  assert.equal(product.specs.ram_gb, 8);
  assert.equal(product.specs.storage_gb, 256);
  assert.equal(product.specs.display_refresh_hz, 120);
  assert.equal(product.specs.weight_g, 198);
});
