# Specly Parser API

## POST /api/compare

Запрос содержит ровно две HTTPS-ссылки на поддерживаемые магазины.

```json
{
  "urls": [
    "https://www.dns-shop.ru/product/.../",
    "https://www.mvideo.ru/products/..."
  ]
}
```

Ответ:

```json
{
  "category": "gpu",
  "products": [
    {
      "store": "DNS",
      "source": "dns-shop.ru",
      "url": "https://www.dns-shop.ru/product/.../",
      "title": "Видеокарта ...",
      "price": { "value": 12999, "currency": "RUB" },
      "image": "https://...",
      "specs": {
        "gpu": "Radeon RX 580",
        "video_memory_gb": 8,
        "memory_type": "GDDR5",
        "memory_bus_bit": 256
      }
    }
  ],
  "comparison": [
    {
      "key": "video_memory_gb",
      "label": "Видеопамять",
      "values": [8, 6],
      "displayValues": ["8 ГБ", "6 ГБ"],
      "different": true,
      "important": true,
      "preference": "higher",
      "winner": 0,
      "note": "Первый товар предпочтительнее по этому параметру; разница 2 ГБ"
    }
  ],
  "summary": "..."
}
```

## GET /api/health

```json
{ "ok": true, "service": "specly-parser", "version": "0.1.0" }
```

## Нормализованные GPU-ключи

`gpu`, `video_memory_gb`, `memory_type`, `memory_bus_bit`, `core_clock_mhz`, `memory_clock_mhz`, `tdp_w`, `power_connector`, `recommended_psu_w`, `pcie`, `length_mm`, `width_mm`, `height_mm`, `hdmi_count`, `displayport_count`.

## Стратегия извлечения

1. JSON-LD и meta-теги для карточки товара;
2. видимый HTML для характеристик;
3. нормализация русских названий и единиц;
4. DNS дополнительно пробует отдельный URL `/product/characteristics/...`;
5. отсутствующие параметры остаются отсутствующими — Specly не додумывает значения.

## DNS catalog URL

`/catalog/recipe/...` — это выдача, а не карточка товара. Ответ:

```json
{
  "error": {
    "code": "DNS_CATALOG_URL",
    "message": "Ссылка DNS ведёт на каталог, а не на конкретный товар",
    "details": {
      "candidates": [
        { "title": "Видеокарта ...", "url": "https://www.dns-shop.ru/product/.../" }
      ]
    }
  }
}
```

## Безопасность

Parser API не является открытым универсальным URL-прокси. Разрешены только HTTPS-хосты DNS и М.Видео; каждый redirect повторно проходит whitelist-проверку. Размер HTML и время ответа upstream ограничены.
