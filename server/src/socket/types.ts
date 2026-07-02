// Пользователь, декодированный из JWT и положенный в socket.data.user.
export interface SocketUser {
  id: string;
  username: string;
  role: string;
  sid?: string; // id сессии (ROADMAP §10.15 «Мои устройства») — отсутствует у токенов, выпущенных до этой фичи
}
