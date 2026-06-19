// Лёгкий синтезатор звуковых сигналов на Web Audio + MP3-ассеты.
// Питает «Звуковые эффекты» из настроек игры. Решение «играть или нет» — на стороне
// вызывающего (GameRoom читает settings.soundEnabled); здесь — только воспроизведение.

let ctx: AudioContext | null = null;

// MP3-ассеты — кеш по пути.
const audioCache: Record<string, HTMLAudioElement> = {};

function playFile(src: string, volume = 0.7): void {
  if (typeof window === 'undefined') return;
  try {
    if (!audioCache[src]) {
      audioCache[src] = new Audio(src);
    }
    const el = audioCache[src];
    el.volume = volume;
    el.currentTime = 0;
    el.play().catch(() => { /* autoplay blocked */ });
  } catch { /* AudioContext недоступен */ }
}

function getCtx(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  try {
    if (!ctx) {
      const AC =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
    }
    // Браузеры стартуют контекст в suspended до первого пользовательского жеста — пробуем поднять.
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    return ctx;
  } catch {
    return null;
  }
}

interface Tone {
  freq: number;
  dur: number;
  type?: OscillatorType;
  gain?: number;
}

// Последовательность тонов друг за другом (короткая мелодия-сигнал).
function beep(tones: Tone[]): void {
  const ac = getCtx();
  if (!ac) return;
  let t = ac.currentTime;
  for (const tone of tones) {
    const osc = ac.createOscillator();
    const g = ac.createGain();
    osc.type = tone.type ?? 'sine';
    osc.frequency.value = tone.freq;
    const peak = tone.gain ?? 0.12;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + tone.dur);
    osc.connect(g).connect(ac.destination);
    osc.start(t);
    osc.stop(t + tone.dur + 0.02);
    t += tone.dur;
  }
}

export type SoundEvent = 'turn' | 'check' | 'bet' | 'fold' | 'win' | 'deal';

export function playSound(event: SoundEvent): void {
  switch (event) {
    case 'turn':
      beep([
        { freq: 880, dur: 0.11, type: 'triangle' },
        { freq: 1175, dur: 0.13, type: 'triangle' },
      ]);
      break;
    case 'win':
      beep([
        { freq: 660, dur: 0.1, type: 'triangle' },
        { freq: 880, dur: 0.1, type: 'triangle' },
        { freq: 1320, dur: 0.18, type: 'triangle' },
      ]);
      break;
    case 'bet':
      playFile('/sounds/chips.mp3');
      break;
    case 'check':
      playFile('/sounds/check.mp3');
      break;
    case 'fold':
      playFile('/sounds/fold.mp3');
      break;
    case 'deal':
      playFile('/sounds/deal.mp3');
      break;
  }
}
