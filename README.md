# Specly

**Сравнивай товары, а не вкладки.**

Specly — универсальный сравнитель товаров по двум ссылкам. Frontend размещается на GitHub Pages, а Parser API и Chromium-контейнер рассчитаны на Yandex Cloud.

## Что умеет ядро

- определяет магазин, категорию, бренд, модель, модификацию и доступные идентификаторы;
- читает JSON-LD, meta-теги, видимый HTML и hydration state (`__NEXT_DATA__` и похожие JSON-состояния);
- нормализует смартфоны, ноутбуки, GPU, CPU, мониторы, телевизоры, SSD, наушники и бытовую технику;
- использует generic fallback для неизвестных категорий;
- разделяет характеристики товара и предложения магазинов;
- различает модификации, например `8/128 ГБ` и `8/256 ГБ`;
- возвращает полезный partial result, если магазин отдал identity/offer, но заблокировал характеристики;
- не требует расширения браузера пользователя.

## Архитектура

```text
URL A + URL B
      │
      ▼
Store Registry (server/src/stores.js)
      │
      ▼
Fetch Strategy: direct → Chromium → reader fallback
      │
      ▼
JSON-LD / embedded JSON / rendered HTML
      │
      ▼
Product Identity ─────┬──── Spec normalization
                      └──── Offer providers
                              │
                              ▼
                     Universal comparison
```

`browser-parser` является транспортом получения rendered HTML. Он вызывает то же ядро `server/src`, а не содержит отдельный GPU-only comparison engine.

## Магазины

Единый registry содержит DNS, М.Видео, Ozon, Яндекс Маркет, Wildberries, Ситилинк, Мегамаркет, ВсеИнструменты, Эльдорадо и AliExpress. Поддержка в registry означает, что URL безопасно допускается в pipeline; она не гарантирует, что конкретный магазин не включит антибот-защиту.

Актуальные результаты публичных проб: [docs/LIVE_STORE_AUDIT.md](docs/LIVE_STORE_AUDIT.md).

## Локальная проверка ядра

Нужен Node.js 20+.

```bash
npm test
npm run test:live
npm --prefix server start
```

Unit/integration tests не обращаются к магазинам. `test:live` запускается отдельно, потому что статусы и страницы магазинов нестабильны.

Frontend можно открыть отдельно:

```bash
python -m http.server 8000
```

```text
http://localhost:8000/?api=http://localhost:8787/api/compare
```

## Chromium-контейнер

```bash
docker build -f browser-parser/Dockerfile -t specly-browser-parser .
docker run --rm -p 8080:8080 --shm-size=1g specly-browser-parser
```

Проверка:

```bash
curl http://localhost:8080/health
curl -X POST http://localhost:8080/api/compare \
  -H 'content-type: application/json' \
  -d '{"urls":["https://www.dns-shop.ru/product/.../","https://www.mvideo.ru/products/..."]}'
```

Подробности: [browser-parser/README.md](browser-parser/README.md) и [docs/PARSER_API.md](docs/PARSER_API.md).

## Конфигурация

Все провайдеры optional. Без ключей сравнение продолжает работать с доступными источниками. Полный список переменных находится в [server/.env.example](server/.env.example). Health endpoint показывает только boolean-состояние конфигурации и никогда не выводит значения токенов.

Referral API Яндекс Маркета используется как источник metadata/offer, но не как единственный источник характеристик.
