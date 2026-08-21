import test from 'node:test';
import assert from 'node:assert/strict';
import { buildProductIdentity } from '../src/identity.js';
import { parseWildberries } from '../src/adapters/wildberries.js';
import { getWildberriesProductById, searchWildberriesOffers } from '../src/offers/wildberries.js';

const payload = {
  products: [
    {
      id: 497718851,
      brand: 'Samsung',
      name: 'Смартфон Samsung Galaxy A56 5G 8/256 ГБ графит',
      rating: 5,
      reviewRating: 4.8,
      feedbacks: 1284,
      totalQuantity: 7,
      supplier: 'Samsung Store',
      supplierRating: 4.9,
      sizes: [{ price: { basic: 5999000, product: 4999000 } }]
    },
    {
      id: 497718852,
      brand: 'Samsung',
      name: 'Смартфон Samsung Galaxy A56 5G 8/128 ГБ графит',
      rating: 5,
      feedbacks: 900,
      totalQuantity: 12,
      sizes: [{ price: { basic: 4999000, product: 3999000 } }]
    },
    {
      id: 497718853,
      brand: 'Samsung',
      name: 'Смартфон Samsung Galaxy A55 5G 8/256 ГБ графит',
      rating: 5,
      feedbacks: 500,
      totalQuantity: 2,
      sizes: [{ price: { basic: 4599000, product: 4299000 } }]
    }
  ]
};

function mockFetch(assertUrl = null) {
  return async (url) => {
    if (assertUrl) assertUrl(url instanceof URL ? url : new URL(url));
    return {
      ok: true,
      status: 200,
      json: async () => payload
    };
  };
}

test('Wildberries search uses regional dest and converts kopecks to rubles', async () => {
  const record = await getWildberriesProductById('497718851', {
    endpoint: 'https://search.wb.ru/exactmatch/ru/common/v18/search',
    dest: '-777',
    fetchImpl: mockFetch((url) => {
      assert.equal(url.searchParams.get('query'), '497718851');
      assert.equal(url.searchParams.get('dest'), '-777');
      assert.equal(url.searchParams.get('curr'), 'rub');
      assert.equal(url.searchParams.get('resultset'), 'catalog');
    })
  });

  assert.equal(record.id, '497718851');
  assert.equal(record.price.value, 49990);
  assert.equal(record.originalPrice.value, 59990);
  assert.equal(record.available, true);
  assert.equal(record.reviewCount, 1284);
  assert.equal(record.offer.regionDest, '-777');
});

test('Wildberries offer matching rejects another storage variant', async () => {
  const identity = buildProductIdentity({
    title: 'Смартфон Samsung Galaxy A56 5G 8/256 ГБ графит',
    category: 'smartphone'
  });
  const product = {
    store: 'М.Видео',
    url: 'https://www.mvideo.ru/products/smartfon-samsung-galaxy-a56-5g-8-256gb-seryi-30080790',
    title: 'Смартфон Samsung Galaxy A56 5G 8/256 ГБ графит',
    category: 'smartphone',
    identity
  };

  const offers = await searchWildberriesOffers(product, {
    endpoint: 'https://search.wb.ru/exactmatch/ru/common/v18/search',
    fetchImpl: mockFetch()
  });

  assert.equal(offers.length, 1);
  assert.equal(offers[0].productId, '497718851');
  assert.equal(offers[0].price.value, 49990);
  assert.equal(offers[0].provider, 'wildberries-public-search');
  assert.ok(offers[0].matchScore >= 0.78);
  assert.ok(!offers.some((offer) => offer.productId === '497718852'));
});

test('Wildberries product URL resolves metadata without Chromium when search JSON has the nmId', async () => {
  const product = await parseWildberries('https://www.wildberries.ru/catalog/497718851/detail.aspx', {
    wildberriesOptions: {
      endpoint: 'https://search.wb.ru/exactmatch/ru/common/v18/search',
      fetchImpl: mockFetch()
    }
  });

  assert.equal(product.store, 'Wildberries');
  assert.equal(product.productId, '497718851');
  assert.equal(product.price.value, 49990);
  assert.equal(product.category, 'smartphone');
  assert.equal(product.identity.attributes.ramGb, 8);
  assert.equal(product.identity.attributes.storageGb, 256);
  assert.equal(product.resolvedBy, 'wildberries-public-search');
  assert.equal(product.partial, true);
});
