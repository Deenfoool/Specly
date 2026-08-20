# Live store audit

Дата проверки: 2026-08-20. Проверялись публичные карточки без CAPTCHA bypass, прокси, расширений и чужих cookie.

| Магазин | Direct fetch из текущей server-среды | Chromium | Доступные данные | Текущий вывод |
|---|---|---|---|---|
| DNS | HTTP 401 | Основная карточка открылась; отдельный `/product/characteristics/` получил `Access Blocked` | На основной карточке есть title, JSON-LD и краткие specs | Основная карточка полезна; полные specs могут стать partial |
| М.Видео | HTTP 200, но только общая оболочка сайта | Карточка и видимые specs открылись | title, модель, варианты, характеристики | Direct shell отклоняется как `PRODUCT_NOT_FOUND`, Chromium является рабочим fallback |
| Ozon | Цикл redirect в direct-клиенте | Карточка закончилась, но Chromium показал title, offer и рекомендации | rendered state и встроенный скрипт состояния | Chromium полезен; финальный URL нужно валидировать внутри того же store |
| Яндекс Маркет | HTTP 200 с антибот-страницей | SmartCaptcha (`Вы не робот?`) | Поисковый индекс видит metadata/specs; Referral API optional | При CAPTCHA возвращается partial/offer, обход не выполняется |
| Wildberries | HTTP 498 | HTML-оболочка и product metadata загрузились, данные карточки остались в spinner | `<title>`/description и product id; specs/price не загрузились | Metadata можно сохранить, отсутствие specs помечается partial |
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

Live-результаты не являются постоянной гарантией: магазины меняют HTML, региональные ответы и антибот-правила. Для повторной проверки используется `npm run test:live`.
