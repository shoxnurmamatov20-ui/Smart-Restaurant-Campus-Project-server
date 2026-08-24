import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { Animated, Easing, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, Path } from 'react-native-svg';

import { useShadows, useTheme } from '../lib/theme-context';
import { sansAt } from '../type';

/**
 * The design's `flash()`, natively — `Xodimlar ilovasi.dc.html:1141-1144`.
 *
 * The staff design file calls it forty-five times and it is not a garnish: on
 * several of these screens it is the only place the app says *the thing you
 * pressed happened*. A stepper that moves and a button that dims are both
 * ambiguous on a phone held at arm's length in a service corridor.
 *
 * The web build gets this from `@restaurant/ui`, which is DOM and Tailwind and
 * cannot be imported here. The behaviour is copied rather than the code:
 * bottom-centre, 2.6 seconds, **one at a time** — a second message replaces the
 * first instead of stacking, because a stack of toasts over a dock is a stack of
 * things covering the buttons a waiter is trying to press.
 *
 * ---------------------------------------------------------------------------
 * It is a pill, not a bar
 *
 * The panel used to stretch from screen edge to screen edge, and that is the
 * single thing that made it read as somebody else's component. The design draws
 * `left:50%;transform:translateX(-50%);max-width:min(92vw,420px)` — a centred
 * pill that is only as wide as the sentence in it — on `--n-900`, with a green
 * tick, at `--text-sm` weight **500**, left-aligned. Every one of those was
 * different here: full width, `--n-800`, no tick, centred text at 600.
 *
 * Scoped to this surface rather than dropped into `src/ui`. It is the staff
 * app's own idiom; a shared one can be lifted later by the person who finds the
 * second caller, and lifting is cheaper than un-sharing.
 */

type Tone = 'ok' | 'problem';

type Flash = (message: string, tone?: Tone) => void;

const FlashContext = createContext<Flash>(() => undefined);

/** `const flash = useFlash(); flash(t.approved)` — and `flash(t.x, 'problem')`. */
export const useFlash = (): Flash => useContext(FlashContext);

/** How long the design leaves one on screen — `:1161`, `setTimeout(…, 2600)`. */
const LINGER_MS = 2_600;

/** `animation:toastIn 200ms cubic-bezier(.4,0,.2,1)` — `:1141` and `:67`. */
const ENTER_MS = 200;
const CURVE = Easing.bezier(0.4, 0, 0.2, 1);

/** `@keyframes toastIn{from{transform:translate(-50%,10px)}}` — `:67`. */
const RISE = 10;

export function FlashHost({ children }: { children: ReactNode }) {
  const c = useTheme();
  const sh = useShadows();
  const insets = useSafeAreaInsets();

  const [current, setCurrent] = useState<{ id: number; message: string; tone: Tone } | null>(null);
  const enter = useRef(new Animated.Value(0)).current;
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const serial = useRef(0);

  const flash = useCallback<Flash>((message, tone = 'ok') => {
    serial.current += 1;
    setCurrent({ id: serial.current, message, tone });
  }, []);

  useEffect(() => {
    if (current === null) return;

    if (timer.current !== null) clearTimeout(timer.current);

    // 200ms on the design's own curve, both ways. The exit is the prototype's
    // `setState({toast:""})` — it has no animation at all, and a panel that
    // disappears between two frames reads as a glitch on a phone.
    Animated.timing(enter, {
      toValue: 1,
      duration: ENTER_MS,
      easing: CURVE,
      useNativeDriver: true,
    }).start();

    timer.current = setTimeout(() => {
      Animated.timing(enter, {
        toValue: 0,
        duration: ENTER_MS,
        easing: CURVE,
        useNativeDriver: true,
      }).start(({ finished }) => {
        if (finished) setCurrent(null);
      });
    }, LINGER_MS);

    return () => {
      if (timer.current !== null) clearTimeout(timer.current);
    };
  }, [current, enter]);

  const value = useMemo(() => flash, [flash]);

  return (
    <FlashContext.Provider value={value}>
      <View style={s.fill}>
        {children}

        {current === null ? null : (
          <Animated.View
            pointerEvents="none"
            accessibilityLiveRegion="polite"
            style={[
              s.dock,
              {
                // `bottom:30px`. The inset is added on top because the design
                // was drawn in a browser and a home indicator is a phone-only
                // thing to clear.
                bottom: insets.bottom + 30,
                opacity: enter,
                transform: [
                  { translateY: enter.interpolate({ inputRange: [0, 1], outputRange: [RISE, 0] }) },
                ],
              },
            ]}
          >
            <View style={[s.toast, { backgroundColor: c.n900, boxShadow: sh.xl }]}>
              {current.tone === 'problem' ? (
                /*
                 * The design has one toast and one glyph, so a refusal used to
                 * repaint the whole panel `--danger-600` — a red bar the width
                 * of the screen, and the loudest thing in the app for something
                 * as ordinary as "that dish is 86'd". The ground stays `--n-900`
                 * and the mark carries the difference instead: the alert glyph
                 * the system already draws, path and stroke for stroke
                 * (`Mehmon.dc.html:199`), in `--warning-500` for the same reason
                 * the tick is `--success-500` — the 600 step goes muddy on
                 * near-black.
                 */
                <Svg width={15} height={15} viewBox="0 0 24 24" fill="none">
                  <Path
                    d="M12 8v5M12 17h0"
                    stroke={c.warning500}
                    strokeWidth={2.2}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  <Circle cx={12} cy={12} r={9} stroke={c.warning500} strokeWidth={2.2} />
                </Svg>
              ) : (
                /* `stroke="#12B76A" stroke-width="3.2"`, 15×15 — `:1142`. */
                <Svg width={15} height={15} viewBox="0 0 24 24" fill="none">
                  <Path
                    d="M20 6 9 17l-5-5"
                    stroke={c.success500}
                    strokeWidth={3.2}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </Svg>
              )}

              <Text style={[s.line, { color: c.n0 }]}>{current.message}</Text>
            </View>
          </Animated.View>
        )}
      </View>
    </FlashContext.Provider>
  );
}

const s = StyleSheet.create({
  fill: { flex: 1 },
  /* `max-width:min(92vw,420px)` — 4% of the viewport each side, then a ceiling. */
  dock: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
    paddingHorizontal: '4%',
  },
  toast: {
    flexDirection: 'row',
    alignItems: 'center',
    /* `gap:10px;padding:13px 18px;border-radius:var(--radius-md)`. */
    gap: 10,
    paddingVertical: 13,
    paddingHorizontal: 18,
    borderRadius: 10,
    maxWidth: 420,
  },
  /* `font-size:var(--text-sm);font-weight:500;line-height:1.4`, and left. */
  line: { ...sansAt(500, 13, 1.4), textAlign: 'left', flexShrink: 1 },
});
