import { describe, it, expect, vi, afterEach } from 'vitest';
import { useAkTableStore } from './akTableStore';

describe('useAkTableStore', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    useAkTableStore.setState({ enabled: false, loaded: false });
  });

  it('loadPublic: сервер вернул enabled: true — стор переключается', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve({ enabled: true }) } as Response)));

    await useAkTableStore.getState().loadPublic();

    expect(useAkTableStore.getState().enabled).toBe(true);
    expect(useAkTableStore.getState().loaded).toBe(true);
  });

  it('loadPublic: обрыв сети — остаётся дефолт, не бросает исключение', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('network down'))));

    await expect(useAkTableStore.getState().loadPublic()).resolves.toBeUndefined();
    expect(useAkTableStore.getState().enabled).toBe(false);
  });

  it('loadPublic: сервер ответил не ok — остаётся дефолт', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({ ok: false } as Response)));

    await useAkTableStore.getState().loadPublic();

    expect(useAkTableStore.getState().enabled).toBe(false);
    expect(useAkTableStore.getState().loaded).toBe(false);
  });

  it('setEnabled: оптимистично применяет значение сразу, до ответа сервера', async () => {
    let resolveFetch: (v: Response) => void = () => {};
    vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>((resolve) => { resolveFetch = resolve; })));

    const pending = useAkTableStore.getState().setEnabled('tok', true);
    expect(useAkTableStore.getState().enabled).toBe(true);

    resolveFetch({ ok: true, json: () => Promise.resolve({ enabled: true }) } as Response);
    await pending;
  });

  it('setEnabled: посылает Authorization и тело с новым значением', async () => {
    const fetchMock = vi.fn((_url: string, _opts?: RequestInit) => Promise.resolve({ ok: true, json: () => Promise.resolve({ enabled: true }) } as Response));
    vi.stubGlobal('fetch', fetchMock);

    await useAkTableStore.getState().setEnabled('tok123', true);

    const [url, opts] = fetchMock.mock.calls[0];
    expect(String(url)).toContain('/admin/ak-table');
    expect(opts?.method).toBe('PUT');
    expect((opts?.headers as Record<string, string>).Authorization).toBe('Bearer tok123');
    expect(JSON.parse(opts?.body as string)).toEqual({ enabled: true });
  });
});
