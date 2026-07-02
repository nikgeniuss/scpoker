import type { InboxNotification } from '@poker-room/shared';

// Уведомления «Входящие» по депозитам/выводам (+ предупреждения лимита депозита, ROADMAP §11.2) —
// инжектируется из index.ts (там есть io через GameManager.sendInboxNotification), чтобы
// payments-домен не тянул транспорт (§0.11).
let notifyFn: (userId: string, type: InboxNotification['type'], text: string) => void = () => {};

export function setPaymentsInboxNotifier(fn: typeof notifyFn): void {
  notifyFn = fn;
}

export function notifyPaymentsInbox(userId: string, type: InboxNotification['type'], text: string): void {
  notifyFn(userId, type, text);
}
