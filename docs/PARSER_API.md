# Specly Parser API

## POST `/api/compare`

```json
{
  "urls": [
    "https://www.dns-shop.ru/product/.../",
    "https://www.mvideo.ru/products/..."
  ]
}
```

Обе ссылки должны быть HTTPS URL зарегистрированных магазинов. Redirect разрешён только между host aliases одного store.

Успешный ответ может быть полным или частичным:

```json
{
  "status": "partial",
  "category": "smartphone",
  "categories": ["smartphone", "smartphone"],
  "mixedCategories": false,
  "partialComparison": true,
  "products": [
    {
      "store": "DNS",
      "source": "dns-shop.ru",
      "url": "https://www.dns-shop.ru/product/.../",
      "title": "Смартфон Samsung Galaxy A56 8/256 ГБ",
      "price": { "value": 36999, "currency": "RUB" },
      "available": true,
      "category": "smartphone",
      "identity": {
        "brand": "Samsung",
        "model": "Galaxy A56 5G",
        "variant": "8/256 ГБ",
        "identifiers": { "sku": "5620468", "mpn": null, "gtin": null, "article": null },
        "attributes": { "ramGb": 8, "storageGb": 256, "gpuMemoryGb": null, "capacityGb": null, "color": null }
      },
      "specs": { "ram_gb": 8, "storage_gb": 256 },
      "specsStatus": "available",
      "partial": false,
      "resolvedBy": "browser",
      "fetchAttempts": [
        { "strategy": "direct", "ok": false, "code": "UPSTREAM_BLOCKED", "status": 401 },
        { "strategy": "browser", "ok": true, "status": 200 }
      ],
      "offers": []
    }
  ],
  "comparison": [],
  "summary": "...",
  "errors": []
}
```

`status: partial` и HTTP 200 означают, что товары распознаны, но часть specs/offers недоступна. Frontend должен показать подтверждённые данные и не трактовать ответ как полный отказ.

## Structured errors

- `UPSTREAM_BLOCKED` — магазин или anti-bot не отдал карточку;
- `EMPTY_PAGE` — ответ не содержит полезного документа;
- `PRODUCT_NOT_FOUND` — получена оболочка/каталог вместо карточки;
- `PRODUCT_PARSE_FAILED` — документ есть, но товар не распознан;
- `OFFERS_UNAVAILABLE` — отдельный provider предложений недоступен;
- `BAD_REDIRECT` — redirect вышел за host aliases исходного store;
- `INVALID_URL`, `UNSUPPORTED_PROTOCOL`, `UNSUPPORTED_STORE` — ошибка входного URL.

Полный HTTP error возвращается только когда запрос невалиден или ни один товар нельзя безопасно идентифицировать. Блокировка одного offer provider не ломает сравнение.

## GET `/health`

Возвращает version, `chromiumAvailable`, registry stores и boolean-статус optional providers. Секреты не возвращаются.

## DNS catalog URL

`/catalog/...` — каталог, не карточка. Ответ имеет код `DNS_CATALOG_URL` и может содержать до шести candidate links. Candidate extraction больше не фильтруется только по видеокартам.
