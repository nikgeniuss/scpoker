// Трекер длительности сессии для лимита времени (ROADMAP §11.2) — только предупреждение,
// без форс-логаута. Один таймер на userId, а не на socketId: мультитейблинг (несколько
// открытых столов = несколько сокетов того же юзера) не должен сбрасывать отсчёт сессии.
// Чистая структура (без io) — orchestация (когда стартовать/чистить/слать уведомление)
// в GameManager, как и FREEZE_THRESHOLD_MS/getFreezeInfo в tableWatchdog.ts.
export class SessionTimeWatchdog {
  private sessions = new Map<string, { since: number; warned: boolean }>();

  onConnect(userId: string, now = Date.now()): void {
    if (!this.sessions.has(userId)) this.sessions.set(userId, { since: now, warned: false });
  }

  // Вызывать только когда у юзера не осталось ни одного активного сокета (см. hasOtherActiveSocket).
  onDisconnect(userId: string): void {
    this.sessions.delete(userId);
  }

  // Возвращает userId, чья сессия только что пересекла свой лимит на этом тике (warned
  // выставляется сразу — предупреждаем один раз за сессию, не на каждый тик).
  tick(now: number, limitMinutesFor: (userId: string) => number | undefined): string[] {
    const crossed: string[] = [];
    for (const [userId, s] of this.sessions) {
      if (s.warned) continue;
      const limit = limitMinutesFor(userId);
      if (!limit || limit <= 0) continue;
      const elapsedMin = (now - s.since) / 60_000;
      if (elapsedMin >= limit) {
        s.warned = true;
        crossed.push(userId);
      }
    }
    return crossed;
  }
}
