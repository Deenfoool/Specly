# Specly Parser API

Этот документ фиксирует минимальный контракт между статическим фронтендом Specly и будущим серверным парсером.

## POST /api/compare

Запрос:

```json
{
  "urls": [
    "https://www.dns-shop.ru/product/...",
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
      "source": "dns-shop.ru",
      "url": "https://www.dns-shop.ru/product/...",
      "title": "Видеокарта ...",
      "price": {
        "value": 12999,
        "currency": "RUB"
      },
      "image": "https://...",
      "specs": {
        "gpu": "Radeon RX 580",
        "video_memory_gb": 8,
        "memory_type": "GDDR5",
        "memory_bus_bit": 256,
        "tdp_w": 185
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
      "note": "Первый товар: +2 ГБ"
    }
  ]
}
```

## Нормализованные ключи GPU

Рекомендуемый минимальный словарь:

```text
gpu
video_memory_gb
memory_type
memory_bus_bit
core_clock_mhz
boost_clock_mhz
tdp_w
power_connector
recommended_psu_w
pcie
length_mm
width_mm
height_mm
hdmi_count
displayport_count
```

## Правила сравнения

Каждый параметр имеет тип предпочтения:

- `higher` — больше обычно лучше;
- `lower` — меньше обычно лучше;
- `neutral` — числовое сравнение не определяет победителя;
- `context` — оценка зависит от сценария.

Примеры:

```json
{
  "video_memory_gb": "higher",
  "tdp_w": "lower",
  "length_mm": "context",
  "memory_type": "context"
}
```

Важно: Specly не должен автоматически объявлять товар победителем только потому, что у него больше «выигранных» строк.

## Стратегия извлечения

Для каждого магазина адаптер должен пробовать источники в таком порядке:

1. JSON-LD / schema.org;
2. структурированные данные, встроенные в страницу;
3. доступные публичные данные страницы;
4. DOM-парсинг как fallback.

Нормализация выполняется после извлечения, поэтому адаптер магазина не должен содержать логику пользовательского сравнения.

## Ошибки

Пример ответа, если страницу нельзя разобрать:

```json
{
  "error": {
    "code": "PRODUCT_PARSE_FAILED",
    "message": "Не удалось получить характеристики товара",
    "source": "dns-shop.ru"
  }
}
```

Фронтенд должен показывать такую ошибку пользователю, а не заменять отсутствующие данные догадками.
