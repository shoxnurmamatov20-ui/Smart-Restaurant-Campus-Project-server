import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { adopt, type Link, type Page, pollWhileOffline } from './live-fallback';

function fakeLink(state: string) {
  const handlers = new Set<(change: { current: string }) => void>();

  const link: Link & { go(state: string): void; handlers: typeof handlers } = {
    state,
    handlers,
    bind: (_event, handler) => handlers.add(handler),
    unbind: (_event, handler) => handlers.delete(handler),
    go(next) {
      (link as { state: string }).state = next;
      for (const handler of handlers) handler({ current: next });
    },
  };

  return link;
}

function fakePage(visibilityState = 'visible') {
  const handlers = new Set<() => void>();

  const page: Page & { show(): void; handlers: typeof handlers } = {
    visibilityState,
    handlers,
    addEventListener: (_type, handler) => handlers.add(handler),
    removeEventListener: (_type, handler) => handlers.delete(handler),
    show() {
      (page as { visibilityState: string }).visibilityState = 'visible';
      for (const handler of handlers) handler();
    },
  };

  return page;
}

describe('pollWhileOffline', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('polls while the socket is not connected, and stops the moment it is', () => {
    const link = fakeLink('connecting');
    const refetch = vi.fn();
    const stop = pollWhileOffline(link, refetch, 1_000, null);

    vi.advanceTimersByTime(3_000);
    expect(refetch).toHaveBeenCalledTimes(3);

    link.go('connected');
    vi.advanceTimersByTime(5_000);
    expect(refetch).toHaveBeenCalledTimes(3);

    stop();
  });

  it('does not poll at all when the socket is already connected', () => {
    const link = fakeLink('connected');
    const refetch = vi.fn();
    const stop = pollWhileOffline(link, refetch, 1_000, null);

    vi.advanceTimersByTime(10_000);
    expect(refetch).not.toHaveBeenCalled();

    stop();
  });

  it('resumes polling when the socket drops — the edge that refused once refuses again', () => {
    const link = fakeLink('connected');
    const refetch = vi.fn();
    const stop = pollWhileOffline(link, refetch, 1_000, null);

    link.go('unavailable');
    vi.advanceTimersByTime(2_000);
    expect(refetch).toHaveBeenCalledTimes(2);

    stop();
  });

  it('polls for good when there is no socket server at all', () => {
    const refetch = vi.fn();
    const stop = pollWhileOffline(null, refetch, 500, null);

    vi.advanceTimersByTime(2_000);
    expect(refetch).toHaveBeenCalledTimes(4);

    stop();
  });

  it('re-reads once when the tab comes back, even with the socket up', () => {
    const link = fakeLink('connected');
    const page = fakePage('hidden');
    const refetch = vi.fn();
    const stop = pollWhileOffline(link, refetch, 1_000, page);

    page.show();
    expect(refetch).toHaveBeenCalledTimes(1);

    stop();
  });

  it('leaves nothing behind once stopped', () => {
    const link = fakeLink('connecting');
    const page = fakePage();
    const refetch = vi.fn();
    const stop = pollWhileOffline(link, refetch, 1_000, page);

    stop();
    vi.advanceTimersByTime(5_000);
    page.show();

    expect(refetch).not.toHaveBeenCalled();
    expect(link.handlers.size).toBe(0);
    expect(page.handlers.size).toBe(0);
  });
});

describe('adopt', () => {
  it('resets state only when the snapshot is a new one', () => {
    const a = [1];
    const b = [2];
    const setSeen = vi.fn();
    const setState = vi.fn();

    adopt(a, a, setSeen, setState);
    expect(setState).not.toHaveBeenCalled();

    adopt(b, a, setSeen, setState);
    expect(setSeen).toHaveBeenCalledWith(b);
    expect(setState).toHaveBeenCalledWith(b);
  });
});
