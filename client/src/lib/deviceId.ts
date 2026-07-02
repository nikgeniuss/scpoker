// Anti-collusion (доделка §10.6): device-id для запрета второго места за тем же столом
// с того же устройства. Не настоящий fingerprint (canvas/WebGL) — просто случайный UUID,
// сгенерированный один раз и сохранённый в localStorage. Очищается вручную (известное
// ограничение, см. план реализации) — для casual anti-collusion достаточно, новую
// fingerprint-зависимость без отдельной задачи не добавляем (§1).
const STORAGE_KEY = 'sk:deviceId';

export function getDeviceId(): string {
  let id = localStorage.getItem(STORAGE_KEY);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(STORAGE_KEY, id);
  }
  return id;
}
