import test from 'node:test';
import assert from 'node:assert/strict';
import { detectCategory } from '../src/category.js';
import { compareUrls } from '../src/compare.js';
import { FetchError, validateRedirect } from '../src/fetchPage.js';
import { buildProductIdentity, isExactIdentityMatch, scoreIdentityMatch } from '../src/identity.js';
import { findStoreByHost, supportedStores } from '../src/stores.js';
import { normalizeProductSpecs } from '../src/universalNormalizer.js';
import { parseCommonProduct } from '../src/adapters/common.js';

const phoneHtml = (title, ram, storage) => `<!doctype html><html><head>
<meta property="og:title" content="${title}">
<script type="application/ld+json">{"@type":"Product","name":"${title}","brand":{"name":"Samsung"},"sku":"${storage}"}</script>
</head><body><h1>${title}</h1>
<div>Оперативная память</div><div>${ram} ГБ</div>
<div>Встроенная память</div><div>${storage} ГБ</div>
<div>Частота обновления экрана</div><div>120 Гц</div>
<div>Вес</div><div>198 г</div></body></html>`;

test('store registry is the single source for supported hosts and strategies', () => {
  assert.equal(findStoreByHost('www.dns-shop.ru')?.id, 'dns');
  assert.equal(findStoreByHost('market.yandex.ru')?.supportsOfficialApi, true);
  assert.ok(supportedStores().every((store) => store.fetchStrategies.includes('browser')));
  assert.equal(findStoreByHost('example.com'), null);
});

test('redirect validation allows aliases of one store and rejects cross-store redirects', () => {
  assert.equal(
    validateRedirect('https://dns-shop.ru/product/a/test/', 'https://www.dns-shop.ru/product/a/test/').hostname,
    'www.dns-shop.ru'
  );
  assert.throws(
    () => validateRedirect('https://dns-shop.ru/product/a/test/', 'https://www.mvideo.ru/products/test-123456'),
    (error) => error.code === 'BAD_REDIRECT'
  );
});

test('detects and normalizes an appliance profile', () => {
  const lines = ['Общий объём', '366 л', 'Объём морозильной камеры', '87 л', 'Уровень шума', '38 дБ', 'No Frost', 'да'];
  const detected = detectCategory({ title: 'Холодильник Bosch KGN39XI30U', lines });
  const normalized = normalizeProductSpecs({ category: detected.category, lines });
  assert.equal(detected.category, 'refrigerator');
  assert.equal(normalized.specs.total_volume_l, 366);
  assert.equal(normalized.specs.freezer_volume_l, 87);
  assert.equal(normalized.specs.no_frost, 'Да');
});

test('extracts Citilink product identity from Next.js hydration state', () => {
  const state = {
    props: { initialState: { productPage: { productHeader: { payload: { productBase: {
      id: '1124187',
      name: 'Смартфон Samsung Galaxy S10+ 8/128 ГБ черный',
      brand: { name: 'SAMSUNG' },
      category: { name: 'Смартфоны' },
      searchDescription: 'SM-G975FZKDSER',
      isAvailable: false,
      properties: [{ name: 'Оперативная память', value: '8 ГБ' }, { name: 'Встроенная память', value: '128 ГБ' }]
    } } } } } }
  };
  const html = `<html><head><script id="__NEXT_DATA__" type="application/json">${JSON.stringify(state)}</script></head><body>Карточка товара</body></html>`;
  const product = parseCommonProduct({
    html,
    url: 'https://www.citilink.ru/product/smartfon-samsung-galaxy-s10-1124187/properties/',
    store: 'Ситилинк',
    storeId: 'citilink',
    fetchInfo: { via: 'browser', attempts: [] }
  });
  assert.equal(product.category, 'smartphone');
  assert.equal(product.identity.identifiers.sku, '1124187');
  assert.equal(product.identity.identifiers.mpn, 'SM-G975FZKDSER');
  assert.equal(product.specs.ram_gb, 8);
  assert.equal(product.specs.storage_gb, 128);
});

test('exact identity keeps storage and RAM variants separate', () => {
  const base = buildProductIdentity({ title: 'Смартфон Samsung Galaxy A56 5G 8/256 ГБ Graphite', category: 'smartphone' });
  const same = buildProductIdentity({ title: 'Samsung Galaxy A56 5G 8/256GB черный', category: 'smartphone' });
  const otherStorage = buildProductIdentity({ title: 'Samsung Galaxy A56 5G 8/128GB черный', category: 'smartphone' });
  assert.equal(base.attributes.storageGb, 256);
  assert.equal(base.attributes.ramGb, 8);
  assert.ok(isExactIdentityMatch(base, same));
  assert.equal(scoreIdentityMatch(base, otherStorage), 0);
});

test('browser fetch response is mapped through the universal comparison engine', async () => {
  const result = await compareUrls([
    'https://www.mvideo.ru/products/samsung-galaxy-a56-8-256gb-30080790',
    'https://www.mvideo.ru/products/samsung-galaxy-a56-12-256gb-30080791'
  ], {
    allowDirect: false,
    allowReader: false,
    browserFetcher: async (url) => ({
      html: url.endsWith('790')
        ? phoneHtml('Смартфон Samsung Galaxy A56 5G 8/256 ГБ серый', 8, 256)
        : phoneHtml('Смартфон Samsung Galaxy A56 5G 12/256 ГБ розовый', 12, 256),
      finalUrl: url,
      via: 'browser',
      status: 200
    }),
    offerOptions: { providers: [] }
  });

  assert.equal(result.category, 'smartphone');
  assert.equal(result.status, 'complete');
  assert.ok(result.comparison.some((row) => row.key === 'ram_gb' && row.winner === 1));
  assert.ok(result.products.every((product) => product.resolvedBy === 'browser'));
});

test('blocked product and rejected offer provider produce a partial comparison instead of 500', async () => {
  const result = await compareUrls([
    'https://www.mvideo.ru/products/samsung-galaxy-a56-8-256gb-30080790',
    'https://www.mvideo.ru/products/samsung-galaxy-a56-8-128gb-30080791'
  ], {
    allowDirect: false,
    allowReader: false,
    browserFetcher: async (url) => {
      if (url.endsWith('791')) throw new FetchError('UPSTREAM_BLOCKED', 'blocked for test', { status: 403 });
      return { html: phoneHtml('Смартфон Samsung Galaxy A56 5G 8/256 ГБ серый', 8, 256), finalUrl: url, via: 'browser', status: 200 };
    },
    offerOptions: {
      providers: [
        { id: 'blocked-offers', resolve: async () => { throw new Error('provider blocked'); } },
        { id: 'empty-offers', resolve: async () => [] }
      ]
    }
  });

  assert.equal(result.status, 'partial');
  assert.equal(result.products[1].resolvedBy, 'url-identity');
  assert.equal(result.products[1].specsStatus, 'unavailable');
  assert.ok(result.errors.some((error) => error.code === 'OFFERS_UNAVAILABLE'));
  assert.ok(result.errors.some((error) => error.code === 'UPSTREAM_BLOCKED'));
});
