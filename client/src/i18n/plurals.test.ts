import { describe, it, expect, beforeAll } from 'vitest';
import i18n from 'i18next';
import { ru } from './locales/ru';
import { en } from './locales/en';

// Склонения (ROADMAP §9.4). Раньше строки со счётчиком были в одной форме — «1 рук»,
// «1 игроков онлайн», «1 участников», плюс ручной ternary прямо в JSX главной AK-скина.
// i18next выбирает форму через Intl.PluralRules: для русского это _one/_few/_many/_other.

beforeAll(async () => {
  await i18n.init({
    resources: { ru: { translation: ru }, en: { translation: en } },
    lng: 'ru',
    fallbackLng: 'ru',
    interpolation: { escapeValue: false },
  });
});

const ruT = (key: string, count: number) => i18n.getFixedT('ru')(key, { count });
const enT = (key: string, count: number) => i18n.getFixedT('en')(key, { count });

describe('русские склонения по счётчику', () => {
  it('руки в HUD: 1 рука / 2 руки / 5 рук', () => {
    expect(ruT('playerInfoPopup.hudHands', 1)).toBe('1 рука');
    expect(ruT('playerInfoPopup.hudHands', 2)).toBe('2 руки');
    expect(ruT('playerInfoPopup.hudHands', 5)).toBe('5 рук');
  });

  it('составные числа склоняются по последней цифре, а не по величине', () => {
    expect(ruT('playerInfoPopup.hudHands', 21)).toBe('21 рука');
    expect(ruT('playerInfoPopup.hudHands', 22)).toBe('22 руки');
    expect(ruT('playerInfoPopup.hudHands', 25)).toBe('25 рук');
  });

  it('11-14 — исключение, всегда родительный множественного', () => {
    expect(ruT('playerInfoPopup.hudHands', 11)).toBe('11 рук');
    expect(ruT('playerInfoPopup.hudHands', 14)).toBe('14 рук');
  });

  it('игроки онлайн на главной', () => {
    expect(ruT('mainMenu.playersOnline', 1)).toBe('1 игрок онлайн');
    expect(ruT('mainMenu.playersOnline', 3)).toBe('3 игрока онлайн');
    expect(ruT('mainMenu.playersOnline', 10)).toBe('10 игроков онлайн');
  });

  it('участники клуба (бывший ручной ternary в JSX)', () => {
    expect(ruT('mainMenu.clubMembers', 1)).toBe('1 участник');
    expect(ruT('mainMenu.clubMembers', 4)).toBe('4 участника');
    expect(ruT('mainMenu.clubMembers', 5)).toBe('5 участников');
    // Прежний ternary ломался ровно здесь: 21 → «участников» вместо «участник».
    expect(ruT('mainMenu.clubMembers', 21)).toBe('21 участник');
  });

  it('очередь за столом: 1 ждёт / 2 ждут', () => {
    expect(ruT('lobby.joinQueueWaiting', 1)).toBe('Занять очередь (1 ждёт)');
    expect(ruT('lobby.joinQueueWaiting', 2)).toBe('Занять очередь (2 ждут)');
  });

  it('часы в модалке создания стола — без «час(ов)»', () => {
    expect(ruT('createRoomModal.hoursValue', 1)).toBe('1 час');
    expect(ruT('createRoomModal.hoursValue', 2)).toBe('2 часа');
    expect(ruT('createRoomModal.hoursValue', 6)).toBe('6 часов');
  });

  it('автостарт по числу игроков', () => {
    expect(ruT('createRoomModal.playersStepper', 1)).toBe('1 Игрок');
    expect(ruT('createRoomModal.playersStepper', 2)).toBe('2 Игрока');
    expect(ruT('createRoomModal.playersStepper', 9)).toBe('9 Игроков');
  });
});

describe('английские формы', () => {
  it('единственное и множественное', () => {
    expect(enT('playerInfoPopup.hudHands', 1)).toBe('1 hand');
    expect(enT('playerInfoPopup.hudHands', 2)).toBe('2 hands');
    expect(enT('mainMenu.clubMembers', 1)).toBe('1 member');
    expect(enT('mainMenu.clubMembers', 7)).toBe('7 members');
  });

  it('английский не проваливается в русские формы _few/_many', () => {
    expect(enT('createRoomModal.hoursValue', 3)).toBe('3 hours');
    expect(enT('mainMenu.playersOnline', 5)).toBe('5 players online');
  });
});
