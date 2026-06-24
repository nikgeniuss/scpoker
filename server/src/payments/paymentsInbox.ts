// Уведомления «Входящие» по депозитам/выводам — инжектируется из index.ts (там есть io
// через GameManager.sendInboxNotification), чтобы payments-домен не тянул транспорт (§0.11).
let notifyFn: (userId: string, type: 'deposit' | 'withdrawal', text: string) => void = () => {};

export function setPaymentsInboxNotifier(fn: typeof notifyFn): void {
  notifyFn = fn;
}

export function notifyPaymentsInbox(userId: string, type: 'deposit' | 'withdrawal', text: string): void {
  notifyFn(userId, type, text);
}
