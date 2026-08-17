# Specly Browser Parser

Серверный Chromium-парсер для магазинов, которые блокируют обычный `fetch()`.

## Что делает

- запускает Playwright Chromium;
- открывает публичные карточки DNS/М.Видео как браузер;
- для DNS дополнительно открывает `/product/characteristics/...`;
- извлекает HTML и передаёт его существующему нормализатору Specly;
- возвращает тот же JSON-формат сравнения, который ожидает фронтенд.

## Локальная проверка

Из корня репозитория:

```bash
docker build -f browser-parser/Dockerfile -t specly-browser-parser .
docker run --rm -p 8080:8080 --shm-size=1g specly-browser-parser
```

Health check:

```bash
curl http://localhost:8080/
```

Сравнение:

```bash
curl -X POST http://localhost:8080/ \
  -H 'content-type: application/json' \
  -d '{"urls":["https://www.dns-shop.ru/product/.../","https://www.mvideo.ru/products/.../"]}'
```

## Yandex Serverless Containers

Docker image нужно собирать из корня репозитория, потому что Dockerfile копирует и `browser-parser/`, и общий `server/`.

Пример:

```bash
yc container registry configure-docker

docker build -f browser-parser/Dockerfile \
  -t cr.yandex/<REGISTRY_ID>/specly-browser-parser:latest .

docker push cr.yandex/<REGISTRY_ID>/specly-browser-parser:latest
```

После загрузки образа создайте Serverless Container и ревизию:

- runtime: HTTP server;
- image: `cr.yandex/<REGISTRY_ID>/specly-browser-parser:latest`;
- memory: 1 GB;
- cores: 1;
- execution timeout: 30–60 s;
- public invocation: enabled.

Приложение автоматически слушает порт из переменной окружения `PORT`, которую задаёт Yandex Cloud.

После публикации замените `YANDEX_API_ENDPOINT` во фронтенде на HTTPS URL Serverless Container.
