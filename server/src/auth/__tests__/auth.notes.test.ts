import { describe, it, expect, beforeEach, vi } from 'vitest';

// Тот же in-memory мок storage, что у GameManager/clubService тестов (helpers/storage.ts).
vi.mock('../storage.js', () => import('../../game/__tests__/helpers/storage.js'));

import { setStorage, clearStorage } from '../../game/__tests__/helpers/storage.js';
import { getOpponentNotes, setOpponentNote } from '../auth.js';

interface MinimalUser {
  id: string;
  opponentNotes?: Record<string, string>;
}

beforeEach(() => clearStorage());

function seedUsers(users: MinimalUser[]): void {
  setStorage('users.json', users);
}

describe('getOpponentNotes', () => {
  it('возвращает пустой объект если заметок нет', () => {
    seedUsers([{ id: 'u1' }]);
    expect(getOpponentNotes('u1')).toEqual({});
  });

  it('возвращает пустой объект для неизвестного юзера', () => {
    seedUsers([{ id: 'u1' }]);
    expect(getOpponentNotes('ghost')).toEqual({});
  });

  it('возвращает сохранённые заметки', () => {
    seedUsers([{ id: 'u1', opponentNotes: { u2: 'играет тайтово' } }]);
    expect(getOpponentNotes('u1')).toEqual({ u2: 'играет тайтово' });
  });
});

describe('setOpponentNote', () => {
  it('создаёт заметку на оппонента (с обрезкой пробелов)', () => {
    seedUsers([{ id: 'u1' }]);
    const result = setOpponentNote('u1', 'u2', '  играет тайтово  ');
    expect(result).toEqual({ u2: 'играет тайтово' });
    expect(getOpponentNotes('u1')).toEqual({ u2: 'играет тайтово' });
  });

  it('пустой/пробельный текст удаляет заметку', () => {
    seedUsers([{ id: 'u1', opponentNotes: { u2: 'старая заметка' } }]);
    const result = setOpponentNote('u1', 'u2', '   ');
    expect(result).toEqual({});
    expect(getOpponentNotes('u1')).toEqual({});
  });

  it('не затрагивает заметки на других оппонентов', () => {
    seedUsers([{ id: 'u1', opponentNotes: { u2: 'a', u3: 'b' } }]);
    setOpponentNote('u1', 'u2', 'c');
    expect(getOpponentNotes('u1')).toEqual({ u2: 'c', u3: 'b' });
  });

  it('заметки приватны — у другого юзера свой набор', () => {
    seedUsers([{ id: 'u1' }, { id: 'u2' }]);
    setOpponentNote('u1', 'target', 'note from u1');
    expect(getOpponentNotes('u2')).toEqual({});
  });

  it('неизвестный юзер — no-op, возвращает {}', () => {
    seedUsers([{ id: 'u1' }]);
    const result = setOpponentNote('ghost', 'u2', 'text');
    expect(result).toEqual({});
  });
});
