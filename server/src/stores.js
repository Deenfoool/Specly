const STORE_DEFINITIONS = [
  store('dns', 'DNS', ['dns-shop.ru', 'www.dns-shop.ru'], {
    adapter: 'dns',
    fetchStrategies: ['direct', 'browser', 'reader'],
    productPaths: [/^\/product\/(?!characteristics\/)/i]
  }),
  store('mvideo', 'М.Видео', ['mvideo.ru', 'www.mvideo.ru'], {
    adapter: 'mvideo',
    fetchStrategies: ['direct', 'browser', 'reader'],
    productPaths: [/^\/products\//i]
  }),
  store('ozon', 'Ozon', ['ozon.ru', 'www.ozon.ru'], {
    adapter: 'ozon',
    fetchStrategies: ['direct', 'browser', 'reader'],
    productPaths: [/^\/product\//i]
  }),
  store('yandex-market', 'Яндекс Маркет', ['market.yandex.ru', 'www.market.yandex.ru'], {
    fetchStrategies: ['official-api', 'direct', 'browser', 'reader'],
    supportsOfficialApi: true,
    productPaths: [/^\/card\//i, /^\/product--/i]
  }),
  store('wildberries', 'Wildberries', ['wildberries.ru', 'www.wildberries.ru'], {
    fetchStrategies: ['direct', 'browser', 'reader'],
    productPaths: [/^\/catalog\/\d+\/detail\.aspx/i]
  }),
  store('citilink', 'Ситилинк', ['citilink.ru', 'www.citilink.ru'], {
    fetchStrategies: ['direct', 'browser', 'reader'],
    productPaths: [/^\/product\//i]
  }),
  store('megamarket', 'Мегамаркет', ['megamarket.ru', 'www.megamarket.ru'], {
    fetchStrategies: ['direct', 'browser', 'reader']
  }),
  store('vseinstrumenti', 'ВсеИнструменты', ['vseinstrumenti.ru', 'www.vseinstrumenti.ru'], {
    fetchStrategies: ['direct', 'browser', 'reader'],
    productPaths: [/^\/product\//i]
  }),
  store('eldorado', 'Эльдорадо', ['eldorado.ru', 'www.eldorado.ru'], {
    fetchStrategies: ['direct', 'browser', 'reader']
  }),
  store('aliexpress', 'AliExpress', ['aliexpress.ru', 'www.aliexpress.ru'], {
    fetchStrategies: ['official-api', 'direct', 'browser', 'reader'],
    supportsOfficialApi: true
  })
];

export const STORES = Object.freeze(STORE_DEFINITIONS);

export function findStoreByHost(hostname) {
  const host = String(hostname || '').toLowerCase().replace(/\.$/, '');
  return STORES.find((item) => item.hosts.includes(host)) || null;
}

export function findStoreByUrl(value) {
  try {
    return findStoreByHost(new URL(value).hostname);
  } catch {
    return null;
  }
}

export function getStore(id) {
  return STORES.find((item) => item.id === id) || null;
}

export function supportedStores() {
  return STORES.map((item) => ({
    id: item.id,
    name: item.name,
    hosts: [...item.hosts],
    adapter: item.adapter,
    fetchStrategies: [...item.fetchStrategies],
    supportsDirectFetch: item.supportsDirectFetch,
    supportsBrowser: item.supportsBrowser,
    supportsOfficialApi: item.supportsOfficialApi
  }));
}

function store(id, name, hosts, options = {}) {
  const fetchStrategies = options.fetchStrategies || ['direct', 'browser', 'reader'];
  return Object.freeze({
    id,
    name,
    hosts: Object.freeze([...hosts]),
    adapter: options.adapter || 'generic',
    fetchStrategies: Object.freeze([...fetchStrategies]),
    supportsDirectFetch: fetchStrategies.includes('direct'),
    supportsBrowser: fetchStrategies.includes('browser'),
    supportsOfficialApi: Boolean(options.supportsOfficialApi),
    productPaths: Object.freeze([...(options.productPaths || [])])
  });
}
