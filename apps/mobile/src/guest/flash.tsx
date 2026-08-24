import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Check } from './icons';
import { useShadows, useTheme } from '../lib/theme-context';
import { duration, size } from '../theme';
import { sansAt } from '../type';

/**
 * "The thing you pressed happened", said the way the design says it —
 * `Mehmon.dc.html:49-51`.
 *
 * The web build has `flash()` from `@restaurant/ui`, which is Sonner and the
 * DOM. This is the same panel with the same rules, drawn in React Native:
 * `background:var(--n-900);color:#fff`, bottom-centred, a green tick at 15×15
 * and stroke 3.2, a 14px/500 label, and it clears itself.
 *
 * **One at a time.** The prototype's own `flash()` clears its timer before
 * setting the next message (`Mehmon.dc.html:604-608`), so a second toast
 * replaces the first rather than stacking under it. Three stacked confirmations
 * over a bill are three things covering the total.
 *
 * ---------------------------------------------------------------------------
 * Two literals the theme was standing in for, and why that matters
 *
 * The panel used to take `--bg-inverse` on `--fg-inverse`, which is the right
 * instinct and the wrong pair: in dark those resolve to `#0B0E16` on `#0F1320`,
 * so every confirmation a guest got after sunset was black text on black. The
 * design writes `var(--n-900)` and `#fff` as flat values in both themes, and
 * that is deliberate — a toast is a small dark card the way a photograph is a
 * photograph, not a surface that flips with the room.
 *
 * The dwell is the design's own 2 600ms (`:591`), which is also what the staff
 * toast counts. A guest reading one sentence on a phone and a cashier reading
 * one on a till are the same reader, and the platform should not answer them at
 * two speeds.
 *
 * It sits 32pt above the **inset**, not above the screen edge: on a phone with
 * a home indicator the design's 32 puts the panel half under it, and this is a
 * surface that only ever exists on a phone.
 */
const DWELL_MS = 2_600;

const FlashContext = createContext<(message: string) => void>(() => undefined);

/** `const flash = useFlash(); flash(t.common.waiterCalled)`. */
export const useFlash = (): ((message: string) => void) => useContext(FlashContext);

export function FlashHost({ children }: { children: ReactNode }) {
  const [message, setMessage] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fade = useRef(new Animated.Value(0)).current;

  const flash = useCallback((next: string) => {
    if (timer.current !== null) clearTimeout(timer.current);

    setMessage(next);
    timer.current = setTimeout(() => setMessage(null), DWELL_MS);
  }, []);

  // A screen that navigates away mid-toast leaves a timer holding a setState
  // for a component nobody is rendering any more.
  useEffect(
    () => () => {
      if (timer.current !== null) clearTimeout(timer.current);
    },
    [],
  );

  useEffect(() => {
    if (message === null) return;

    fade.setValue(0);

    const entrance = Animated.timing(fade, {
      toValue: 1,
      duration: duration.durMed,
      useNativeDriver: true,
    });

    entrance.start();

    return () => entrance.stop();
  }, [message, fade]);

  return (
    <FlashContext.Provider value={flash}>
      <View style={s.fill}>
        {children}
        {message === null ? null : <Panel message={message} fade={fade} />}
      </View>
    </FlashContext.Provider>
  );
}

function Panel({ message, fade }: { message: string; fade: Animated.Value }) {
  const c = useTheme();
  const sh = useShadows();
  const insets = useSafeAreaInsets();

  return (
    <Animated.View
      // The panel is a statement, not a control: a thumb reaching for the pay
      // button under it must reach the button, not the message.
      pointerEvents="none"
      accessibilityLiveRegion="polite"
      accessibilityRole="alert"
      style={[
        s.dock,
        { bottom: 32 + insets.bottom },
        {
          opacity: fade,
          transform: [
            { translateY: fade.interpolate({ inputRange: [0, 1], outputRange: [12, 0] }) },
          ],
        },
      ]}
    >
      <View style={[s.panel, { backgroundColor: c.n900, boxShadow: sh.xl }]}>
        {/* `stroke="#12B76A" stroke-width="3.2"`, 15×15 — `:50`. It was a white
            17px tick at 2.2, on a different path. */}
        <Check size={15} weight={3.2} colour={c.success500} />

        <Text style={[s.line, { color: c.n0 }]}>{message}</Text>
      </View>
    </Animated.View>
  );
}

const s = StyleSheet.create({
  fill: { flex: 1 },
  dock: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
    paddingHorizontal: size.sp5,
  },
  panel: {
    flexDirection: 'row',
    alignItems: 'center',
    /* `gap:10px;padding:13px 20px;border-radius:12px` — the radius is the
       design's own literal, one step off `--radius-md`. */
    gap: 10,
    paddingHorizontal: 20,
    paddingVertical: 13,
    borderRadius: 12,
    maxWidth: '100%',
  },
  /* `font-size:14px;font-weight:500` — it was `--text-sm`, 13. */
  line: { ...sansAt(500, 14), flexShrink: 1 },
});
