# GStack workflow

> Вынесено из `CLAUDE.md §11` 2026-06-12 (разгрузка always-loaded CLAUDE.md). Читать при работе со skill'ами GStack.

В окружении установлен [GStack](https://github.com/garrytan/gstack) (`~/.claude/skills/gstack/`) — 48+ skills. Использовать **проактивно**.

| Триггер от пользователя или контекст                                                | Какой skill вызвать                  | Почему                                                              |
| ----------------------------------------------------------------------------------- | ------------------------------------ | ------------------------------------------------------------------- |
| «баг», «не работает», «500», stack trace, exception в логе                          | `/investigate`                       | Root-cause через 4 фазы                                             |
| «протестируй UI», «проверь как выглядит», «UI ломается на mobile»                   | `/qa` (или `/qa-only` без правок)    | Реальный браузер на http://localhost:5173                           |
| «давай задеплоим», «ship», «push в master»                                          | `/ship`                              | VERSION/CHANGELOG/commit/push/PR одним проходом                     |
| Перед merge/ship — пользователь о ревью просит или сам обнаружил риски              | `/review`                            | Pre-landing diff review                                             |
| «security audit», «JWT в порядке?», «CORS», работа с auth.ts                        | `/cso`                               | OWASP+STRIDE + secrets archaeology                                  |
| Идея новой фичи без кода («хочу добавить шорт-дэк»)                                 | `/office-hours`                      | 6 forcing questions перед кодом                                     |
| План фичи готов, надо отшлифовать архитектуру                                       | `/autoplan` или `/plan-eng-review`   | Архитектура/edge cases/performance                                  |
| «общее состояние кода», «health check»                                              | `/health`                            | Композитный 0-10 score                                              |
| Правлю один модуль, не хочу задеть остальные                                        | `/freeze <dir>` + потом `/unfreeze`  | Сессия-локальный замок Edit/Write                                  |
| Работа с `server/data/*.json` (реальные банкроллы)                                  | `/careful` или `/guard`              | Warns перед rm/DROP                                                 |
| После merge PR — обновить документацию                                              | `/document-release`                  | Reads diff, updates README/ARCHITECTURE                             |

**Не делать**:
- `/qa` на проде без `/careful`.
- `/ship` в фоне без подтверждения.
- `/freeze` до того как осмотрелся в коде.
- `/cso` на каждый чих (тяжёлый).
- Браузер ad-hoc через mcp/puppeteer/playwright — только `/browse`, `/qa`, `/scrape`.
