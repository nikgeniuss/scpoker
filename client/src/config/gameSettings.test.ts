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
