import test from 'node:test';
import assert from 'node:assert/strict';
import { fetchHtml } from '../src/fetchPage.js';

const CASES = [
  ['DNS', process.env.LIVE_DNS_URL || 'https://www.dns-shop.ru/product/7ea8826afd6cd9cb/67-smartfon-samsung-galaxy-a56-256-gb-cernyj/'],
  ['М.Видео', process.env.LIVE_MVIDEO_URL || 'https://www.mvideo.ru/products/smartfon-samsung-galaxy-a56-5g-8-256gb-seryi-30080790'],
  ['Ozon', process.env.LIVE_OZON_URL || 'https://www.ozon.ru/product/samsung-smartfon-galaxy-a56-5g-eu-global-8-256-gb-nano-sim-esim-rozovyy-2129618340/'],
  ['Яндекс Маркет', process.env.LIVE_YANDEX_URL || 'https://market.yandex.ru/card/smartfon-samsung-galaxy-a56-8256-gb-awesome-graphite/5411235954'],
  ['Wildberries', process.env.LIVE_WB_URL || 'https://www.wildberries.ru/catalog/497718851/detail.aspx'],
  ['Ситилинк', process.env.LIVE_CITILINK_URL || 'https://www.citilink.ru/product/smartfon-samsung-galaxy-s10-128gb-sm-g975f-chernyi-1124187/properties/'],
  ['ВсеИнструменты', process.env.LIVE_VI_URL || 'https://www.vseinstrumenti.ru/product/holodilnik-bosch-kgn39xi30u-13139071/']
];

for (const [name, url] of CASES) {
  test(`live direct fetch: ${name}`, { timeout: 25_000 }, async (context) => {
    try {
      const result = await fetchHtml(url, { allowReader: false, directTimeoutMs: 15_000 });
      assert.ok(result.html.length > 300);
      context.diagnostic(JSON.stringify({ store: name, outcome: 'html', status: result.status, bytes: result.html.length }));
    } catch (error) {
      const allowed = ['UPSTREAM_BLOCKED', 'UPSTREAM_HTTP_ERROR', 'UPSTREAM_TIMEOUT', 'UPSTREAM_NETWORK_ERROR', 'EMPTY_PAGE', 'UNEXPECTED_CONTENT_TYPE'];
      assert.ok(allowed.includes(error.code), `${name}: unexpected ${error.code || error.message}`);
      context.diagnostic(JSON.stringify({ store: name, outcome: error.code, attempts: error.details?.attempts || [] }));
    }
  });
}
