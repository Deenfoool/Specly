# Specly → Yandex Cloud Function

Frontend: GitHub Pages.
Backend: Yandex Cloud Function для direct/reader и публичных JSON/API resolver'ов. Для защищённых магазинов production browser-path — Chromium Serverless Container из `browser-parser/Dockerfile`.

## Автоматическая сборка

В репозитории есть workflow `.github/workflows/build-deploy-artifacts.yml`.

На каждом push в `main` он:

1. запускает `npm test`;
2. собирает `specly-yandex-function.zip`;
3. проверяет `yandex-function.js` через `node --check`;
4. выполняет `docker build` Chromium parser'а;
5. собирает `specly-browser-parser-source.zip`;
6. публикует оба ZIP как GitHub Actions artifacts.

## Ручная сборка Function ZIP

Из корня репозитория:

```bash
zip -r specly-yandex-function.zip \
  yandex-function.js \
  package.json \
  server/src
```

Корень ZIP должен содержать непосредственно:

```text
yandex-function.js
package.json
server/src/...
```

Не добавляй внешний каталог `Specly-main/`.

## Настройки версии Yandex Cloud Function

- Runtime: Node.js 22
- Entry point: `yandex-function.handler`
- Memory: 256 MB или больше
- Timeout: 30 секунд
- Public function: enabled

При создании новой версии сохрани существующие секреты и env vars. Они привязаны к версии функции.

### Optional providers / tuning

```text
YANDEX_MARKET_AUTH_KEY=
YANDEX_MARKET_AFFILIATE_TOKEN=
YANDEX_MARKET_PLACE_ID=
YANDEX_MARKET_CLID=

ALIEXPRESS_APP_KEY=
ALIEXPRESS_APP_SECRET=
ALIEXPRESS_TRACKING_ID=
ALIEXPRESS_APP_SIGNATURE=
ALIEXPRESS_TARGET_CURRENCY=RUB
ALIEXPRESS_TARGET_LANGUAGE=RU
ALIEXPRESS_SHIP_TO_COUNTRY=RU

WILDBERRIES_DEST=-1257786
WILDBERRIES_CURRENCY=rub
WILDBERRIES_LANG=ru
WILDBERRIES_SEARCH_ENDPOINT=
WILDBERRIES_USER_AGENT=

JINA_API_KEY=
DIRECT_FETCH_USER_AGENT=
```

`WILDBERRIES_DEST` влияет на региональную цену и наличие. Не считай одну цену WB универсальной для всех пользователей.

## Проверка после деплоя

Открой HTTPS URL функции. Актуальная версия должна вернуть JSON примерно такого вида:

```json
{
  "ok": true,
  "service": "specly-parser-yandex",
  "version": "0.4.2-store-resolvers",
  "chromiumAvailable": false,
  "optionalProviders": {
    "wildberriesPublicSearch": true
  }
}
```

`chromiumAvailable: false` для Cloud Function ожидаем — Chromium запускается отдельно в Serverless Container.

Текущий frontend GitHub Pages использует существующий URL функции, поэтому при создании новой версии той же функции менять `app.js` не требуется.
