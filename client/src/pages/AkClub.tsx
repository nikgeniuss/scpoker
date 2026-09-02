import { useMemo, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
import { Users } from 'lucide-react';
import toast from 'react-hot-toast';

// AK-скин «Клуб» ("/ak-club") — новый визуальный экран по референсу AK Poker: атмосферная
// hero-секция (свой неоновый ♠, не копия чужого арта) + ввод PIN-кода стола.
// Это ДРУГАЯ фича, чем "/club" (ClubHome.tsx — реальное управление клубом) — тот не трогаем.
// Готового бэкенд-флоу «вход за стол по PIN-коду» в проекте нет (только пароль приватной
// комнаты, выбранной из списка лобби — PasswordModal). Городить под несуществующий API —
// не наш случай, поэтому сабмит визуальный: заполненный код показывает тост-заглушку.
const CODE_LENGTH = 6;

export const AkClub = () => {
  const [digits, setDigits] = useState<string[]>(() => Array(CODE_LENGTH).fill(''));
  const inputsRef = useRef<(HTMLInputElement | null)[]>([]);

  const code = useMemo(() => digits.join(''), [digits]);
  const isComplete = code.length === CODE_LENGTH;

  const handleChange = (index: number, raw: string) => {
    const digit = raw.replace(/\D/g, '').slice(-1);
    setDigits((prev) => {
      const next = [...prev];
      next[index] = digit;
      return next;
    });
    if (digit && index < CODE_LENGTH - 1) {
      inputsRef.current[index + 1]?.focus();
    }
  };

  const handleKeyDown = (index: number, e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !digits[index] && index > 0) {
      inputsRef.current[index - 1]?.focus();
    }
  };

  const handleSubmit = () => {
    if (!isComplete) return;
    toast('Присоединение по коду стола — скоро', { icon: '🃏' });
  };

  return (
    <div className="ak-font min-h-[100dvh] bg-ak-bg">
      {/* Hero — атмосферный неоновый блок вместо фото-сцены референса */}
      <div
        className="relative w-full h-56 sm:h-64 overflow-hidden flex items-center justify-center"
        style={{ background: 'linear-gradient(180deg, #041c64 0%, #020a2e 55%, #000000 100%)' }}
      >
        {/* тёплый отблеск камина сбоку — атмосфера референса без копирования арта */}
        <div
          className="absolute -left-10 bottom-0 w-40 h-40 rounded-full opacity-40 blur-3xl pointer-events-none"
          style={{ background: 'radial-gradient(circle, #ff9d3f 0%, transparent 70%)' }}
        />
        <div
          className="relative w-24 h-24 sm:w-28 sm:h-28 rotate-45 rounded-md border-2 border-cyan-300/80 flex items-center justify-center"
          style={{ boxShadow: '0 0 12px 2px rgba(34,211,238,0.55), 0 0 32px 6px rgba(34,211,238,0.35), inset 0 0 16px rgba(34,211,238,0.25)' }}
        >
          <span
            className="-rotate-45 text-4xl sm:text-5xl leading-none"
            style={{ color: '#e6feff', textShadow: '0 0 6px #fff, 0 0 14px #22d3ee, 0 0 26px #22d3ee, 0 0 46px #06b6d4' }}
          >
            ♠
          </span>
        </div>
      </div>

      {/* Контент */}
      <div className="px-4 sm:px-6 py-6 max-w-md mx-auto">
        <h1 className="text-2xl font-bold text-ak-navy text-center">Клуб</h1>
        <p className="mt-2 text-sm text-ak-text-muted text-center">
          Дружеские и кэш-столы. Дружеские — расчёт очками, кэш — с депозитом и выводом.
        </p>

        <div className="mt-6 flex items-center gap-2 overflow-x-auto pb-1">
          {digits.map((d, i) => (
            <input
              key={i}
              ref={(el) => { inputsRef.current[i] = el; }}
              type="text"
              inputMode="numeric"
              maxLength={1}
              value={d}
              onChange={(e) => handleChange(i, e.target.value)}
              onKeyDown={(e) => handleKeyDown(i, e)}
              aria-label={'Цифра кода ' + (i + 1)}
              className="w-11 h-11 shrink-0 rounded-[5px] border border-ak-navy/15 bg-ak-card text-center text-lg font-bold text-ak-navy outline-none focus:border-ak-teal"
            />
          ))}
          <button
            type="button"
            onClick={() => toast('Пригласить друзей — скоро', { icon: '👥' })}
            aria-label="Пригласить друзей"
            className="shrink-0 w-11 h-11 rounded-[5px] border border-ak-navy/15 bg-ak-card flex items-center justify-center text-ak-navy"
          >
            <Users size={20} />
          </button>
        </div>

        <p className="mt-3 text-xs text-ak-text-muted">Введите код стола для присоединения</p>

        <button
          type="button"
          onClick={handleSubmit}
          disabled={!isComplete}
          className="mt-5 w-full min-h-[44px] py-3 rounded-[13px] bg-ak-navy text-white font-bold disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Присоединиться
        </button>
      </div>
    </div>
  );
};
