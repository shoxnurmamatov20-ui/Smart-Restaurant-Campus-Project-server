import { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { size } from '../theme';
import { sansAt } from '../type';
import { useShadows, useTheme } from '../lib/theme-context';
import { Check } from './icons';

/**
 * What the design calls a toast, on a phone that has no document to append to.
 *
 * `flash()` in `@restaurant/ui` is DOM — it mounts a node on `document.body` —
 * and the design's rule for it is repeated here because it is a product rule
 * rather than an implementation: one at a time, 2.6 seconds.
 *
 * The bar is the design's own — `Mijoz ilovasi`, the `hasToast` block:
 * `left:16px;right:16px;bottom:80px;gap:10px;padding:13px 16px;
 * border-radius:var(--radius-md);background:var(--n-900);color:#fff;
 * box-shadow:var(--shadow-xl);font-size:13px;font-weight:500;line-height:1.4`,
 * with a 15px green tick before the sentence. It had none of that: no tick, the
 * text centred rather than beside one, 20pt gutters instead of 16, and no
 * shadow — which on a dark bar over a white screen is what separates a toast
 * from a rectangle.
 *
 * Held per screen rather than in a global host, and that is deliberate. A global
 * toast needs a mount point in a layout, and the customer surface's layout is the
 * tab bar file this work must not touch; worse, a toast owned by the navigator
 * outlives the screen that raised it, so "O'chirildi" from the basket can appear
 * over the payment screen a guest has already moved to. A screen that says
 * something owns the saying of it.
 *
 *     const { note, say } = useNotice();
 *     …
 *     <Notice note={note} bottom={insets.bottom + 12} />
 */
export type NoticeTone = 'ok' | 'problem';

export type NoticeState = { text: string; tone: NoticeTone } | null;

export function useNotice(): {
  note: NoticeState;
  say: (message: string, tone?: NoticeTone) => void;
} {
  const [note, setNote] = useState<NoticeState>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const say = useCallback((message: string, tone: NoticeTone = 'ok') => {
    if (timer.current !== null) clearTimeout(timer.current);

    setNote({ text: message, tone });
    // One at a time: a second message replaces the first rather than queueing
    // behind it. Two answers to two taps, read in the order they were made, is a
    // guest reading the answer to something they have already forgotten asking.
    timer.current = setTimeout(() => setNote(null), 2_600);
  }, []);

  // A timer that fires after the screen is gone sets state on nothing and warns
  // about it in development; on a phone the screen is gone the moment a tab is
  // switched, so this is the ordinary case rather than the edge one.
  useEffect(
    () => () => {
      if (timer.current !== null) clearTimeout(timer.current);
    },
    [],
  );

  return { note, say };
}

/**
 * The bar itself, positioned by the screen that raised it.
 *
 * `bottom` is a number rather than a safe-area read inside the component,
 * because only the screen knows what is under it: a tab screen sits above the
 * dock already, while a pushed screen with its own action bar has both the
 * home indicator and that bar to clear.
 */
export function Notice({ note, bottom = 12 }: { note: NoticeState; bottom?: number }) {
  const c = useTheme();
  const sh = useShadows();

  if (note === null) return null;

  const problem = note.tone === 'problem';

  return (
    <View
      pointerEvents="none"
      accessibilityLiveRegion="polite"
      style={[
        s.wrap,
        {
          bottom,
          backgroundColor: problem ? c.danger600 : c.n900,
          borderRadius: size.radiusMd,
          boxShadow: sh.xl,
        },
      ]}
    >
      {/*
       * The design's 15px tick, stroked `#12B76A` at 3.2 — a literal rather
       * than `--success-500`, because the bar is `--n-900` in both themes and
       * the green has to hold against it either way. Not drawn on a problem:
       * a tick beside "could not save" is the wrong word in a picture.
       */}
      {problem ? null : <Check size={15} colour="#12B76A" />}
      <Text style={[s.line, { color: c.n0 }]}>{note.text}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  /* `left:16;right:16;gap:10;padding:13px 16px` — the design's own box. */
  wrap: {
    position: 'absolute',
    left: 16,
    right: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 13,
  },
  /* `font-size:13px;font-weight:500;line-height:1.4`, and `min-width:0` so a
     long sentence wraps inside the bar rather than pushing the tick out. */
  line: { ...sansAt(500, 13, 1.4), flex: 1, minWidth: 0 },
});
