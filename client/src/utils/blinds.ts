// Правило позиций блайндов. ДУБЛИРУЕТ серверную формулу (GameManager.startGame, §884-886):
//   heads-up (N=2): D=SB, BB=D+1;
//   multi-way:      SB=D+1, BB=D+2.
// Вынесено в чистую функцию, чтобы клиент считал по той же формуле, что и сервер
// (ROADMAP §9.3-E). Истинное «общее» с сервером упирается в rootDir (§9.3-A) — пока копия,
// но единая точка на клиенте вместо инлайна в GameRoom.
export function computeBlindSeats(
  playerCount: number,
  dealerIndex: number,
): { sbIndex: number; bbIndex: number } | null {
  if (playerCount < 2) return null;
  const n = playerCount;
  const d = dealerIndex;
  const isHU = n === 2;
  const sbIndex = isHU ? d : (d + 1) % n;
  const bbIndex = isHU ? (d + 1) % n : (d + 2) % n;
  return { sbIndex, bbIndex };
}
