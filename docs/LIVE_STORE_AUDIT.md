# Live store audit

Дата исходной проверки страниц: 2026-08-20. Архитектурные обновления по Ozon/Wildberries: 2026-08-21. Проверяются только публичные страницы/клиентские JSON-источники без CAPTCHA bypass, прокси, расширений и чужих cookie.

| Магазин | Direct fetch из текущей server-среды | Chromium / JSON | Доступные данные | Текущий вывод |
|---|---|---|---|---|
| DNS | HTTP 401 | Основная карточка открывается; для `/product/characteristics/` добавлен same-session Chromium переход и DNS structured extractor | title, JSON-LD, краткие specs; полные specs при доступной characteristics page | Chromium-сессия теперь переиспользуется между карточкой и characteristics; при блоке остаётся partial |
| М.Видео | HTTP 200, но только общая оболочка сайта | Карточка и видимые specs открылись | title, модель, варианты, характеристики | Direct shell отклоняется как `PRODUCT_NOT_FOUND`, Chromium является рабочим fallback |
| Ozon | Цикл redirect в direct-клиенте | Dedicated Chromium adapter ждёт product signals и `data-widget="webPrice"`, затем читает embedded state | title, price, rating/reviews, embedded characteristics | Chromium + embedded state являются основным путём; generic parser остаётся fallback |
| Яндекс Маркет | HTTP 200 с антибот-страницей | SmartCaptcha (`Вы не робот?`) | Referral API может дать metadata/offer | При CAPTCHA обход не выполняется; metadata/offer и specs должны резолвиться разными источниками |
| Wildberries | HTTP 498 у страницы | Основной новый путь — storefront JSON search `u-search.wb.ru/search.wb.ru ... /v18/search`; Chromium страницы остаётся fallback | id, name, brand, price, rating, feedbacks, quantity, supplier | JSON search интегрирован как source resolver и OfferResolver; цена привязана к `dest`, exact-match проверяет модель/модификацию. Нужна повторная live-проверка после деплоя |
| Ситилинк | HTTP 429 | Карточка и `/properties/` открылись | JSON-LD, `__NEXT_DATA__`, product header, видимые specs | Chromium + hydration state являются рабочими источниками |
| ВсеИнструменты | HTTP 403 | Интерактивная антибот-проверка | Поисковый индекс содержит характеристики | Не решать challenge автоматически; graceful partial fallback |

## Проверенные URL

- DNS: `https://www.dns-shop.ru/product/7ea8826afd6cd9cb/67-smartfon-samsung-galaxy-a56-256-gb-cernyj/`
- М.Видео: `https://www.mvideo.ru/products/smartfon-samsung-galaxy-a56-5g-8-256gb-seryi-30080790`
- Ozon: `https://www.ozon.ru/product/samsung-smartfon-galaxy-a56-5g-eu-global-8-256-gb-nano-sim-esim-rozovyy-2129618340/`
- Яндекс Маркет: `https://market.yandex.ru/card/smartfon-samsung-galaxy-a56-8256-gb-awesome-graphite/5411235954`
- Wildberries: `https://www.wildberries.ru/catalog/497718851/detail.aspx`
- Ситилинк: `https://www.citilink.ru/product/smartfon-samsung-galaxy-s10-128gb-sm-g975f-chernyi-1124187/properties/`
- ВсеИнструменты: `https://www.vseinstrumenti.ru/product/holodilnik-bosch-kgn39xi30u-13139071/`

## Wildberries storefront JSON

Внутренний web-поиск Wildberries, который вызывается публичной витриной, возвращает JSON с `id`, `name`, `brand`, `sizes[].price`, рейтингами, отзывами и `totalQuantity`. Specly использует этот источник без пользовательских cookies и без обхода challenge.

`WILDBERRIES_DEST` задаёт региональный `dest`. Это важно: публичная цена/наличие Wildberries могут зависеть от региона, аккаунта и способа оплаты, поэтому offer сохраняет `regionDest` и соответствующее пояснение.

Live-результаты не являются постоянной гарантией: магазины меняют HTML, JSON-схемы, региональные ответы и антибот-правила. Unit tests используют fixtures; live-проверки запускаются отдельно.
