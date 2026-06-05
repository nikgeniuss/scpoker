import { readJSON, writeJSON } from '../auth/storage.js';

// Сервис банкролла: единственная точка чтения/записи chips юзеров в users.json (§0.4 — только
// через writeJSON). Вынесен из GameManager (ROADMAP §9.3-B). Без прямой связи с io/SOCKET_EVENTS:
// нотификация клиентов и доступ к ботам инжектятся колбэками (notify/getBotChips/persistBotChips),
// чтобы сервис оставался изолированным и не тянул циклический импорт.
export interface BankrollDeps {
  isBot: (id: string) => boolean;
  getBotChips: (id: string) => number | null;            // chips бота из BotManager
  persistBotChips: (id: string, chips: number) => void;  // запись chips бота (bots.json)
  notify: (userId: string, chips: number) => void;       // пуш банкролла в сокеты юзера
}

export class BankrollService {
  constructor(private deps: BankrollDeps) {}

  // Прочитать chips юзера из users.json (для ботов — из BotManager)
  getUserChips(userId: string): number | null {
    if (this.deps.isBot(userId)) {
      return this.deps.getBotChips(userId);
    }
    try {
      const users = readJSON('users.json') as Array<{ id: string; chips: number }>;
      const u = users.find(x => x.id === userId);
      return u ? u.chips : null;
    } catch {
      return null;
    }
  }

  // Сохранить chips одного юзера обратно в users.json + уведомить его клиенты.
  // Для бота — обновить bots.json через BotManager (без сокет-нотификации).
  persistChips(userId: string, chips: number): void {
    if (this.deps.isBot(userId)) {
      this.deps.persistBotChips(userId, chips);
      return;
    }
    try {
      const users = readJSON('users.json') as Array<{ id: string; username?: string; chips: number }>;
      const idx = users.findIndex(u => u.id === userId);
      if (idx >= 0 && users[idx].chips !== chips) {
        const before = users[idx].chips;
        const name = users[idx].username ?? userId;
        users[idx].chips = chips;
        writeJSON('users.json', users);
        this.deps.notify(userId, chips);
        console.log(`💼 [bankroll] ${name}: ${before} → ${chips} (Δ${chips - before >= 0 ? '+' : ''}${chips - before})`);
      }
    } catch {}
  }
}
