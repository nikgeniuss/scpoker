import { describe, it, expect, vi, afterEach } from 'vitest';
import { useAppThemeStore } from './appThemeStore';

describe('useAppThemeStore', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    useAppThemeStore.setState({ theme: 'poker-hub', loaded: false });
  });

  it('loadPublic: сервер вернул ak — стор переключается', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve({ theme: 'ak' }) } as Response)));

    await useAppThemeStore.getState().loadPublic();

    expect(useAppThemeStore.getState().theme).toBe('ak');
    expect(useAppThemeStore.getState().loaded).toBe(true);
  });

  it('loadPublic: обрыв сети — остаётся дефолт, не бросает исключение', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('network down'))));

    await expect(useAppThemeStore.getState().loadPublic()).resolves.toBeUndefined();
    expect(useAppThemeStore.getState().theme).toBe('poker-hub');
  });

  it('loadPublic: сервер ответил не ok — остаётся дефолт', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({ ok: false } as Response)));

    await useAppThemeStore.getState().loadPublic();

    expect(useAppThemeStore.getState().theme).toBe('poker-hub');
    expect(useAppThemeStore.getState().loaded).toBe(false);
  });

  it('setTheme: оптимистично применяет значение сразу, до ответа сервера', async () => {
    let resolveFetch: (v: Response) => void = () => {};
    vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>((resolve) => { resolveFetch = resolve; })));

    const pending = useAppThemeStore.getState().setTheme('tok', 'ak');
    expect(useAppThemeStore.getState().theme).toBe('ak');

    resolveFetch({ ok: true, json: () => Promise.resolve({ theme: 'ak' }) } as Response);
    await pending;
  });

  it('setTheme: посылает Authorization и тело с новой темой', async () => {
    const fetchMock = vi.fn((_url: string, _opts?: RequestInit) => Promise.resolve({ ok: true, json: () => Promise.resolve({ theme: 'ak' }) } as Response));
    vi.stubGlobal('fetch', fetchMock);

    await useAppThemeStore.getState().setTheme('tok123', 'ak');

    const [url, opts] = fetchMock.mock.calls[0];
    expect(String(url)).toContain('/admin/app-theme');
    expect(opts?.method).toBe('PUT');
    expect((opts?.headers as Record<string, string>).Authorization).toBe('Bearer tok123');
    expect(JSON.parse(opts?.body as string)).toEqual({ theme: 'ak' });
  });
});
