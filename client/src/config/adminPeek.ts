// Тоггл «глаз админа» — сохраняем локально, чтобы не сбрасывался при сворачивании ТГ
// (TWA может пересоздать WebView при возврате из фона — стейт компонента теряется).

const STORAGE_KEY = 'sk:adminPeek:v1';

export function loadAdminPeek(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'true';
  } catch {
    return false;
  }
}

export function saveAdminPeek(v: boolean): void {
  try {
    localStorage.setItem(STORAGE_KEY, v ? 'true' : 'false');
  } catch {
    // ignore
  }
}
