// Anti-collusion (доделка §10.6): запрет занимать два места за одним столом с тем же
// IP-адресом или device-id. Чистая функция — без доступа к Room/Player напрямую.

export interface NetworkInfo {
  ip: string;
  deviceId: string;
}

// true, если candidate совпадает по ip ИЛИ deviceId с кем-то из уже сидящих. Пустые строки
// (ip/deviceId не определены) не считаются совпадением — иначе все «безымянные» столкнутся.
export function hasNetworkCollision(seated: NetworkInfo[], candidate: NetworkInfo): boolean {
  return seated.some((s) =>
    (candidate.ip !== '' && s.ip === candidate.ip) ||
    (candidate.deviceId !== '' && s.deviceId === candidate.deviceId)
  );
}
