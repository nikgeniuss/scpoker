import { create } from 'zustand';

interface DebugState {
  lastActionLabel: string;
  lastActionMs: number | null;
  _pending: { label: string; t: number } | null;
  actionStart: (label: string) => void;
  actionEnd: () => void;
}

export const useDebugStore = create<DebugState>((set, get) => ({
  lastActionLabel: '',
  lastActionMs: null,
  _pending: null,
  actionStart: (label) => set({ _pending: { label, t: performance.now() } }),
  actionEnd: () => {
    const p = get()._pending;
    if (!p) return;
    set({ lastActionLabel: p.label, lastActionMs: Math.round(performance.now() - p.t), _pending: null });
  },
}));
