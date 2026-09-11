import { describe, it, expect, beforeEach } from 'vitest';
import { loadGameSettings, saveGameSettings, DEFAULT_GAME_SETTINGS } from './gameSettings';

describe('loadGameSettings / saveGameSettings — handStrengthMode', () => {
  beforeEach(() => localStorage.clear());

  it('дефолт — category при пустом хранилище', () => {
    expect(loadGameSettings().handStrengthMode).toBe('category');
  });

  it('сохраняет и читает equity', () => {
    saveGameSettings({ ...DEFAULT_GAME_SETTINGS, handStrengthMode: 'equity' });
    expect(loadGameSettings().handStrengthMode).toBe('equity');
  });

  it('старая запись без поля (до добавления фичи) — откат на category', () => {
    localStorage.setItem('sk:gameSettings:v1', JSON.stringify({ soundEnabled: false }));
    expect(loadGameSettings().handStrengthMode).toBe('category');
  });

  it('мусорное значение в хранилище — откат на category', () => {
    localStorage.setItem('sk:gameSettings:v1', JSON.stringify({ handStrengthMode: 'not-a-real-mode' }));
    expect(loadGameSettings().handStrengthMode).toBe('category');
  });
});

describe('loadGameSettings — раскладка кнопок и ориентация (§10.2, §10.16)', () => {
  beforeEach(() => localStorage.clear());

  it('дефолты — обычная раскладка и системная ориентация', () => {
    const s = loadGameSettings();
    expect(s.mirroredActions).toBe(false);
    expect(s.orientationLock).toBe('auto');
  });

  it('сохраняет и читает зеркальную раскладку', () => {
    saveGameSettings({ ...DEFAULT_GAME_SETTINGS, mirroredActions: true });
    expect(loadGameSettings().mirroredActions).toBe(true);
  });

  it('сохраняет и читает выбранную ориентацию', () => {
    saveGameSettings({ ...DEFAULT_GAME_SETTINGS, orientationLock: 'landscape' });
    expect(loadGameSettings().orientationLock).toBe('landscape');
  });

  it('старая запись без новых полей — откат на дефолты, ничего не падает', () => {
    localStorage.setItem('sk:gameSettings:v1', JSON.stringify({ soundEnabled: false }));
    const s = loadGameSettings();
    expect(s.mirroredActions).toBe(false);
    expect(s.orientationLock).toBe('auto');
  });

  it('мусорная ориентация в хранилище — откат на auto', () => {
    localStorage.setItem('sk:gameSettings:v1', JSON.stringify({ orientationLock: 'diagonal' }));
    expect(loadGameSettings().orientationLock).toBe('auto');
  });
});
