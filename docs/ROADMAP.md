# Roadmap POKER HUB

> Известные проблемы (раздел 9) и план улучшений UX (раздел 10). Источник вдохновения — топовые покер-приложения (GGPoker/ClubGG), но **без клубной модели**. Форматы — только NLH + Шорт-дэк. PLO/SNG/MTT не делаем.
>
> Формат пункта: `[приоритет]` коротко что и где. Приоритет — 🔥 срочное / 📌 важное / 💤 потом / ⛔ overkill.
>
> Ранее эти разделы жили в `CLAUDE.md §9` и `§10`. Вынесены 2026-05-29 в рамках декомпозиции.

---

## 9. Планировщик: известные проблемы и задачи

> Это рабочий список того, что обнаружено, но НЕ починено. По мере выполнения — удалять отсюда пункт. По мере появления новых багов/идей в ходе сессии — добавлять сюда коротко.
>
> Формат пункта: `[приоритет]` коротко что и где. Приоритет — `🔥` срочное / `📌` важное / `💤` потом.

### 9.1. UI: адаптивность и Telegram Mini App

- 💤 **Lobby не тестирован в TWA** — карточки и модалки на десктопе/мобиле ок, в Telegram Mini App — неизвестно.
- 💤 **Тестирование во ВСЕХ таргетах** — нужен прогон по чеклисту: десктоп 1280, мобильный 375×667, TWA-окно. Сделать перед публикацией.

### 9.2. Архитектура и тех. долг

- 💤 **Дубли типов** между [shared/index.ts](shared/index.ts) и [server/src/game/*.ts](server/src/game/) — из-за `rootDir: "./src"` в [server/tsconfig.json](server/tsconfig.json). Решение: либо поменять tsconfig (включить shared в rootDir/include с правильной композицией), либо вынести shared в npm-workspace. Сейчас НЕ трогать, но иметь в виду — каждое новое поле в `Player`/`GameState` надо синхронизировать в двух местах. **Уточнение (аудит 2026-06-03, см. 9.3-A)**: фактически дублирование ТРОЙНОЕ (вкл. client-local в [GameRoom.tsx](client/src/pages/GameRoom.tsx)/[Lobby.tsx](client/src/pages/Lobby.tsx)) и уже разъехалось (клиентский `GameState` без `winners`; клиент не импортирует `SOCKET_EVENTS`). Дешёвый промежуточный guard — тест синхронности копий.
- 💤 **При рестарте сервера активные раздачи теряются** — снапшот в `rooms.json` сохраняет только метаданные комнат (name/blinds/maxPlayers/password). При старте комнаты восстанавливаются как пустые `waiting`, игроки переподключаются заново. Полная персистентность раздач (deck, pot, ставки) — отдельная задача через Redis.
- ~~**Комната не прогружается с первого раза** — после navigate из Lobby → /game/:roomId страница чёрная, F5 чинит.~~ — закрыто 2026-05-21 (см. 11.40). Виноват `<AnimatePresence mode="wait">` в Layout, ломавший initial-анимации дочерних motion-компонентов GameRoom. Убрал обёртку.
- 📌 **Боты: разбалансированы — все в минусе** (диагностика 2026-05-19, см. 11.36). Все 12 ботов созданы с `targetPnL='zero'`, пул сократился с ~64K до ~24K — реальные игроки забрали ~40K. Под текущей PnL-driven логикой все боты в zone='under' (drift отрицательный) → массовый `peek-loss-fold-under` (4012× в логе). Требуется доработка: распределение targetPnL по ботам, balance maintenance механизм, возможно подкрутка `allowedLossBB` для under-зоны. Пользователь сам определит дальнейший fix.

### 9.3. Модульность — аудит декомпозиции (2026-06-03)

> Аудит 8 агентами на «слабая связанность / сильная связность» (при изменении одного модуля не должна ломаться логика другого, легче отлаживать). Ниже — что развязать, по важности.
> **Сильные стороны — НЕ ломать**: чистое ядро [hands.ts](../server/src/game/hands.ts)/[deck.ts](../server/src/game/deck.ts) с cross-verify тестами; [storage.ts](../server/src/auth/storage.ts) (атомарность+дебаунс); `getGameState` per-socket (защита карт §0.1); BotManager↔botBrain через интерфейс; клиентские config-модули; уже работающий `.claude` auto-vitest hook.
> Перед любым распилом — тесты вокруг куска; серверные распилы только вне активного стола (§0.2), с готовым откатом (§10).

**A. Контракт типов и SOCKET_EVENTS (корень, сквозное)**
- ✅ ~~SOCKET_EVENTS не используется клиентом~~ — сделано 2026-06-04. Клиент импортирует `SOCKET_EVENTS` из `@poker-room/shared` (Vite-alias в [vite.config.ts](../client/vite.config.ts) + tsconfig path); все события в GameRoom/Lobby/Layout — через константы. В словарь добавлены `REQUEST_GAME_STATE`/`FORCE_DISCONNECT` → baseline-долг закрыт, guard теперь 24 события, 0 в обход. Серверный `index.ts` ещё на строковых литералах (валидны по словарю, guard зелёный) — косметическая зачистка на константы отдельно. **Alias `@poker-room/shared` теперь готов и для импорта ТИПОВ клиентом** (разблокирует следующий пункт).
- 🔄 **Дублирование `GameState`/`Player`/`Card`/`RoomInfo`** — ✅ КЛИЕНТСКАЯ сторона убрана 2026-06-04: [Card](../client/src/components/game/Card.tsx)/[Lobby](../client/src/pages/Lobby.tsx)/[TableInfoModal](../client/src/components/game/TableInfoModal.tsx)/[GameRoom](../client/src/pages/GameRoom.tsx) импортируют типы из `@poker-room/shared` (локальные копии удалены; `PlayerView` оставлен как узкая render-вьюшка — подмножество shared `Player`). Осталась **server-local копия** в [GameManager.ts](../server/src/game/GameManager.ts) — из-за `rootDir` (см. корень ниже). События `requestGameState`/`forceDisconnect` внесены в словарь (см. выше).
- 🔄 **Корень — `rootDir` сервера** ([server/tsconfig.json](../server/tsconfig.json)): ✅ опция (Г) **guard-тест синхронности полей** сделана 2026-06-05 — [check-contract.mjs](../scripts/check-contract.mjs) теперь сверяет наборы полей `GameState`/`RoomInfo`/`CreateRoomOptions` между shared↔server-копией (Проверка 3), ловит дрейф; известное расхождение `RoomInfo.isBotTable` (server не отдаёт) — в allowlist (warning). **Осталось** (опционально, отдельным решением): корневая развязка типов — (А) npm workspaces / (Б) предкомпиляция shared в `.d.ts` / (В) кодоген — чтобы server импортировал типы из shared, а не держал копии.
- ✅ ~~**Внутрисерверный `server/src/game/types.ts`** — убрать копии `Card`/`Rank`/`Suit`~~ — закрыто 2026-06-05. Последняя локальная копия (в GameManager.ts) убрана: `Suit`/`Rank`/`Card`/`GamePhase`/`RoomStatus` импортируются из [types.ts](../server/src/game/types.ts). 282 теста ✓. Остаётся server-local `GameState`/`Player`/`Room`/`RoomInfo` (дубль shared — отдельный пункт «корень rootDir» выше).

**B. Сервер: [GameManager.ts](../server/src/game/GameManager.ts) (god-объект 1824 стр.) → сервисы**
> Начато 2026-06-04: ✅ (1) чистые функции конфига → [roomValidation.ts](../server/src/game/roomValidation.ts) (+ [тест](../server/src/game/__tests__/roomValidation.test.ts), 15). ✅ (2) **RoomStore** — фабрики [playerFactory.ts](../server/src/game/playerFactory.ts) `createPlayer()` (Player 2× из addPlayer/seatBot) + [roomFactory.ts](../server/src/game/roomFactory.ts) `makeRoom()` (Room ~30 полей 3× из loadRoomsSnapshot/createRoom/createBotTable). Типы `TimebankConfig`/`TimebankSettings`/`CreateRoomOptions`/`Player`/`Room` экспортируются из GameManager. Низкий риск, 264 теста ✓, сервер чисто перезапустился (боты пересозданы через makeRoom). ✅ BankrollService (2026-06-04). Дальше 🔥: Broadcaster (io.emit 20+ мест + защита карт §0.1), TimerService (последнему — fake-timer тесты вперёд).
- 🔄 **TimerService** — 5 видов таймеров (ход/таймбанк Phase1-2/автостарт/disconnect/showdown) размазаны по ~8 методам, защита от гонок дублируется. Самая хрупкая зона. ✅ **Тесты-обвязка готова (2026-06-05)**: lifecycle.test.ts уже плотно покрывал auto-fold/check, timebank Phase1-2, timebank exhausted, disconnect-30с, autostart, cleanup→autostart; добавлен [GameManager.timers.test.ts](../server/src/game/__tests__/GameManager.timers.test.ts) (3 теста) — отмена autostart при уходе игрока + отмена pending auto-fold при действии (race-guard). 267 тестов ✓. ✅ **Race-guard дедуплицирован (2026-06-05)**: проверка «ход всё ещё за userId + не сфолдил» и auto-action (canCheck→check/fold) вынесены в `timeoutTarget()`/`autoActOnTimeout()` — раньше дублировались в обоих setTimeout-колбэках. Поведение 1:1, 267 тестов ✓. **Осталось: вынос таймеров в отдельный модуль** (timers живут на Room; autostart упирается в локальный SOCKET_EVENTS как Broadcaster — делать вместе с ним или после). Это уже не дублирование, а перенос владения — отдельным осторожным заходом.
- ✅ ~~**BankrollService**~~ — сделано 2026-06-04. [bankrollService.ts](../server/src/game/bankrollService.ts): `getUserChips`/`persistChips` — единственная точка чтения/записи chips юзеров (§0.4). Без io/SOCKET_EVENTS: `notify`/`getBotChips`/`persistBotChips` инжектятся колбэками из GameManager (нет циклического импорта). `notifyBankroll` (io-связанный) остался в GameManager. Call-sites (canJoinRoom/addPlayer/removePlayer/seatBot/adminKick) → `this.bankroll.*`. 264 теста ✓ (bankroll-логи в тестах подтверждают debit/credit), сервер чисто перезапустился. `persistRoomChips` (мёртвый код) оставлен в GameManager нетронутым.
- 🔄 **Broadcaster** — ✅ §0.1-ядро вынесено 2026-06-05: персонализация карт (`canSeeCards`) → чистый [gameStateSerializer.ts](../server/src/game/gameStateSerializer.ts) `serializeGameState(room, viewerId, withPeek)`, `getGameState` делегирует. Покрыто [gameStateSerializer.test.ts](../server/src/game/__tests__/gameStateSerializer.test.ts) (7 тестов: карты скрыты/свои/showdown/peek/futureBoard/timebank). **Осталось** (опц.): сам транспорт `broadcastGameState` (io.emit + per-socket override) оставлен в GameManager — корректен, io/SOCKET_EVENTS-связан, менять рискованно (§10 perf-first). Полная обёртка io.emit — низкая ценность/высокая связность, не делаю без нужды (§1).
- ✅ ~~**RoomStore** — литерал `Room`/`Player` дублируется~~ — сделано 2026-06-04: `makeRoom()` + `createPlayer()` (см. шапку §B).
- ✅ ~~Сериализаторы~~ — сделано 2026-06-05: `getRoomList`/`getAdminRoomList` → чистые мапперы в [roomSerializers.ts](../server/src/game/roomSerializers.ts) (`toRoomInfo`/`toAdminRoom`, `AdminRoomView`). `RoomInfo` экспортируется из GameManager; типы RoomStatus/GamePhase взяты из канонического [types.ts](../server/src/game/types.ts) (структурно ≡ локальным копиям GameManager — §A). 267 тестов ✓.
- 🔄 **BettingRules** — ✅ валидация рейза вынесена 2026-06-05: [bettingRules.ts](../server/src/game/bettingRules.ts) `minRaiseTo()`/`isLegalRaise()` (min-raise + исключение all-in коротких стеков), call-site в handlePlayerAction → `isLegalRaise(...)`. Поведение 1:1 (faithful), + [bettingRules.test.ts](../server/src/game/__tests__/bettingRules.test.ts) (10 тестов), 277 всего ✓. **Осталось:** сверка с POKER_RULES.md и закрытие расхождений A1/A3 — отдельная задача (смена поведения, НЕ рефактор, §0.5).
- 🔄 **PhaseMachine** — ✅ seed: чистый предикат `isRoundComplete(room)` вынесен в [phaseRules.ts](../server/src/game/phaseRules.ts) 2026-06-05 (+ [phaseRules.test.ts](../server/src/game/__tests__/phaseRules.test.ts), 5 тестов). **Осталось:** `advancePhase` (мутирует/раздаёт карты/broadcast — entangled, нужен Broadcaster рядом).
- 📌 **ShowdownService** (side-pots отделить от таймбанка/автостарта в `cleanupHand`).

**C. Сервер: [index.ts](../server/src/index.ts) (god-файл 709 → ~60 стр.)** ✅ сделано 2026-06-04.
- ✅ ~~Роуты 5 доменов + socket-слой + 140 строк валидации~~ — `index.ts` теперь slim bootstrap (app/io/gameManager + монтаж роутеров + socket + listen). Роутеры: [routes/auth.routes.ts](../server/src/routes/auth.routes.ts) (register/login/telegram/me), [routes/admin.routes.ts](../server/src/routes/admin.routes.ts) (design/users/rooms/settings/bots/decks — `adminMiddleware` на уровне роутера), [routes/public.routes.ts](../server/src/routes/public.routes.ts) (health/decks/rooms/design/timebank). Валидация settings → [routes/settingsValidation.ts](../server/src/routes/settingsValidation.ts). Socket-слой → [socket/registerSocketHandlers.ts](../server/src/socket/registerSocketHandlers.ts) (+ emoji-кулдаун инлайн).
- ✅ ~~JWT 3× + single-session~~ — единый [auth/verifyToken.ts](../server/src/auth/verifyToken.ts) (использует authMiddleware/adminMiddleware/io.use). Single-session → [socket/sessionManager.ts](../server/src/socket/sessionManager.ts) (`forceDisconnectOtherSessions`/`hasOtherActiveSocket`). ✅ Тест sessionManager — сделано 2026-06-05: [sessionManager.test.ts](../server/src/socket/__tests__/sessionManager.test.ts) (5 тестов, мини-мок io с disconnect).
- Верификация: typecheck+guard+249 тестов ✓; smoke-старт (init весь прошёл) + curl health/decks/admin-401/timebank/auth-400 ✓; dev-сервер перезапустился чисто (10 node.exe).

**D. Сервер: боты**
- ✅ ~~Golden-тесты [botBrain.ts](../server/src/game/botBrain.ts) ДО распила~~ — сделано 2026-06-04. [botBrain.test.ts](../server/src/game/__tests__/botBrain.test.ts): 67 тестов — инварианты чистых хелперов (RNG-детерминизм, preflop/postflop/peek strength, riskShift/PnLZone, raiseSize, runtime/sliding-window) + characterization-фиксация `decideAction` (6 сценариев × 5 seed'ов → точные action/tag/amount). Страховочная сеть перед распилом: меняется порядок rng-вызовов/логика → golden загорается. `npm run check` зелёный (249 тестов).
- ✅ ~~`decideAction` — монолит → пайплайн правил-функций~~ — сделано 2026-06-04. Разложен в [botBrain.ts](../server/src/game/botBrain.ts) на `initDecisionState` (сила/riskShift/пороги) → `PRE_VARIANCE_RULES` (`ruleBluff`/`ruleHeroFold`/`ruleSlowplay`/`ruleMistake`, работают на сыром strength) → `applyVarianceAndBoost` (bluff-catch + noise → effective) → `POST_VARIANCE_RULES` (`ruleSPR`/`rulePotOdds`/`rulePeekPnL`) → `finalThresholdLadder` (терминальная). Каждое правило: `(DecisionState) => BotDecision | null`. Порядок rng-вызовов сохранён дословно (короткие замыкания) → golden-сеть зелёная, поведение идентично. `BASE_BY_PHASE` вынесен в модульную const.
- ✅ ~~`decideAction` скрыто мутирует `runtime` через `ctx`~~ — сделано 2026-06-05. `BotDecision` получил флаги `recordBluff`/`recordBluffCall`; decideAction их возвращает (вместо `runtime.bluff*.push`), запись в runtime — в [BotManager.scheduleBotDecision](../server/src/game/BotManager.ts). decideAction теперь чистая относительно runtime (только читает). Golden 67/67 ✓ + 2 purity-теста (recordBluff + runtime не мутируется), 289 всего.
- 💤 [BotManager.ts](../server/src/game/BotManager.ts) — 4 роли (persist/оркестрация столов/планирование) → BotRepository + BotTableOrchestrator + BotDecisionScheduler. ✅ ~~12 персон инлайн → data-файл~~ (2026-06-05: [defaultBotPersonas.ts](../server/src/game/defaultBotPersonas.ts) `DEFAULT_BOT_PERSONAS`). ✅ ~~`isBot('bot:')` дублирован 2× → `botIdentity.ts`~~ — сделано 2026-06-05: [botIdentity.ts](../server/src/game/botIdentity.ts) (`isBot`/`BOT_ID_PREFIX`); GameManager.isBot и BotManager.isBot делегируют в него.

**E. Клиент: god-страницы → хуки**
- ✅ ~~[GameRoom.tsx](../client/src/pages/GameRoom.tsx) (909) → хуки~~ — сделано 2026-06-04. Транспорт/тайминги/геометрия/пузыри вынесены: [useGameRoom](../client/src/hooks/useGameRoom.ts) (подписки gameUpdate/winner/countdown/joinDenied/error + реджойн + sendAction/leave/sendEmoji), [useTableClock](../client/src/hooks/useTableClock.ts) (единый 200ms-тикер → секунды/проценты), [useTableGeometry](../client/src/hooks/useTableGeometry.ts) (desktop эллипс + mobile presets), [useEphemeralBubbles](../client/src/hooks/useEphemeralBubbles.ts) (action/emoji пузыри с 2s-очисткой). Дубль правила блайндов → чистый [computeBlindSeats](../client/src/utils/blinds.ts) (совпадает с GameManager §884-886). GameRoom теперь ~вёрстка + UI-prefs (peek/design/presets/modals). Поведение 1:1, `npm run check` зелёный (typecheck + lint 0 ошибок + 249 тестов). Ручной QA по таргетам — не делал (нет client-тестов, §9.3-G).
- ✅ ~~[Lobby.tsx](../client/src/pages/Lobby.tsx) (1083) → хуки + компоненты~~ — сделано 2026-06-04. Shell ~190 стр. Хуки: [useLobbyData](../client/src/hooks/useLobbyData.ts) (socket-подписки + навигация + createRoom + `?create=`), [useRoomFilters](../client/src/hooks/useRoomFilters.ts) (фильтры + filtered/счётчики), [useJoinFlow](../client/src/hooks/useJoinFlow.ts) (pendingJoin password→buyin). Fetch из модалок наружу: [useTimebankConfig](../client/src/hooks/useTimebankConfig.ts) (CreateRoomModal), [useBankroll](../client/src/hooks/useBankroll.ts) (BuyInModal). Компоненты в [components/lobby/](../client/src/components/lobby/): RoomCard (+FillCircle), CreateRoomModal, PasswordModal, BuyInModal. Поведение 1:1, lint 6 warning'ов (без новых), 249 тестов ✓. denyMessages пока локальный в useLobbyData — общий с GameRoom вынос отдельно (§9.3-F).
- ✅ ~~[Admin.tsx](../client/src/pages/Admin.tsx) (1737) → модули~~ — сделано 2026-06-04. Shell (nav + диспетчер вкладок) ~165 стр.; вкладки в [pages/admin/](../client/src/pages/admin/): [DesignTab](../client/src/pages/admin/DesignTab.tsx) (+DesignSection/CardFaceDecksSection/DeckCardPreview), [PlayersTab](../client/src/pages/admin/PlayersTab.tsx), [RoomsTab](../client/src/pages/admin/RoomsTab.tsx), [SettingsTab](../client/src/pages/admin/SettingsTab.tsx) (+Timebank/BotMode секции), [BotsTab](../client/src/pages/admin/BotsTab.tsx), [DeckMappingModal](../client/src/pages/admin/DeckMappingModal.tsx) (+SlotCell); общие типы/консты → [admin/types.ts](../client/src/pages/admin/types.ts). Fetch-boilerplate 12× → [useAdminApi(token)](../client/src/hooks/useAdminApi.ts) (get/put/post/patch/del, авторизация + JSON + разбор {error}). Lint 9→6 warning'ов (load-эффекты на `.then()` не дают set-state-in-effect). Поведение сохранено; нюанс: несохранённые правки дизайна теперь сбрасываются при переключении вкладок (состояние локально, как у остальных вкладок).

**F. Клиент: socket-слой**
- ✅ ~~Подписки + дубль denyMessages~~ — сделано 2026-06-04. [useSocketEvent](../client/src/hooks/useSocketEvent.ts) (подписка с авто-`off` через ref + `enabled`-guard) — применён в [Layout](../client/src/components/layout/Layout.tsx) (BANKROLL_UPDATE/FORCE_DISCONNECT/connect_error, ручной on/off убран) и [useEphemeralBubbles](../client/src/hooks/useEphemeralBubbles.ts). `joinDenied`-словарь дедуплицирован в [config/denyMessages.ts](../client/src/config/denyMessages.ts) (`denyMessage(reason, fallback)`); useLobbyData/useGameRoom используют его (для in-game/no-chips взята формулировка GameRoom — лобби-тексты слегка изменились). Подписки GameRoom/Lobby уже в хуках после §E (useGameRoom/useLobbyData) с корректным off; их комбинированные event+mount-emit эффекты оставлены как есть (useSocketEvent покрывает только подписку, не emit). Lint 6→5 warning'ов. `gameStore`/`lobbyStore` (глубже) — не делалось, не требовалось.
- ✅ ~~`useTelegram` и `TelegramAutoLogin` читают `window.Telegram` по-разному → один `lib/telegram.ts`~~ — сделано 2026-06-05: [lib/telegram.ts](../client/src/lib/telegram.ts) (`getTelegramWebApp`/`getTelegramInitData`/`isInTelegram` + типы); оба места используют его. 287 тестов ✓.

**G. Совместная работа ИИ+человек (DX)**
> Факт: нет CI / pre-commit / typecheck-скрипта / server-eslint / client-тестов. Есть `.claude` auto-vitest hook (плюс).
- ✅ ~~Единый `npm run check` + typecheck-скрипты~~ — сделано 2026-06-03. Корневые `check` (guard → typecheck server+client → client lint → server vitest) и `check:contract`; `typecheck` в server (`tsc --noEmit`) и client (`tsc -b --noEmit`).
- ✅ ~~guard-тест синхронности SOCKET_EVENTS~~ — сделано 2026-06-03. [scripts/check-contract.mjs](../scripts/check-contract.mjs): сверяет shared↔server копию SOCKET_EVENTS и ловит socket-события в обход словаря (ratchet; baseline-долг `requestGameState`/`forceDisconnect` — warn). Сверку ПОЛЕЙ типов (GameState/Player) пока не делает — кандидат на расширение.
- ✅ ~~Клиентский type/lint-долг~~ — расчищено 2026-06-03: 7 typecheck + 20 lint → 0 ошибок. `set-state-in-effect` понижен до warn (корректные эффекты, переработка в §9.3-E); `no-unused-vars` игнорит `^_`; цвета вынесены в `components/game/seatColors.ts` (react-refresh).
- ✅ ~~Серверный typecheck-долг~~ — расчищено 2026-06-04: 9 ошибок `tsc --noEmit` в [server/src](../server/src) закрыты (bluff-счётчики считаются из массивов `bluffEventHands`/`bluffCallEventHands` по окну 50 рук; `GameState.players` → новый публичный тип `PublicPlayer` без серверных полей socketId/таймеров, §0.1; `String()`-коэрция route-`req.params`; `Number(process.env.PORT)`). Теперь `npm run check` полностью зелёный (guard + typecheck server/client + client lint + 182 теста).
- ✅ ~~Флак `hands.crossverify.test.ts`~~ — починено 2026-06-04: нормализация `Royal Flush`→`Straight Flush` при сверке КАТЕГОРИЙ с pokersolver (роял = туз-хай стрейт-флеш, одна категория; ранжирование проверяет второй тест compareHands). Игровая логика не тронута (§0.5). Проверено 6× прогонов (~42k раздач) + `npm run check` стабильно зелёный.
- 🔄 ✅ **CI на GitHub** — сделано 2026-06-05: [.github/workflows/check.yml](../.github/workflows/check.yml) (`install:all` + `npm run check` на push в main/master и каждый PR). Осталось 💤: `.claude` hook-предупреждение при Edit в `server/src` («играешь?») и при касании `server/data`; eslint на сервере.

**Рекомендованный порядок:** ✅ 1) фундамент (`check` + typecheck + guard + клиентский type/lint-долг) — 2026-06-03. ✅ 2) серверный typecheck-долг — 2026-06-04 (`npm run check` полностью зелёный). ✅ 3) контракт на клиенте: события + типы из shared (Vite-alias `@poker-room/shared`) — 2026-06-04. `PlayerView` оставлен как клиентская render-вьюшка. ✅ 4) `server/src/game/types.ts` — 2026-06-04: `Suit`/`Rank`/`Card`/`GamePhase`/`RoomStatus` (+`SUITS`/`RANKS`) в одном модуле вместо 6 копий (deck/hands/GameManager/botBrain/decks/тест-хелпер). ✅ 5a) golden-тесты ботов ([botBrain.test.ts](../server/src/game/__tests__/botBrain.test.ts), 67 тестов) — 2026-06-04. ✅ 5b) распил `decideAction` в пайплайн правил-функций под golden-сетью — 2026-06-04. ✅ §E (клиентские god-страницы) + §F-🔥 (socket-слой) + §C (index.ts→routes + verifyToken + sessionManager) закрыты 2026-06-04. Осталось по §6: GameManager→сервисы (§B, самое крупное), хвосты §D (BotManager), §A (server-local GameState/rootDir), §F-💤 (useTelegram→lib/telegram.ts), тест sessionManager (§C-📌) — по одному, под тестами, вне стола.

---

## 10. Roadmap: качество UX по образцу топ покер-приложений

> Цель — подтянуть SK Poker по UX, дизайну, кнопкам, виду стола, фичам и навигации до уровня топовых покерных приложений. Источник вдохновения — скриншоты GGPoker/ClubGG, но **без клубной модели** (см. project memory `no-clubs`).
> Форматы — только NLH + Шорт-дэк (см. `game-formats`). PLO/SNG/MTT не делаем.
> Формат пункта: 📌 — делать в ближайшую очередь, 💤 — потом, ⛔ — overkill / нерелевантно. Удалять пункты по мере выполнения.

### 10.1. Игровой стол — визуал

- 💤 **Активные опции в метаданных центра** — Run It Multiple Times, EV Cashout, Bomb Pot и т.п. Большинство пока не реализовано на сервере, добавлять по мере реализации. Имя стола (`room.name`) уже выведено через `roomName` в `GameState` (2026-05-16).
- 💤 **Стилизованные аватары** — набор готовых пресетов (король, ковбой, девушка, разные характеры). У нас сейчас только буква на градиенте.
- 💤 **Водяной знак с названием стола в центре** — субтильный логотип/название как фоновый brand-маркер.
- 💤 **Bad Beat иконка** в шапке стола — если стол участвует в Bad Beat Jackpot.
- 💤 **Анимация фишек: летят в pot и обратно к победителю** (Framer Motion).
- 💤 **Анимация раздачи** — карты выезжают от дилерской кнопки.
- ⛔ NFT-аватары / гексагональные рамки.

### 10.2. ActionPanel — preset бет-сайзы

- 💤 **Иконка «Раскладка»** (квадраты) — переключение между layout-вариантами кнопок.
- 💤 **Hotkeys** на десктопе: `F`=Fold, `C`=Check/Call, `R`=Raise, `A`=All-In.
- 💤 **Preselect (auto-check/fold/call)** — галочки «когда дойдёт ход, сразу X».

### 10.3. Поп-ап «Настройки Игры» (sidebar/gear)

> «Отражение фишек (ББ)» уже сделан в [BetPresetsModal.tsx](client/src/components/game/BetPresetsModal.tsx), «Настроить кнопки ставок» доступен по шестерёнке. Архитектурно ещё нет единого хаба настроек игры, а есть только BetPresets-модал. Остальные toggle'ы из 10.3 — кандидаты в этот будущий хаб.

- 📌 **Toggle Звуковые эффекты** (вкл/выкл звуки fold/check/win).
- 📌 **Toggle Вибрация** (для мобилы — навигатор API).
- 📌 **Toggle «Умный фокус»** — auto-подсветка/zoom активного игрока.
- ✅ ~~**3 пресета колоды**~~ — сделано 2026-05-16. `CardColorScheme = 'set1' | 'set2' | 'set3'` в [cardColors.ts](client/src/config/cardColors.ts), персональный localStorage (`sk:cardColors:v1`), секция «Колода» в [BetPresetsModal.tsx](client/src/components/game/BetPresetsModal.tsx). Set1=2 цвета, Set2=3 цвета (♦ синяя), Set3=4 цвета (♦ синяя, ♣ зелёная). См. 11.12.
- ✅ ~~**Колоды-картинки из `images/`**~~ — сделано 2026-05-20. Каждая подпапка `images/<deckName>/` = отдельная колода, файлы карт распознаются авто-парсером (стандарт `2C/10H/AS/JD…`), нестандартные имена назначаются вручную через модалку в админке. Сервер: `app.use('/decks', express.static)` + `GET /api/decks` + `PUT /api/admin/decks/:id/mapping`. Клиент: `useDecksStore` + `Card.tsx` рендерит `<img>` если выбрана колода, иначе CSS-fallback. См. 11.38.
- 💤 **Auto Top-Up модал**: два slider'а — «если фишек ниже X% — добавить до Y%» от max бай-ина. Toggle вкл/выкл.

### 10.4. Поп-ап «Информация о столе»

- ✅ ~~**Заголовок Информация о столе**~~ — сделано 2026-05-16. [TableInfoModal.tsx](client/src/components/game/TableInfoModal.tsx), открывается из кнопки `Info` в верхнем баре GameRoom. Показывает название, описание, вид игры (NLH захардкожен), блайнды, создателя, «Игроков N из M», статус, приватность, бай-ин диапазон, время на ход, ID стола. **Оставшееся время сессии** — отложено, нет `sessionDurationHours` в `Room` (см. 10.6). См. 11.15.
- ✅ ~~**Данные профиля для этого стола**~~ (частично) — сделано 2026-05-16. В секции «Моё на столе» — текущий стек, «В банке от меня» (currentBet). **Мой бай-ин / прибыль / VPIP стола** — отложено, сервер не трекает первоначальный buy-in (надо `joinedWithChips` в Player) и нет статистики раздач (см. 10.10 PokerCraft).
- 💤 **История победителей** (последние 10 раздач — кто выиграл, сколько, с какой комбинацией). Связано с PokerCraft-lite.
- 💤 **Наблюдатели** (`observers: Player[]`) — карусель аватаров. Кто сейчас просто смотрит игру (joined socket-room но не сидит).

### 10.5. Лобби (главный экран столов)

> Концепция «клуба» в проекте не используется — всё лобби живёт под одним пространством «Столы».

- ✅ ~~**Карточка стола — структура**~~ (частично) — сделано 2026-05-16. Реализовано: вертикальная зелёная плашка «NLH» слева (vertical-rl text), `FillCircle` SVG-кольцо заполнения вместо текста «3/6» в правом верхнем углу, превью игроков мини-аватарами с инициалами + пустые слоты пунктиром (`RoomInfo.players` массив пробрасывается через `getRoomList`). **Отложено:** иконки фич Bomb/VPIP/CallTime/BadBeat (фичи 💤), таймер сессии (10.6 длительность), кнопка «Встать в очередь» (waitlist 💤). См. 11.16.
- 📌 **Bad Beat Jackpot баннер** в шапке лобби — анимированный, с текущим джекпотом (`507,438.22`).
- 💤 **«Встать в очередь»** — система waitlist. Когда стол полный, можно встать в очередь; освободится место — auto-садить. Сейчас просто «Войти».
- 💤 **Пресеты фильтров блайндов**: «Микро / Низкие / Средние / Высокие» — кнопки-чипсы над списком.
- 💤 **Leaderboard иконка** в шапке (трофей) — открывает таблицу лидеров (топ игроков по выигрышу/raздачам).
- 💤 **FAB-кнопка quick actions** — быстрое меню (создать стол, перейти в admin, и т.п.).

### 10.6. Создание стола — расширенные опции

Текущий `CreateRoomModal` имеет базовые поля. Можно расширить опциями стола. Только кэш-игра (NLH / Шорт-дэк); SNG/MTT не делаем (см. memory `game-formats`).

**Общие** (любой тип):
- 📌 Заголовок (название), Размер стола (макс игроков).
- ✅ ~~**Таймбанк** (toggle): старт N сек + дополнительный после M рук на K сек.~~ — сделано 2026-05-17. Двухфазный turn-timer на сервере (`Room.timebankTimer`/`turnTimebankEndsAt`), глобал в [settings.json](server/data/settings.json) `timebank` + toggle `allowPerTableOverride`. Если override включён — секция таймбанка появляется в `CreateRoomModal` (через `GET /api/timebank-config`). На клиенте: оранжевый индикатор `⏳N` у активного игрока в Phase 2 + маленький бейдж у всех с `timebank>0`. Дефолты: enabled=true, start=30, bonus=10 каждые 10 рук, cap=60. См. 11.18.
- ✅ ~~**Описание** (toggle + textarea — описание стола)~~ — сделано 2026-05-16. Поле `description` (≤200 симв.) в `RoomInfo`/`Room`, показ в `RoomCard` курсивом под названием. См. 11.11.
- 📌 **Приватные игры** (toggle — с паролем; у нас уже есть).
- 💤 «Закрепить сверху» (для админа — pin важных столов).
- 💤 «Следующий шаг (сателлит)» — связь с другим турниром.

**Только кэш (Кольцевая игра)**:
- 📌 **Блайнды slider** — числовые input'ы остались как есть. ✅ Пресеты Микро/Низкие/Средние/Высокие — сделано 2026-05-16 (`BLIND_PRESETS` в Lobby.tsx, чипсы в CreateRoomModal).
- 📌 **Анте** (с/+).
- 📌 **Длительность игры**: 12 часов slider (после — авто-закрытие).
- 💤 **Авторизация бай-ина** — toggle: каждый бай-ин юзера должен быть одобрен админом вручную (для приватных столов).
- 💤 **Страдл** (toggle).
- 💤 **Рейк (% + Cap)**.
- 💤 **CallTime** — таймер на ход.
- 💤 **Без рэтхола: 6 часов** — нельзя сесть с пустым стеком после ухода (сохранять `leftWithChips` в users.json + timestamp).
- 💤 **Bomb Pot** — все обязательно вносят префлоп, сразу флоп.
- 💤 **Double Board** — два борда постоянно.
- 💤 **All-in страховка** (toggle опция стола).
- 💤 **EV Cashout** (toggle опция стола).
- 💤 **Запустить несколько раз** (Run It Multiple Times — toggle опция стола).
- 💤 **No Turn No Show** — анти-чит, обязан показать руку.
- 💤 **Обязательный VPIP** — играть N% рук иначе fold.
- 💤 **Ограничение игры**: IP / GPS / Устройство / Чат — anti-collusion фильтры.
- 💤 **Автопродление**: продлить сессию автоматически.
- 💤 **Бэд-бит Джекпот** (toggle — стол участвует).
- ⛔ **Squid Game** — VIP-формат, не делаем.
- ⛔ **All-In or Fold (AoF)** — отдельный формат, можно сделать как простой режим (только две кнопки).

**Только SNG**:
- 📌 **Общий бай-ин + (Приз + Рейк)** — например 100 = 90+10.
- 📌 **Стартовые фишки** (1000 по умолчанию).
- 📌 **Структура блайндов**: Медленно / Стандартная / Турбо / Гипер Турбо.
- 📌 **Повышение уровня блайндов**: N минут.
- 💤 **Структура выплат**: Тип 1-4 (winner-takes-all / 50-30-20 / etc).
- 💤 **Количество столов** (multi-table SNG).
- ⛔ **Spin & Gold** — отдельный jackpot формат.

**Только Турнир (MTT)**:
- 📌 Min/max игроков (двухсторонний slider).
- 📌 **Ре-энтри** (toggle).
- 📌 **Гарантированный приз** (toggle + сумма).
- 💤 **Структура выплат**: 10% / 12% / 15% / 20% ITM.
- 💤 **Late registration** (поздняя регистрация).
- 💤 **Final Table Deal** — на финалке игроки могут договориться.
- 💤 **Время перерыва** (5 мин каждые 55 мин).
- 💤 **Многодневный турнир**.
- 💤 **Баунти за выбитого** (PKO/bounty).

**Кнопка «Сохранить Шаблон»** — сохранять конфиг для повторного использования (📌 для админа удобно).

### 10.7. Админка — расширение

Сейчас у нас 4 вкладки. Кандидаты на расширение:

- 📌 **Статистика по форматам**: NLH + Шорт-дэк (когда появится) — метрики (игры, раздачи, банк, рейк). Серверу нужны счётчики в `room.stats` или отдельный `stats.json`.
- 💤 **Таблица лидеров** (leaderboard) — топ-N по выигрышу, числу раздач. С админ-настройками периодов (день/неделя/всё время).
- 💤 **Bad Beat Jackpot** — настройка джекпота: формула пополнения, минимальная комбинация для активации, видимая сумма в шапке лобби. Общая для всех столов.
- 💤 **Broadcast-уведомление** — админ рассылает баннер всем пользователям при входе.

### 10.8. Управление пользователями

Текущий PlayersTab закрывает базу. Возможные расширения:

- ✅ ~~**Поиск по нику или ID**~~ — сделано 2026-05-16. Search input в PlayersTab; ищет по `username`/`publicId`/`email` (case-insensitive). См. 11.14.
- ✅ ~~**Фильтр по роли**~~ — сделано 2026-05-16. Dropdown: Все / Только админы / Только игроки / Только забаненные. Расширенные роли (Manager/SA/Agent) — отдельная задача (структурное изменение role enum).
- ✅ ~~**Сортировка**~~ — сделано 2026-05-16. По нику (А→Я через `localeCompare('ru')`), по балансу (↓), по дате регистрации (новые сверху). Сортировка «по рейку» и «по активности» — отложена, метрик в проекте пока нет.
- ✅ ~~**ID игрока в формате `XXXX-XXXX`**~~ — сделано 2026-05-16. Поле `publicId` в users.json (алфавит без 0/O/1/I), автогенерация при регистрации, миграция старых юзеров при старте через `migratePublicIds()` в [server/src/auth/auth.ts](server/src/auth/auth.ts). Показывается в Admin.tsx чипсой рядом с ником. См. 11.13.
- ✅ ~~**Флаг страны** на карточке~~ — сделано 2026-05-16. Поле `country` (ISO 3166-1 alpha-2) в users.json, селектор страны (33 страны) в Admin.tsx, флаг через regional-indicator pair в [client/src/utils/country.ts](client/src/utils/country.ts). PATCH /api/admin/users/:id принимает country. На Windows-браузерах flag-emoji не рендерится — fallback на текстовый код. См. 11.13.
- 💤 **Псевдоним (alias)** — необязательное поле, отображается админу для напоминания «кто это».

### 10.9. Массовое управление фишками

Отдельная вкладка в админке для **массовой выдачи/возврата фишек**.

- 📌 **Массовая выдача**: список юзеров с чекбоксами → выбрать N юзеров → кнопки **«Выдать»** (зелёная) / **«Вернуть»** (красная) с указанием суммы. Применяется ко всем выбранным сразу.
- 📌 **Сводка**: счётчик «всего фишек в обращении» (сумма chips по всем юзерам) — индикатор инфляции/дефляции в системе.
- 💤 **«Запрос фишек»** — таб с запросами от игроков на пополнение (если появится в-app кошелёк).
- 💤 **История операций** — лог всех админских выдач/возвратов.

### 10.10. PokerCraft-lite (история и аналитика)

- 💤 **История рук** — все раздачи сохраняются в `hands.json` (с deck, board, всеми actions). Доступно админу (все раздачи) и игроку (его руки).
- 💤 **Replay руки** — пошаговая прокрутка фаз (preflop → flop → turn → river → showdown) с воспроизведением actions. Табличный вид + визуальный.
- 💤 **Графики банкролла** — win/loss по сессиям, win-rate в BB/100, breakdown по формату/blinds. Recharts.
- 💤 **Smart HUD-lite**: считать VPIP, PFR, ATS, 3BET по истории игрока, показывать **в плашке у аватара** на столе (число рядом с ником, как у GG: `69` = VPIP%).
- 💤 **Заметки на оппонентов** — приватные в `users.json:notes: { [targetId]: text }`, поп-ап на клик по аватару.

### 10.11. (зарезервировано)

> Раздел «Турниры и зона членства» удалён 2026-05-16 — клубной модели нет, SNG/MTT/сателлиты тоже (см. project memory `no-clubs` и `game-formats`).

### 10.12. Социальное и геймификация

- 💤 **Rabbit Hunting** — после раздачи показать что пришло бы. Сервер уже хранит `deck`.
- 💤 **Hand-strength индикатор** под моими картами в realtime («Пара тузов», «Стрит-дро»).
- 💤 **Refer-a-friend** — реферальная система с купонами/бонусами (без клубной обёртки — просто реферальный код пользователя).
- 💤 **Бейджи/достижения**.

### 10.13. Уведомления (Inbox)

- 💤 **Страница «Входящие»** в профиле — единый список без табов.
- 💤 **Список событий**: «Получены фишки от админа», «Вас забанили/разбанили», «Бад-бит-джекпот сорван N», broadcast от админа. Цветовое выделение типа события.
- 💤 **Socket-event `INBOX_NOTIFICATION` + хранение в JSON** для офлайн-чтения.
- 💤 **Индикатор непрочитанных** (точка/число) на иконке профиля.

### 10.14. Профиль игрока

- 💤 **Страница `/profile`**: аватар + ник + ID (`XXXX-XXXX`) + флаг + кнопка «Данные Аккаунта».
- 💤 **Меню**: PokerCraft (история раздач), Настройки игры, Входящие, Язык, Помощь.
- 💤 **Reference banner** — Refer-a-friend.

### 10.15. Аккаунт и безопасность

- 💤 **Страница «Данные Аккаунта»**: email, связанные аккаунты (OAuth/Telegram), KYC статус.
- 💤 **2FA** — toggle вкл/выкл (TOTP через `speakeasy` или подобное).
- 💤 **Мои устройства** — список активных сессий (где JWT выдан). Возможность revoke. Уже частично есть (single-session) — расширить.
- 💤 **Ключ доступа** (passkey/WebAuthn) — overkill.

### 10.16. Mobile-специфика

- ✅ ~~**Нижний tab-bar** (Меню / Лобби / Профиль)~~ — сделано 2026-05-16. В [Layout.tsx](client/src/components/layout/Layout.tsx) bottom-fixed nav на mobile (`md:hidden`). Главная (`/`) + Лобби (`/lobby`) активны, Профиль disabled-«скоро» (страница 10.14 не реализована). Скрыт на `/game/*`, `/login`, `/register`, для гостей. Учитывает safe-area-inset-bottom. На desktop симметричные ссылки в верхнем navbar. См. 11.17.
- ✅ ~~**Mobile-редизайн GameRoom**~~ — сделано 2026-05-18. На `/game/` mobile Layout navbar полностью скрыт, GameRoom занимает весь экран (`h-[100dvh]`), верхний бар содержит balance + admin-кнопку + фазу/info/eye/smile/settings/выйти (все 36×36 иконки). Phase перенесена из бара в центр стола. На desktop без изменений. См. 11.21.
- 💤 **Тап-по-аватару = поп-ап** с инфой и статами игрока (для Smart HUD-lite).
- 💤 **Swipe между столами** при мульти-таблинге.
- 💤 **Portrait/landscape lock** — пользователь выбирает ориентацию.
- 💤 **Push-уведомления** — сервис-воркер + Push API.

### 10.17. Системные мелочи UX

- 💤 **Иконки `lucide-react`** или похожие — у GG строгий минималистичный icon-set. Уже используем lucide — продолжить.
- 💤 **«Шаблоны» (templates)** для создания столов — сохранять конфиг и переиспользовать.

---

