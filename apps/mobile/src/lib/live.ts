import { useEffect, useRef, useState } from 'react';

/**
 * One screen's view of one loader, on a phone that may be holding nothing.
 *
 * Lifted out of `crew/live.ts`, where it was written, because the marketplace
 * needs the identical thing and a second copy is a second failure mode: the two
 * would drift on the one decision that matters here — whether a refusal drops
 * the screen back to the fixture or leaves it blank — and only one of those is
 * safe to do to somebody mid-order.
 *
 * The web build answers a failed fetch with `null` and re-renders the fixture
 * with `live: false`; a screen there prints "Namunaviy stollar". This does the
 * same, for the same reason — a person holding a phone is better served by a
 * recognisable list than by a spinner — and keeps the error besides, so the
 * screen can say *why* it is showing the sample rather than only that it is.
 */
export type Live<T> = {
  data: T;
  /** False while the fixture stands in — before the first answer, or after a refusal. */
  live: boolean;
  /** Why the fixture is showing, when it is. `null` while loading or when live. */
  problem: string | null;
  reload: () => void;
};

/**
 * Starts on the fixture, swaps to the answer when it lands, and falls back to
 * the fixture — with the reason — when it does not. `key` is the loader's
 * inputs as one string; `reload()` is how a pull-to-refresh or a retry button
 * asks again.
 */
export function useLive<T>(load: () => Promise<T>, fixture: T, key: string): Live<T> {
  const [state, setState] = useState<Omit<Live<T>, 'reload'>>({
    data: fixture,
    live: false,
    problem: null,
  });
  const [tick, setTick] = useState(0);

  /*
   * `load` and `fixture` are read through refs, so a caller can pass an inline
   * closure without the effect re-running on every render. What *should* rerun
   * it is named explicitly: `key`, the loader's inputs as one string, and
   * `tick`, the manual retry.
   */
  const loadRef = useRef(load);
  const fixtureRef = useRef(fixture);
  loadRef.current = load;
  fixtureRef.current = fixture;

  useEffect(() => {
    let alive = true;

    loadRef.current().then(
      (data) => alive && setState({ data, live: true, problem: null }),
      (error: unknown) =>
        alive &&
        setState({
          data: fixtureRef.current,
          live: false,
          problem: error instanceof Error ? error.message : String(error),
        }),
    );

    return () => {
      alive = false;
    };
  }, [key, tick]);

  return { ...state, reload: () => setTick((n) => n + 1) };
}
