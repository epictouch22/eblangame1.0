# ЕБЛАНГЕЙМ — prototype 0.1

Первая рабочая браузерная версия: комнаты по коду, 2–6 игроков, хост, Ready, realtime-чат и системные сообщения.

## Запуск
Нужен Node.js 20+.

```bash
npm install
npm run dev
```

Открыть http://localhost:5173. Для проверки мультиплеера открыть несколько вкладок. Сервер слушает :3001.

## Следующий этап
GameManager + первый полноценный Jackbox-подобный режим «Ответь как еблан»: prompt -> тайные ответы -> голосование -> результаты -> очки.

### Фоторобот: генератор тем
В режиме используются как вручную подготовленные темы, так и генератор по шаблону «участник + действие + объект + обстоятельство + модификатор». В каждом из пяти словарей не меньше 50 элементов; темы внутри запуска не повторяются.

## Хостинг с собственного ПК

На Windows можно запустить `START_EBLANGAME.bat`. При первом запуске он установит npm-зависимости (если их ещё нет), скачает официальный `cloudflared.exe`, запустит игру и создаст временную публичную HTTPS-ссылку вида `https://....trycloudflare.com`.

Эту ссылку можно отправить друзьям. Окна `EBLANGAME SERVER` и туннеля должны оставаться открыты всё время игры. Для следующего запуска достаточно снова открыть BAT-файл; адрес туннеля может измениться.

## Render deployment
This archive is prepared for a single Render Web Service.

- Build Command: `npm install && npm run build`
- Start Command: `npm start`
- Health Check Path: `/health`
- Root Directory: leave empty

The Node server serves the built Vite client and Socket.IO from the same public URL.

