import { validateProductUrl } from '../fetchPage.js';
import { resolveYandexMarketProduct } from '../offers/yandexMarket.js';
import { parseDns } from './dns.js';
import { parseMvideo } from './mvideo.js';
import { parseGenericStore } from './generic.js';

const STORES = [
  { hosts: ['dns-shop.ru', 'www.dns-shop.ru'], name: 'DNS', parser: parseDns },
  { hosts: ['mvideo.ru', 'www.mvideo.ru'], name: 'М.Видео', parser: parseMvideo },
  { hosts: ['ozon.ru', 'www.ozon.ru'], name: 'Ozon' },
  { hosts: ['market.yandex.ru'], name: 'Яндекс Маркет', parser: resolveYandexMarketProduct },
  { hosts: ['wildberries.ru', 'www.wildberries.ru'], name: 'Wildberries' },
  { hosts: ['citilink.ru', 'www.citilink.ru'], name: 'Ситилинк' },
  { hosts: ['megamarket.ru', 'www.megamarket.ru'], name: 'Мегамаркет' },
  { hosts: ['vseinstrumenti.ru', 'www.vseinstrumenti.ru'], name: 'ВсеИнструменты' },
  { hosts: ['eldorado.ru', 'www.eldorado.ru'], name: 'Эльдорадо' },
  { hosts: ['aliexpress.ru', 'www.aliexpress.ru'], name: 'AliExpress' }
];

export async function parseProduct(value) {
  const url = validateProductUrl(value);
  const host = url.hostname.toLowerCase();
  const store = STORES.find((item) => item.hosts.includes(host));

  if (!store) {
    const error = new Error('Магазин пока не поддерживается');
    error.code = 'UNSUPPORTED_STORE';
    throw error;
  }

  if (store.parser) return store.parser(url.href);
  return parseGenericStore(url.href, store.name);
}

export function supportedStores() {
  return STORES.map(({ name, hosts, parser }) => ({
    name,
    hosts: [...hosts],
    adapter: parser ? 'specialized' : 'generic'
  }));
}
