import type { ReactNode } from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  View,
  type PressableProps,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from 'react-native';

import { size } from '../theme';
import { sans, sansAt, text } from '../type';
import { useShadows, useTheme } from '../lib/theme-context';

/**
 * The handful of primitives every phone screen is made from.
 *
 * Not a port of `packages/ui` — those twenty-six components are DOM and
 * Tailwind. These are the shapes the four phone design files draw over and
 * over, and each one carries the design's own numbers rather than a rounded
 * step off a spacing scale. That distinction is the whole reason this file was
 * rewritten: the app was built against `size.sp3 = 12` where the design writes
 * `13`, `size.radiusLg = 14` where it writes `15`, and a sub-pixel hairline
 * where it writes `1px`. Individually invisible; together, a screen that is
 * recognisably not the drawing.
 *
 * ---------------------------------------------------------------------------
 * Where the numbers come from
 *
 * `docs/design/source/*.dc.html`, inline on the elements themselves. The
 * repeated controls carry a `data-*` attribute and the file's own stylesheet
 * says what the "on" state does — `[data-chip][data-on="true"]{background:
 * var(--brand-500);color:#fff}` and so on. Each component below cites the
 * declaration it implements, so the next person can check it in one grep
 * rather than by eye.
 *
 * ---------------------------------------------------------------------------
 * Pressing scales, it does not fade
 *
 * `[data-press]:active{transform:scale(.97)}`. The app faded to `opacity:.72`,
 * which is a different gesture: a fade reads as "disabled for a moment", a
 * scale reads as "pressed". One line, on every touchable in the app.
 */

/** `[data-press]:active{transform:scale(.97)}` — the design's own press. */
export const PRESSED: ViewStyle = { transform: [{ scale: 0.97 }] };

/** Touch targets stay 44pt even where the design draws a smaller box: a waiter
 *  is walking between tables. Applied as a hit slop, never as a taller box. */
const REACH = { top: 6, bottom: 6, left: 6, right: 6 };

export function Screen({
  children,
  padded = true,
  style,
}: {
  children: ReactNode;
  padded?: boolean;
  style?: ViewStyle;
}) {
  const c = useTheme();

  return (
    <View style={[s.fill, { backgroundColor: c.bg }, padded && s.padded, style]}>{children}</View>
  );
}

/**
 * The screen header — `Mijoz ilovasi:246`.
 *
 * `font-size:var(--text-2xl)` (24px) in the display face at `--tracking-tight`,
 * over `padding:6px 0 10px` and a `1px solid var(--divider)` rule. It was 20px
 * with no rule under it, which is the difference between a screen title and a
 * section heading — and the design uses both.
 */
export function Title({
  children,
  sub,
  ruled = true,
}: {
  children: ReactNode;
  sub?: ReactNode;
  /** The rule under it. Off where a screen puts its own control row there. */
  ruled?: boolean;
}) {
  const c = useTheme();

  return (
    <View
      style={[
        s.title,
        ruled && { borderBottomWidth: 1, borderBottomColor: c.divider },
        { backgroundColor: c.bg },
      ]}
    >
      <Text style={[text.screenTitle, { color: c.fg }]}>{children}</Text>
      {sub === undefined ? null : (
        <Text style={[text.small, { color: c.fgMuted, marginTop: 4 }]}>{sub}</Text>
      )}
    </View>
  );
}

/**
 * A card — `border:1px solid var(--border);border-radius:var(--radius-lg)`.
 *
 * The border is 1 point, not a hairline. React Native's hairline is 0.5 at @2x
 * and 0.33 at @3x, so on the phones this app runs on the design's card outline
 * was drawn at a third of its weight and the cards read as flat panels.
 *
 * `pad` because seventeen callers re-declared their own padding and drifted.
 * The design's card padding is `15px 17px` more often than anything else, and
 * that is the default here; a screen that draws a different one passes it.
 */
export function Card({
  children,
  pad = false,
  style,
}: {
  children: ReactNode;
  pad?: boolean | { v: number; h: number };
  style?: StyleProp<ViewStyle>;
}) {
  const c = useTheme();
  const padding =
    pad === false
      ? null
      : pad === true
        ? { paddingVertical: 15, paddingHorizontal: 17 }
        : { paddingVertical: pad.v, paddingHorizontal: pad.h };

  return (
    <View
      style={[
        s.card,
        { backgroundColor: c.surface, borderColor: c.border, borderRadius: size.radiusLg },
        padding,
        style,
      ]}
    >
      {children}
    </View>
  );
}

/** One line of a list: label left, value right, the design's 52px row. */
export function Row({
  label,
  value,
  note,
  onPress,
  last = false,
}: {
  label: ReactNode;
  value?: ReactNode;
  note?: ReactNode;
  onPress?: () => void;
  last?: boolean;
}) {
  const c = useTheme();

  const body = (
    <View style={[s.row, !last && { borderBottomWidth: 1, borderColor: c.divider }]}>
      <View style={s.rowMain}>
        <Text style={[text.body, { color: c.fg }]} numberOfLines={1}>
          {label}
        </Text>
        {note === undefined ? null : (
          <Text style={[text.caption, { color: c.fgSubtle, marginTop: 2 }]} numberOfLines={1}>
            {note}
          </Text>
        )}
      </View>
      {value === undefined ? null : (
        <Text style={[text.body, text.num, { color: c.fg }]}>{value}</Text>
      )}
    </View>
  );

  if (onPress === undefined) return body;

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => pressed && PRESSED}
      accessibilityRole="button"
    >
      {body}
    </Pressable>
  );
}

export type Tone = 'brand' | 'success' | 'warning' | 'danger' | 'neutral';

/**
 * A state, said in a word and a tint — never in a tint alone.
 *
 * `border-radius:var(--radius-pill);background:var(--danger-50);
 * color:var(--danger-700)` and its siblings, at `--text-2xs` (11px): the single
 * most-used type step on the phone.
 */
export function Pill({ tone, children }: { tone: Tone; children: ReactNode }) {
  const c = useTheme();

  const tint = {
    brand: [c.brand50, c.brand700],
    success: [c.success50, c.success700],
    warning: [c.warning50, c.warning700],
    danger: [c.danger50, c.danger700],
    neutral: [c.bgMuted, c.fgMuted],
  }[tone];

  return (
    <View style={[s.pill, { backgroundColor: tint[0], borderRadius: size.radiusPill }]}>
      <Text style={[text.label, { color: tint[1] }]}>{children}</Text>
    </View>
  );
}

/**
 * A filter chip — `[data-chip]`, and its `[data-on]` rule.
 *
 * `height:32px;padding:0 13px;border:1px solid var(--border);border-radius:pill;
 * background:var(--surface);color:var(--fg-muted);font-size:12px;weight:600`,
 * and when it is on: `background:var(--brand-500);color:#fff;border-color:
 * var(--brand-500)`.
 *
 * `variant="pill"` is the same box with the other on-state the design draws —
 * `[data-pill][data-on]{background:var(--fg);color:var(--bg)}` — which is what
 * the menu's category rail uses.
 */
export function Chip({
  children,
  on = false,
  variant = 'chip',
  onPress,
  style,
}: {
  children: ReactNode;
  on?: boolean;
  variant?: 'chip' | 'pill';
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
}) {
  const c = useTheme();

  const look = on
    ? variant === 'chip'
      ? { backgroundColor: c.brand500, borderColor: c.brand500, color: c.n0 }
      : { backgroundColor: c.fg, borderColor: c.fg, color: c.bg }
    : { backgroundColor: c.surface, borderColor: c.border, color: c.fgMuted };

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: on }}
      onPress={onPress}
      hitSlop={REACH}
      style={({ pressed }) => [
        s.chip,
        {
          backgroundColor: look.backgroundColor,
          borderColor: look.borderColor,
          borderRadius: size.radiusPill,
        },
        pressed && PRESSED,
        style,
      ]}
    >
      <Text style={[text.chip, { color: look.color }]} numberOfLines={1}>
        {children}
      </Text>
    </Pressable>
  );
}

/**
 * A segmented control — `[data-seg]`.
 *
 * `height:28px;padding:0 11px;border:0;border-radius:7px;background:transparent;
 * color:var(--fg-muted);font-size:11px;weight:600`, and on:
 * `background:var(--surface);color:var(--fg);box-shadow:var(--shadow-xs)`.
 * The track around it is the muted ground with 2px of inset.
 */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  style,
}: {
  options: readonly { value: T; label: ReactNode }[];
  value: T;
  onChange: (next: T) => void;
  style?: StyleProp<ViewStyle>;
}) {
  const c = useTheme();
  const sh = useShadows();

  return (
    <View style={[s.segTrack, { backgroundColor: c.bgMuted, borderRadius: 9 }, style]}>
      {options.map((option) => {
        const on = option.value === value;

        return (
          <Pressable
            key={option.value}
            accessibilityRole="button"
            accessibilityState={{ selected: on }}
            onPress={() => onChange(option.value)}
            style={({ pressed }) => [
              s.seg,
              on && { backgroundColor: c.surface, boxShadow: sh.xs },
              pressed && PRESSED,
            ]}
          >
            <Text style={[text.seg, { color: on ? c.fg : c.fgMuted }]} numberOfLines={1}>
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/**
 * A choice card — `[data-opt]`.
 *
 * `padding:11px 10px;border:1px solid var(--border);border-radius:var(--radius-md);
 * background:var(--surface)`, and chosen: `border-color:var(--brand-500);
 * background:var(--brand-50)`. Delivery-or-pickup, cash-or-card: the pairs a
 * guest picks between.
 */
export function Option({
  children,
  on = false,
  onPress,
  style,
}: {
  children: ReactNode;
  on?: boolean;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
}) {
  const c = useTheme();

  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected: on }}
      onPress={onPress}
      style={({ pressed }) => [
        s.option,
        {
          borderColor: on ? c.brand500 : c.border,
          backgroundColor: on ? c.brand50 : c.surface,
          borderRadius: size.radiusMd,
        },
        pressed && PRESSED,
        style,
      ]}
    >
      {children}
    </Pressable>
  );
}

/**
 * The quantity stepper — a 34pt square in the brand, `font-size:19px`.
 *
 * `width:34px;height:34px;border:0;border-radius:var(--radius-md);
 * background:var(--brand-500);color:#fff;font-size:19px;font-weight:600;
 * line-height:1`. The muted variant is the same box in `--bg-muted` with
 * `--fg` on it, which is what a cart line uses for "−".
 */
export function Stepper({
  label,
  onPress,
  tone = 'brand',
  box = 34,
  disabled,
}: {
  label: ReactNode;
  onPress: () => void;
  tone?: 'brand' | 'muted';
  box?: number;
  disabled?: boolean;
}) {
  const c = useTheme();

  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      hitSlop={REACH}
      style={({ pressed }) => [
        {
          width: box,
          height: box,
          borderRadius: size.radiusMd,
          backgroundColor: tone === 'brand' ? c.brand500 : c.bgMuted,
          alignItems: 'center',
          justifyContent: 'center',
        },
        pressed && PRESSED,
        disabled === true && s.disabled,
      ]}
    >
      <Text style={[text.stepper, { color: tone === 'brand' ? c.n0 : c.fg }]}>{label}</Text>
    </Pressable>
  );
}

/**
 * A count on a tab or an avatar — the design's small round tally.
 *
 * `min-width:18px;height:18px;border-radius:pill;background:var(--danger-500);
 * color:#fff;font-size:10px;font-weight:700`.
 */
export function Badge({ children, tone = 'danger' }: { children: ReactNode; tone?: Tone }) {
  const c = useTheme();
  const background = {
    brand: c.brand500,
    success: c.success500,
    warning: c.warning500,
    danger: c.danger500,
    neutral: c.fgMuted,
  }[tone];

  return (
    <View style={[s.badge, { backgroundColor: background, borderRadius: size.radiusPill }]}>
      <Text style={[text.badge, { color: c.n0 }]} numberOfLines={1}>
        {children}
      </Text>
    </View>
  );
}

/**
 * A button.
 *
 * The design draws the full-width primary at `height:52px` with `border:0`, and
 * the secondary beside a field at `1px solid var(--border-strong)`. All three
 * kinds shared `minHeight:44` and a 1px border here, so the primary carried an
 * outline it does not have and every call-to-action was eight points short.
 */
export function Button({
  children,
  kind = 'primary',
  disabled,
  height = 52,
  style,
  textStyle,
  ...rest
}: PressableProps & {
  children: ReactNode;
  kind?: 'primary' | 'secondary' | 'ghost';
  /** The design draws 52 for a page CTA, 42/44/46 inline. */
  height?: number;
  style?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
}) {
  const c = useTheme();

  const look = {
    primary: {
      backgroundColor: c.brand500,
      borderColor: 'transparent',
      borderWidth: 0,
      color: c.n0,
    },
    secondary: {
      backgroundColor: c.surface,
      borderColor: c.borderStrong,
      borderWidth: 1,
      color: c.fg,
    },
    ghost: {
      backgroundColor: 'transparent',
      borderColor: 'transparent',
      borderWidth: 0,
      color: c.brand600,
    },
  }[kind];

  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      style={({ pressed }) => [
        s.button,
        {
          height,
          backgroundColor: look.backgroundColor,
          borderColor: look.borderColor,
          borderWidth: look.borderWidth,
          borderRadius: size.radiusMd,
        },
        pressed && PRESSED,
        disabled === true && s.disabled,
        style,
      ]}
      {...rest}
    >
      <Text style={[text.button, { color: look.color }, textStyle]} numberOfLines={1}>
        {children}
      </Text>
    </Pressable>
  );
}

/** A figure with its label under it — the KPI tile, phone-sized. */
export function Figure({
  label,
  value,
  tone,
}: {
  label: ReactNode;
  value: ReactNode;
  tone?: Tone;
}) {
  const c = useTheme();
  const colour =
    tone === 'danger'
      ? c.danger600
      : tone === 'warning'
        ? c.warning600
        : tone === 'success'
          ? c.success600
          : c.fg;

  return (
    <View style={s.figure}>
      <Text style={[text.caps, { color: c.fgSubtle }]}>{label}</Text>
      <Text style={[text.title, text.num, { color: colour, marginTop: 4 }]}>{value}</Text>
    </View>
  );
}

/**
 * Nothing here, said in the design's own block.
 *
 * `Mijoz ilovasi:268-270`: `padding:40px 26px;text-align:center`, the heading at
 * `--text-md` weight 600, the paragraph at `--text-sm` in `--fg-muted` with
 * `line-height:1.5`, `margin:6px auto 0` and `max-width:260px`.
 *
 * All five were off — 56/24 of padding, the paragraph in `--fg-subtle` at 1.45,
 * and no width limit at all, so a two-line sentence ran the width of the phone
 * where the design keeps it to a readable column. Two screens had already given
 * up on this component and written the block out by hand rather than carry the
 * difference; both can use it again.
 */
export function Empty({ title, body }: { title: ReactNode; body?: ReactNode }) {
  const c = useTheme();

  return (
    <View style={s.empty}>
      <Text style={[text.body, { color: c.fg, ...sans(600), textAlign: 'center' }]}>{title}</Text>
      {body === undefined ? null : <Text style={[s.emptyBody, { color: c.fgMuted }]}>{body}</Text>}
    </View>
  );
}

const s = StyleSheet.create({
  fill: { flex: 1 },
  padded: { paddingHorizontal: size.sp5 },
  /* `padding:6px 0 10px` under a `1px solid var(--divider)` rule — Mijoz:246. */
  title: { paddingTop: 6, paddingBottom: 10 },
  card: { borderWidth: 1, overflow: 'hidden' },
  row: {
    minHeight: 52,
    paddingHorizontal: size.sp4,
    paddingVertical: size.sp3,
    flexDirection: 'row',
    alignItems: 'center',
    gap: size.sp3,
  },
  rowMain: { flex: 1, minWidth: 0 },
  pill: { paddingHorizontal: 9, paddingVertical: 3, alignSelf: 'flex-start' },
  /* `height:32px;padding:0 13px;border:1px solid var(--border)`. */
  chip: {
    height: 32,
    paddingHorizontal: 13,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  /* The track: 2px of inset around a 28px segment. */
  segTrack: { flexDirection: 'row', padding: 2, gap: 2 },
  seg: {
    height: 28,
    paddingHorizontal: 11,
    borderRadius: 7,
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  /* `padding:11px 10px` — Mijoz's delivery/pickup pair. */
  option: { flex: 1, paddingVertical: 11, paddingHorizontal: 10, borderWidth: 1 },
  badge: {
    minWidth: 18,
    height: 18,
    paddingHorizontal: 5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  button: {
    paddingHorizontal: size.sp4,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  disabled: { opacity: 0.45 },
  figure: { flex: 1, minWidth: 0 },
  /* `padding:40px 26px;text-align:center` — Mijoz:268. */
  empty: { paddingVertical: 40, paddingHorizontal: 26, alignItems: 'center' },
  /* `margin:6px auto 0;line-height:1.5;max-width:260px` — Mijoz:270. */
  emptyBody: { ...sansAt(400, 13, 1.5), textAlign: 'center', marginTop: 6, maxWidth: 260 },
});
