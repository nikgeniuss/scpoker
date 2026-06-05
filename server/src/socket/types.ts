// Пользователь, декодированный из JWT и положенный в socket.data.user.
export interface SocketUser {
  id: string;
  username: string;
  role: string;
}
