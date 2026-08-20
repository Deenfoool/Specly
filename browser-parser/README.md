# Specly Browser Parser

Chromium transport для общего Product Resolution Engine. Сервис не нормализует GPU отдельно и не содержит собственного comparison engine: полученный HTML передаётся в `server/src`.

## Pipeline

1. URL валидируется через общий `server/src/stores.js`.
2. Ядро пробует direct fetch.
3. Если ответ заблокирован, пуст или является общей оболочкой сайта, используется Playwright Chromium.
4. HTML, final URL, status и strategy возвращаются общим adapters/category/identity/normalizer.
5. Ошибка одного источника превращается в structured partial result, если identity можно подтвердить по URL/metadata.

Один browser context используется на пару сравниваемых URL, поэтому cookies сохраняются между запросами внутри одного compare. На каждый URL создаётся отдельная page. Custom User-Agent не задаётся: Playwright использует реальный User-Agent Chromium из образа.

Ресурсы по умолчанию не блокируются. `BLOCK_HEAVY_RESOURCES=true` отключает только media и fonts; images остаются доступными, потому что часть сайтов связывает product state с media pipeline.

## Локальный запуск

```bash
docker build -f browser-parser/Dockerfile -t specly-browser-parser .
docker run --rm -p 8080:8080 --shm-size=1g specly-browser-parser
```

```bash
curl http://localhost:8080/health
curl -X POST http://localhost:8080/api/compare \
  -H 'content-type: application/json' \
  -d '{"urls":["https://www.dns-shop.ru/product/.../","https://www.mvideo.ru/products/..."]}'
```

Также поддерживаются legacy routes `GET /` и `POST /`.

## Health

`GET /health` безопасно возвращает:

- service version;
- `chromiumAvailable`;
- registry магазинов и стратегии;
- boolean-состояние optional providers.

Токены и значения env не выводятся.

## Yandex Serverless Containers

Собирать образ нужно из корня репозитория:

```bash
yc container registry configure-docker
docker build -f browser-parser/Dockerfile \
  -t cr.yandex/<REGISTRY_ID>/specly-browser-parser:latest .
docker push cr.yandex/<REGISTRY_ID>/specly-browser-parser:latest
```

Рекомендуемые параметры ревизии:

- memory: 1–2 GB;
- cores: 1;
- execution timeout: 60 s;
- concurrency: начать с 1–2 и повышать после наблюдения за памятью;
- public invocation: enabled;
- `PORT` задаётся платформой.

После деплоя укажите URL контейнера во frontend endpoint. GitHub Pages остаётся frontend-хостингом.

## Переменные окружения

См. `server/.env.example`. Browser-specific: `NAV_TIMEOUT_MS`, `READY_TIMEOUT_MS`, `BLOCK_HEAVY_RESOURCES`. Playwright image уже содержит совместимый Chromium, поэтому `channel: 'chromium'` не используется.
