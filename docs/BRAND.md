# Бренд и UX-требования POKER HUB

> Список «как должно быть». При расхождении кода с этим списком — побеждает этот список.
> Сюда добавляются требования, озвученные пользователем; устаревшие — удаляются.
>
> Ранее этот раздел жил в `CLAUDE.md §8.1.1`. Вынесен 2026-05-29 в рамках декомпозиции (см. `CLAUDE.md §8` ссылки).

## Бренд

- Название рума — **POKER HUB** (раньше было SK Poker, переименовано 2026-05-26 под домен `poker-hub.city`).
- Лого POKER HUB в navbar (на всех страницах) — CSS-класс `.neon-logo` в [client/src/index.css](../client/src/index.css): белый текст + циан/мадженто text-shadow glow, **без пульсации** (steady), letter-spacing 0.08em.
- `<title>` страницы — «Poker Hub» ([client/index.html](../client/index.html)).
- Большой неон-заголовок на MainMenu **не нужен** — в navbar достаточно. Класс `.neon-title` (с пульсацией) оставлен в CSS как fallback, не используется.

## MainMenu (`/`)

- Фон — картинка `/images/main-bg.jpg` на весь экран (`object-cover`), **без затемнения** (overlay убран).
- Кнопки Quick Play / Create Room / Tournaments на странице **убраны** — навигация только через nav-bar.
- На странице остаётся только статус-блок снизу (Online · v · Browser/Telegram badge).
- Турниры доступны как 4-я вкладка в bottom-bar и desktop-nav, **disabled с подписью «скоро»** (страницы ещё нет).

## Showdown UX (важно)

- Карты в выигрышной пятёрке (`winningCards` из `GAME_WINNER`) — **выдвигаются вверх** (`y: -18px`, slight `scale: 1.06`), **без свечения/рамки/пульсации**. Lift = единственный визуальный сигнал.
- Карты НЕ в выигрышной пятёрке (community вне комбо, hole-карты проигравших, не-играющие hole-карты победителя) — **приглушаются** (`opacity: 0.45`). Не убираются полностью — остаются читаемыми.
- Аватар победителя — золотое кольцо + glow (`ring-yellow-400`).
- **Никакой большой жёлтой плашки** «Победитель» по центру — удалена 2026-05-22.
- На showdown карты всех (включая проигравших) показываются face-up — нужно видеть кто что играл.

## Admin-peek («глазик» в админ-UI, mobile)

- Карты соперников показываются маленькими — `size="sm"` (как рубашки), не lg.
- **Мои карты не дублируются** — overlay для self скрывается, я и так вижу свои в bottom-блоке.
- Будущие community-карты (которые ещё выйдут на flop/turn/river) — рисуются полупрозрачно с красной обводкой рядом с уже открытыми.
- Peek-флаг **не сохраняется** при reconnect/refresh — безопасный дефолт (по умолчанию выключен).

## Аватары игроков

- Аватары — **react-nice-avatar** (MIT, локальная генерация, офлайн/PWA/TWA) — [client/src/utils/avatar.ts](../client/src/utils/avatar.ts). `avatarConfig(seed)` через `genConfig` даёт стабильный конфиг лица из `player.id` (одно и то же лицо у игрока всегда), с кэшем.
- Рендер компонентом `<ReactNiceAvatar shape="circle" {...config} />` в [PlayerSeat.tsx](../client/src/components/game/PlayerSeat.tsx) (desktop) и [MobilePlayerSeat.tsx](../client/src/components/game/MobilePlayerSeat.tsx) (mobile), внутри кружка с градиентом `avatarColor(username)` как фон.
- Стиль — flat «Notion-like» персонажи. Не покер-тематика (для неё нужен AI-пак/покупной арт — обсуждалось, отложено).
- **TODO (следующий шаг):** пикер выбора аватара + серверное хранение в `users.json` + проброс в `GameState.Player.avatar` (сейчас детерминированно из id, выбора ещё нет).

## Карты игроков (mobile)

- Мои карты в bottom-fixed-блоке: `size="lg"` × `scale: 0.81` через `scale-[0.81] origin-bottom` ([GameRoom.tsx](../client/src/pages/GameRoom.tsx)). Anchor — низ блока ниже ActionPanel.
- Карты соперников в раздаче — рубашки в плашке seat'а (`MobilePlayerSeat`).

## SVG-колода classic (источник: `images/classic/`)

Генератор `scripts/generate-classic-deck.mjs`:
- Угол: ранг 53pt + масть 38px (визуально равны), ранг ближе к краю карты, масть выше к центру.
- Центр на 2..10 и A — одна большая масть 95px.
- J/Q/K — только буква 110pt, БЕЗ дублирующей масти под ней.
- Crest (♣) — 3 круга r=20 + соединяющий треугольник + стебель (сплошной блоб без пустоты в центре).
- Превью для проверки: [scripts/preview-classic.html](../scripts/preview-classic.html).

## Домен и Cloudflare tunnel

- Домен — `poker-hub.city` (orangewebsite.com → NS на Cloudflare).
- Tunnel: `poker-hub` (UUID `279bcc04-4b4f-42d1-8ec2-775d0b6569c7`), конфиг `C:\Users\Administrator\.cloudflared\config.yml`. Split: `poker-hub.city → :5173` (Vite), `api.poker-hub.city → :3001` (Express+Socket.IO).
- Tunnel-режим включается через `client/.env`: `VITE_API_URL=https://api.poker-hub.city` + `VITE_TUNNEL_HOST=poker-hub.city`. Закомментировано → обычный LAN/localhost режим.
- Cloudflared MSI: `C:\Program Files (x86)\cloudflared\cloudflared.exe`.
- Запуск через .bat на рабочем столе: `start-server.bat` + `start-tunnel.bat`.

## Telegram MiniApp

- SDK подключён в [client/index.html](../client/index.html) скриптом `telegram-web-app.js`. `useTelegram` хук определяет TG **по непустому `initData`** (window.Telegram.WebApp существует везде из-за SDK, но `initData=''` вне Telegram).
- Auto-login через `POST /api/auth/telegram` — реализован в [server/src/auth/auth.ts](../server/src/auth/auth.ts) с HMAC-валидацией. Активируется когда в `server/.env` задан `TELEGRAM_BOT_TOKEN=<из @BotFather>`.
- Без BOT_TOKEN endpoint отдаёт 503; клиент молча падает в обычный flow.
