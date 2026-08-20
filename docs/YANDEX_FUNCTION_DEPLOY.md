# Specly → Yandex Cloud Function

Frontend: GitHub Pages.
Backend: Yandex Cloud Function для direct/reader fallback. Для защищённых магазинов основной production-вариант — Chromium Serverless Container из `browser-parser/Dockerfile`.

## Build deployment ZIP

From the repository root:

```bash
zip -r specly-yandex-function.zip \
  yandex-function.js \
  package.json \
  server/src
```

On PowerShell, if `zip` is unavailable:

```powershell
Compress-Archive -Path yandex-function.js,package.json,server -DestinationPath specly-yandex-function.zip -Force
```

The ZIP root must contain `yandex-function.js`, `package.json`, and the `server/` directory directly. Do not wrap them in an extra `Specly-main/` folder.

## Function version settings

- Runtime: Node.js 22
- Entry point: `yandex-function.handler`
- Memory: 256 MB or more
- Timeout: 30 seconds
- Public function: enabled

Optional offer providers are enabled by environment variables:

```text
YANDEX_MARKET_AFFILIATE_TOKEN=
YANDEX_MARKET_AUTH_KEY=
YANDEX_MARKET_PLACE_ID=
YANDEX_MARKET_CLID=
ALIEXPRESS_APP_KEY=
ALIEXPRESS_APP_SECRET=
ALIEXPRESS_TRACKING_ID=
ALIEXPRESS_APP_SIGNATURE=
ALIEXPRESS_TARGET_CURRENCY=RUB
ALIEXPRESS_TARGET_LANGUAGE=RU
ALIEXPRESS_SHIP_TO_COUNTRY=RU
```

## Verify deployed version

Open the function HTTPS URL in a browser. A current deployment returns JSON containing:

```json
{
  "ok": true,
  "service": "specly-parser-yandex",
  "version": "0.4.0-resolution-engine",
  "chromiumAvailable": false,
  "stores": [{ "id": "dns", "fetchStrategies": ["direct", "browser", "reader"] }]
}
```

Если version отличается, обслуживается старая ревизия. `chromiumAvailable: false` для Cloud Function ожидаем: Chromium запускается в отдельном Serverless Container.
