import { supportedStores } from './stores.js';
import { getOfferProviderStatus } from './offers/index.js';
import { getYandexMarketConfigStatus } from './offers/yandexMarket.js';

export const SERVICE_VERSION = '0.4.3-browser-proxy';

export function getDiagnostics({ service = 'specly-parser', chromiumAvailable = false } = {}) {
  return {
    ok: true,
    service,
    version: SERVICE_VERSION,
    chromiumAvailable: Boolean(chromiumAvailable),
    stores: supportedStores(),
    optionalProviders: {
      ...getOfferProviderStatus(),
      yandexMarket: getYandexMarketConfigStatus()
    }
  };
}
