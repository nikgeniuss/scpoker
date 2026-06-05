// Базовый адрес сервера. Приоритет:
// 1. VITE_API_URL из .env — explicit override (для tunnel/production deploy).
// 2. Иначе — динамика по window.location.hostname:3001 (localhost dev, LAN access по public IP).
// Для прохождения через Cloudflare tunnel — в client/.env поставить VITE_API_URL=https://api.poker-hub.city
// и рестартовать Vite (.env не подхватывается на лету).
const SERVER_PORT = 3001;
const envApiUrl = (import.meta.env.VITE_API_URL as string | undefined)?.trim();

export const BASE_URL =
  envApiUrl && envApiUrl.length > 0
    ? envApiUrl
    : typeof window !== 'undefined'
      ? window.location.protocol + '//' + window.location.hostname + ':' + SERVER_PORT
      : 'http://localhost:' + SERVER_PORT;

export const API_URL = BASE_URL + '/api';
