# Настройка Add_VKMarket

## Самый простой запуск — GitHub Codespaces

1. Откройте репозиторий `Add_VKMarket` на GitHub.
2. Нажмите `Code` → `Codespaces` → `Create codespace on main`.
3. При первом создании Codespace зависимости установятся автоматически.
4. При каждом запуске Codespace автоматически проверит наличие `VK_GROUP_ID` и `VK_ACCESS_TOKEN` в Codespaces Secrets и запустит сервер.
5. Порт `3000` будет автоматически проброшен как приватный и откроется в preview.

### Нужные Codespaces Secrets

Создайте два секрета и разрешите их для этого репозитория:

```text
VK_GROUP_ID
VK_ACCESS_TOKEN
```

`VK_GROUP_ID` указывается без минуса.

После добавления или изменения Secrets остановите Codespace и запустите его снова, чтобы новые значения появились в окружении.

### Как проверить Secrets в терминале

Не выводя сам токен, можно проверить только факт наличия:

```bash
[ -n "$VK_GROUP_ID" ] && echo "VK_GROUP_ID найден" || echo "VK_GROUP_ID НЕ найден"
[ -n "$VK_ACCESS_TOKEN" ] && echo "VK_ACCESS_TOKEN найден" || echo "VK_ACCESS_TOKEN НЕ найден"
```

Проверить сервер:

```bash
curl http://localhost:3000/api/health
```

При корректной настройке ответ должен содержать:

```json
{
  "ok": true,
  "configured": true,
  "groupId": 123456789,
  "apiVersion": "5.199"
}
```

Сам `VK_ACCESS_TOKEN` endpoint `/api/health` никогда не возвращает.

## Локальный запуск без Codespaces

### 1. Установить Node.js
Нужен Node.js 20 или новее.

### 2. Установить зависимости

```bash
npm install
```

### 3. Создать файл `.env`

Скопируйте `.env.example` в `.env` и заполните:

```env
VK_GROUP_ID=123456789
VK_ACCESS_TOKEN=ваш_токен
VK_API_VERSION=5.199
PORT=3000
```

Настоящий токен нельзя коммитить в GitHub. Файл `.env` уже добавлен в `.gitignore`.

### 4. Запустить приложение

```bash
npm start
```

После запуска открыть:

```text
http://localhost:3000
```

## Что уже работает

- форма товара;
- до 5 фотографий;
- черновик;
- предпросмотр;
- загрузка категорий VK;
- загрузка подборок сообщества;
- загрузка фотографий товара в VK;
- создание товара через `market.add`;
- добавление созданного товара в выбранную подборку;
- артикул и остаток;
- ссылка на созданный товар после публикации.

## Используемые методы VK API

- `market.getCategories`;
- `market.getAlbums`;
- `photos.getMarketUploadServer`;
- `photos.saveMarketPhoto`;
- `market.add`;
- `market.addToAlbum`.

## Безопасность

В Codespaces токен хранится в Codespaces Secrets. При локальном запуске — в `.env`. Браузер токен не получает.
