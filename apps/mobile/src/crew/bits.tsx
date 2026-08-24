import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View, type ViewStyle } from 'react-native';
import Svg, { Defs, LinearGradient, Path, Polyline, Stop } from 'react-native-svg';

import { say, type Lang, type Trilingual } from '@restaurant/surfaces/crew/data';
import type { CrewTone } from '@restaurant/surfaces/crew/more-data';

import { useTheme } from '../lib/theme-context';
import { raw, size } from '../theme';
import { PRESSED } from '../ui/primitives';
import { display, displayAt, sansAt, text, tracking } from '../type';
import { useCrewSkin } from './palette';

/**
 * The shapes the staff panels are assembled from.
 *
 * Every one of them is drawn more than twice in the design file: the caps
 * label above a list, the muted paragraph under a heading, the dark hero card,
 * the three-pixel attainment bar, the avatar disc. They live here rather than
 * in `src/ui/primitives.tsx` because they are this surface's vocabulary — an
 * avatar with initials and a bar drawn against a daily target belong to a
 * staff app and to nothing else in this binary.
 *
 * ---------------------------------------------------------------------------
 * Every number below is quoted from the drawing, not from a scale
 *
 * `docs/design/source/Smart Restaurant Xodimlar ilovasi.dc.html`, inline on the
 * elements themselves, cited by line. The file used to reach for the nearest
 * rounded step instead — `size.sp4` (16) where the design writes 14,
 * `size.sp6` (24) where it writes 22, React Native's sub-pixel rule where the
 * design draws `1px`, `text.caption` (12px) on nine lines the design sets at 11
 * or 10 — and `design-metrics.test.ts` now refuses the sub-pixel one by name. Each
 * of those is invisible alone. Stacked down a screen they are why the app did
 * not look like the drawing.
 *
 * The other half was type. This surface's small copy is `--text-2xs` (11px) far
 * more often than anything else — the note under a list, the caps label above
 * one, the hero's own footnote — and all of it was being drawn at 12 in the
 * medium face, because `text.caption` was the closest preset to hand. The
 * design sets no `font-weight` on those lines, which means 400, not 500.
 */

/**
 * A value that is either translated or the same in all three languages.
 *
 * `Kpi.value` is `Trilingual | string` and the reason is worth keeping: "206"
 * and "8.3 / 12.4" read identically in Uzbek, Russian and English, and putting
 * them in the catalogue would trip `i18n.test.ts`, which rejects a key whose
 * three languages match. So the type carries both and this resolves it, once,
 * instead of nine panels each writing the same ternary.
 */
export const phrase = (value: Trilingual | string, lang: Lang): string =>
  typeof value === 'string' ? value : say(value, lang);

/* ------------------------------------------------------------------ text */

/**
 * The uppercase label the design puts above every list.
 *
 * Eleven pixels, not ten. This drew `text.caps` — the 10px step — and that is
 * the right preset on the other three phone surfaces but the wrong one here:
 * all fourteen caps labels in the staff file are
 * `font-size:var(--text-2xs);font-weight:600;letter-spacing:var(--tracking-caps)`
 * (`:171`, `:267`, `:474`, `:508`, `:553`, `:691`, `:732`, `:863`, `:902`,
 * `:921`, `:967`, `:977`), and `--text-2xs` is 11px. The margins are the
 * design's own `margin:22px 0 9px`, which is what ten of the fourteen carry;
 * `size.sp6`/`size.sp2` (24 and 8) were a scale standing in for both.
 */
export function SectionLabel({ children }: { children: ReactNode }) {
  const c = useTheme();

  return <Text style={[s.section, { color: c.fgSubtle }]}>{children}</Text>;
}

/**
 * The sentence under a heading, or the one at the foot of a screen.
 *
 * The design ends most screens with one and they are not filler: "an alert is
 * not an accusation", "days are computed from the rate of use, not the
 * quantity". They are the difference between a figure somebody trusts and one
 * they argue with.
 *
 * Twenty-five of them are drawn and all twenty-five agree:
 * `font-size:var(--text-2xs);color:var(--fg-subtle);line-height:1.55` (`:465`,
 * `:507`, `:564`, `:597`, `:698`, `:742`, `:911`, `:947`, `:989` and the rest).
 * Eleven pixels at 400 — this was 12 at 500, a heavier and larger paragraph
 * than the one the design puts a figure's caveat in. `margin-top:14px` is the
 * value eleven of them carry; `size.sp4` was 16.
 */
export function Note({ children }: { children: ReactNode }) {
  const c = useTheme();

  return <Text style={[s.note, { color: c.fgSubtle }]}>{children}</Text>;
}

/**
 * A short line of muted body text, used as an intro above a list.
 *
 * `font-size:var(--text-sm);color:var(--fg-muted);line-height:1.5;
 * margin-bottom:14px` — `:185`, `:208`, `:287`, `:386`, identical every time.
 * The 14 is the design's; `size.sp4` put 16 under it.
 */
export function Intro({ children }: { children: ReactNode }) {
  const c = useTheme();

  return <Text style={[s.intro, { color: c.fgMuted }]}>{children}</Text>;
}

/**
 * The disclosure that goes above any set of buttons that changes something.
 *
 * `SHARED.notWired`, and it is placed *before* the buttons on purpose: a manager
 * who declines a discount and walks away believing the waiter was told is worse
 * off than one who never opened the screen.
 *
 * The design has no box for this — it is ours, because the design assumes a
 * backend that answers. Its type is borrowed from the one warning strip the
 * file does draw (`:119`): `--text-2xs` at 600 in `--warning-700` on
 * `--warning-50`. The rule is a full pixel, as every rule in the file is.
 */
/**
 * The line a screen says when it is showing a sample instead of the restaurant.
 *
 * `tables.tsx` wrote this first — a tappable warning above the list carrying the
 * reason the server gave — and every other live panel needs the identical thing.
 * A second copy of it would drift on the one decision that matters: whether the
 * reader is told *why*. They are, always, because "demo tables" alone leaves
 * somebody wondering if the restaurant is empty.
 *
 * Tapping retries. That is the whole affordance: the usual cause is a phone that
 * walked out of range of the till's wifi, and by the time the line is read the
 * answer has often changed.
 */
export function DemoLine({
  text: line,
  problem,
  onRetry,
}: {
  /** What is a sample — "Namunaviy stollar", not "an error occurred". */
  text: string;
  /** The server's own words, when it gave any. */
  problem: string | null;
  onRetry: () => void;
}) {
  const c = useTheme();

  return (
    <Pressable onPress={onRetry} accessibilityRole="button" style={s.demoLine}>
      <Text style={[text.caption, { color: c.warning700 }]}>
        {line}
        {problem === null ? '' : ` · ${problem}`}
      </Text>
    </Pressable>
  );
}

export function NotWired({ children }: { children: ReactNode }) {
  const c = useTheme();

  return (
    <View style={[s.wired, { backgroundColor: c.warning50, borderColor: c.warning500 }]}>
      <Text style={[s.wiredLine, { color: c.warning700 }]}>{children}</Text>
    </View>
  );
}

/* ------------------------------------------------------------------ tone */

/**
 * One tone name to one colour, in one place, so no panel invents a second.
 *
 * The **600** step, which is what the design uses for a coloured *figure*: the
 * KPI delta under a tile and the delta beside a branch's revenue are all
 * `var(--success-600)` / `var(--danger-600)` (`:1488`, `:1915`–`:1930`).
 *
 * A tint and a rule are different steps and have their own functions below.
 * Reaching for this one everywhere is what made every chip a stop too light and
 * every bar a stop too dark.
 */
export function toneColour(
  tone: CrewTone | 'up' | 'down' | 'flat' | 'quiet',
  c: ReturnType<typeof useTheme>,
): string {
  switch (tone) {
    case 'brand':
      return c.brand600;
    case 'success':
    case 'up':
      return c.success600;
    case 'warning':
      return c.warning600;
    case 'danger':
    case 'down':
      return c.danger600;
    default:
      return c.fgMuted;
  }
}

/**
 * The ink a tinted chip carries — the **700** step.
 *
 * Every chip in the file pairs the 50 wash with the 700 text and never with the
 * 600: `danger-50/danger-700`, `warning-50/warning-700`, `brand-50/brand-700`
 * (`:394`, `:1131`, and the `chipBg`/`chipFg` pairs at `:1497`–`:1499`,
 * `:1530`, `:1827`–`:1829`, `:1876`). Chips were drawn with `toneColour()`, so
 * every one of them was a stop too light against its own wash — the pale end of
 * a pale pair, which is exactly the combination that fails to read outdoors.
 */
export function toneInk(tone: CrewTone | 'quiet', c: ReturnType<typeof useTheme>): string {
  switch (tone) {
    case 'brand':
      return c.brand700;
    case 'success':
      return c.success700;
    case 'warning':
      return c.warning700;
    case 'danger':
      return c.danger700;
    default:
      return c.fgMuted;
  }
}

/**
 * What fills an attainment bar — the **500** step.
 *
 * `barColor: pct >= 100 ? "var(--success-500)" : pct >= 85 ? "var(--brand-500)"
 * : "var(--warning-500)"` (`:1490`), and the risk and station bars pick from the
 * same step (`:1795`, `:1841`). A bar is a shape, not a word: the design uses
 * the saturated step for it and keeps 600 for text, where the darker stop is
 * what makes small type legible.
 */
export function toneFill(tone: CrewTone, c: ReturnType<typeof useTheme>): string {
  switch (tone) {
    case 'brand':
      return c.brand500;
    case 'success':
      return c.success500;
    case 'warning':
      return c.warning500;
    case 'danger':
      return c.danger500;
    default:
      return c.borderStrong;
  }
}

/** The tinted background that goes with a tone — the left edge, the chip. */
export function toneWash(tone: CrewTone | 'quiet', c: ReturnType<typeof useTheme>): string {
  switch (tone) {
    case 'brand':
      return c.brand50;
    case 'success':
      return c.success50;
    case 'warning':
      return c.warning50;
    case 'danger':
      return c.danger50;
    default:
      return c.bgMuted;
  }
}

/**
 * A tinted chip: a word and a tint, never a tint alone.
 *
 * The design draws this pill at two sizes and they are not interchangeable:
 *
 * - `sm` — `font-size:10px;font-weight:600;padding:3px 8px`, the status word
 *   beside a name (`:272` a delivery, `:416` a drop, `:1131` the shift now on).
 * - `md` — `font-size:11px;font-weight:700;padding:4px 9px`, the pill that
 *   carries a *figure* — days of cover (`:312`), and the flags at `:394`,
 *   `:425`, `:594`.
 *
 * Both were one chip at `text.caption` — 12px at 600 with `9px 3px` — which is
 * larger than either and heavier than one. `sm` is the default because it is
 * the plain status word; a screen showing a number in a pill asks for `md`.
 */
export function Chip({
  tone,
  size: step = 'sm',
  children,
}: {
  tone: CrewTone | 'quiet';
  size?: 'sm' | 'md';
  children: ReactNode;
}) {
  const c = useTheme();

  return (
    <View
      style={[s.chip, step === 'md' ? s.chipMd : s.chipSm, { backgroundColor: toneWash(tone, c) }]}
    >
      <Text style={[step === 'md' ? s.chipMdLine : s.chipSmLine, { color: toneInk(tone, c) }]}>
        {children}
      </Text>
    </View>
  );
}

/* ---------------------------------------------------------------- pieces */

/**
 * The 32px disc with two letters in it — a person, or a branch.
 *
 * The two discs carry different type, which is easy to miss because both are
 * bold on `--brand-100`: the header's profile button is 38px at
 * `font-size:var(--text-xs)` = 12 (`:132`), and the row avatar is 32px at
 * `font-size:var(--text-2xs)` = 11 with `letter-spacing:.01em` (`:174`, `:530`).
 * Both drew at 12 here, so every list row's initials were a pixel too large.
 */
export function Avatar({ initials, big = false }: { initials: string; big?: boolean }) {
  const c = useTheme();
  const side = big ? 38 : 32;

  return (
    <View
      style={[
        s.avatar,
        { width: side, height: side, borderRadius: side / 2, backgroundColor: c.brand100 },
      ]}
    >
      <Text style={[big ? s.avatarBig : s.avatarSmall, { color: c.brand700 }]}>{initials}</Text>
    </View>
  );
}

/**
 * The three-pixel attainment bar.
 *
 * `height:3px;border-radius:2px;background:var(--bg-muted);margin-top:11px`
 * with a fill of the same height and radius (`:196`).
 *
 * Capped at 100 for the drawing only — a branch at 105% keeps the real figure in
 * its label, because a branch that beat its target has earned being told so.
 */
export function Bar({ percent, tone }: { percent: number; tone: CrewTone }) {
  const c = useTheme();

  return (
    <View style={[s.track, { backgroundColor: c.bgMuted }]}>
      <View
        style={[
          s.fill,
          {
            width: `${Math.max(0, Math.min(100, percent))}%`,
            backgroundColor: toneFill(tone, c),
          },
        ]}
      />
    </View>
  );
}

/**
 * A figure with its word under it — the design's stat row inside a hero.
 *
 * `font-family:var(--font-display);font-size:var(--text-md);font-weight:700`
 * over a 10px caption, `gap:2px` between them (`:325`–`:328`). The figure was
 * being set in Inter at 15 rather than Inter Tight, and the word under it at 12
 * in the medium face — so a row of three stats was wider than the card drew and
 * the two lines had no weight contrast between them.
 */
export function Stat({ value, label, dim }: { value: string; label: string; dim: string }) {
  const skin = useCrewSkin();

  return (
    <View style={s.stat}>
      <Text style={[s.statValue, text.num, { color: skin.heroFg }]}>{value}</Text>
      <Text style={[s.statLabel, { color: dim }]}>{label}</Text>
    </View>
  );
}

/* ------------------------------------------------------------------ hero */

/**
 * The dark card at the top of five of these screens.
 *
 * One component rather than five, because it is one card: a label, a figure, a
 * delta chip and either a sparkline or a row of stats under a rule. The waiter's
 * sales, the storekeeper's deliveries and the courier's day are the same shape
 * asking a different question.
 *
 * ---------------------------------------------------------------------------
 * It is one card in three sizes, and they were all being drawn as one
 *
 * The design writes a different padding and a different figure for each, and
 * which one you get depends on what is under the number:
 *
 * - a sparkline (`:146`) — `padding:19px 20px 0`, figure at `--text-4xl` (38),
 *   `margin-top:9px`, `line-height:1.05`. The bottom padding is zero because the
 *   chart is the bottom edge.
 * - a row of stats (`:248` receiving, `:318` tables) — `padding:17px 19px`,
 *   figure at `--text-3xl` (30), `margin-top:7px`.
 * - neither (`:677` my shift, `:718` my day, `:886` a branch) —
 *   `padding:19px 20px`, figure at 38 again but `margin-top:4px;line-height:1`.
 *
 * All three drew `padding:19` on every side and the figure at `text.display` —
 * 30px at 600 — so the revenue headline was eight pixels short of the drawing
 * and a stat card was two pixels wide of it.
 *
 * No `margin-bottom` here even though the last two carry one in the file: the
 * three panels that mount this already space what follows (`today.tsx` puts the
 * design's `margin-top:10px` on the KPI grid, `tables.tsx` 14 on the zone rail),
 * and adding it here would double every gap.
 */
export function Hero({
  label,
  value,
  delta,
  note,
  spark,
  stats,
}: {
  label: string;
  value: string;
  delta?: string;
  note?: string;
  /** The design's polyline over a 300×74 box. */
  spark?: string;
  stats?: readonly { value: string; label: string }[];
}) {
  const skin = useCrewSkin();

  const chart = spark !== undefined;
  const mini = !chart && stats !== undefined;

  return (
    <View
      style={[
        s.hero,
        chart ? s.heroToday : mini ? s.heroMini : s.heroPlain,
        { backgroundColor: skin.heroBg },
      ]}
    >
      <View style={s.heroHead}>
        <Text style={[s.heroLabel, { color: skin.heroDim }]}>{label}</Text>

        {delta === undefined ? null : (
          <View style={[s.heroChip, { backgroundColor: skin.heroChip }]}>
            {/*
             * The chip is an arrow and a number, not a number. Nine pixels over a
             * 12-unit box, `stroke-width:2.2`, round caps and joins, `gap:4px`
             * before the figure (`:151`). The arrow was simply absent, which left
             * a green percentage floating in a grey pill with nothing saying
             * which way it went.
             *
             * It points up and only up, as the design draws it, and the mint is
             * `heroUp` for the same reason. Both are honest today because
             * `BOARD.delta` is positive for both roles; the day a negative delta
             * reaches this card it needs a second arrow and a second colour, and
             * the design has not drawn either.
             */}
            <Svg width={9} height={9} viewBox="0 0 12 12" fill="none">
              <Path
                d="M6 10V2.6"
                stroke={skin.heroUp}
                strokeWidth={2.2}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <Path
                d="M2.6 6 6 2.6 9.4 6"
                stroke={skin.heroUp}
                strokeWidth={2.2}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </Svg>
            <Text style={[s.heroDelta, text.num, { color: skin.heroUp }]}>{delta}</Text>
          </View>
        )}
      </View>

      <Text
        style={[
          chart ? s.heroValueToday : mini ? s.heroValueMini : s.heroValuePlain,
          text.num,
          { color: skin.heroFg },
        ]}
      >
        {value}
      </Text>

      {note === undefined ? null : (
        <Text style={[s.heroNote, { color: skin.heroDim }]}>{note}</Text>
      )}

      {spark === undefined ? null : <Spark points={spark} stroke={skin.heroSpark} />}

      {stats === undefined ? null : (
        <View style={[s.heroStats, { borderTopColor: skin.heroLine }]}>
          {stats.map((stat) => (
            <Stat key={stat.label} value={stat.value} label={stat.label} dim={skin.heroDim} />
          ))}
        </View>
      )}
    </View>
  );
}

/**
 * The day's revenue as a line, from the design's own point list.
 *
 * The polyline is data (`TODAY.spark`) rather than a chart library: twelve
 * points on a 300×74 grid is a `<Polyline>`, and the fill under it is the same
 * points closed to the baseline. A charting dependency for one shape would be a
 * thirteenth package.
 *
 * `width:calc(100% + 40px);height:60px;margin:14px -20px 0` (`:155`) — the chart
 * bleeds past both edges of a card padded 20, and stops at its bottom edge. The
 * horizontal pull was -19 against a 19 padding and a `margin-bottom:-19` was
 * doing the job the card's own `padding-bottom:0` does in the design.
 */
export function Spark({ points, stroke }: { points: string; stroke: string }) {
  return (
    <View style={s.spark}>
      <Svg width="100%" height={60} viewBox="0 0 300 74" preserveAspectRatio="none">
        <Defs>
          <LinearGradient id="crewSpark" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={stroke} stopOpacity="0.34" />
            <Stop offset="1" stopColor={stroke} stopOpacity="0" />
          </LinearGradient>
        </Defs>
        <Path d={`M${points} L300,74 L0,74 Z`} fill="url(#crewSpark)" />
        <Polyline
          points={points}
          fill="none"
          stroke={stroke}
          strokeWidth={2.2}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </Svg>
    </View>
  );
}

/* ------------------------------------------------------------------ card */

/**
 * The bordered card most lists are made of. Pressable when it goes somewhere.
 *
 * `border:1px solid var(--border);border-radius:var(--radius-lg);
 * padding:15px 16px` — the branch card (`:187`), the approval (`:211`), the
 * delivery (`:269`) and the courier's drop (`:412`) are the same box. The
 * padding was 15 all round; the rule was React Native's sub-pixel default, which
 * on a 3× phone is a third of the pixel the design draws.
 */
export function Panel({
  children,
  onPress,
  edge,
  style,
}: {
  children: ReactNode;
  onPress?: () => void;
  /** A 3px coloured left edge — the design's alert and booking cards. */
  edge?: string;
  style?: ViewStyle;
}) {
  const c = useTheme();

  const look: ViewStyle = {
    backgroundColor: c.surface,
    borderColor: c.border,
    ...(edge === undefined ? null : { borderLeftWidth: 3, borderLeftColor: edge }),
  };

  if (onPress === undefined) return <View style={[s.panel, look, style]}>{children}</View>;

  /* `[data-press]:active{transform:scale(.97)}` — the design's press, from
     `PRESSED`. This faded to `opacity:.72`, which reads as "disabled for a
     moment" rather than "pressed". */
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [s.panel, look, pressed && PRESSED, style]}
    >
      {children}
    </Pressable>
  );
}

/**
 * A figure and its caption inside a light tile — the KPI grid's cell.
 *
 * `background:var(--bg-subtle);border-radius:var(--radius-lg);padding:13px 15px`
 * with an 11px caption, the figure at `--text-xl` in Inter Tight after
 * `margin-top:4px`, and the delta at `font-size:10px;font-weight:600` after
 * `margin-top:2px` (`:164`–`:169`). The padding was 13 on all four sides and
 * the delta sat 3 below rather than 2.
 */
export function Tile({
  label,
  value,
  delta,
  tone = 'neutral',
}: {
  label: string;
  value: string;
  delta?: string;
  tone?: CrewTone | 'up' | 'down' | 'flat';
}) {
  const c = useTheme();

  return (
    <View style={[s.tile, { backgroundColor: c.bgSubtle }]}>
      <Text style={[s.tileLabel, { color: c.fgSubtle }]} numberOfLines={1}>
        {label}
      </Text>
      <Text style={[text.title, text.num, s.tileValue, { color: c.fg }]} numberOfLines={1}>
        {value}
      </Text>
      {delta === undefined ? null : (
        <Text style={[s.tileDelta, text.num, { color: toneColour(tone, c) }]} numberOfLines={1}>
          {delta}
        </Text>
      )}
    </View>
  );
}

/** Two-up, which is what every KPI grid in this design is. */
export function TileGrid({ children }: { children: ReactNode }) {
  return <View style={s.grid}>{children}</View>;
}

const s = StyleSheet.create({
  /* `font-size:var(--text-2xs);font-weight:600;letter-spacing:var(--tracking-caps);
     text-transform:uppercase;margin:22px 0 9px` — Xodimlar ilovasi.dc.html:508. */
  section: {
    ...sansAt(600, 11, 1.25),
    letterSpacing: tracking(raw.trackingCaps, 11),
    textTransform: 'uppercase',
    marginTop: 22,
    marginBottom: 9,
  },
  /* `--text-2xs`, weight 400, `line-height:1.55;margin-top:14px` — :698. */
  note: { ...sansAt(400, 11, 1.55), marginTop: 14 },
  /* `--text-sm`, weight 400, `line-height:1.5;margin-bottom:14px` — :185. */
  intro: { ...sansAt(400, 13, 1.5), marginBottom: 14 },
  wired: { borderWidth: 1, borderRadius: size.radiusMd, padding: 12, marginBottom: 12 },
  wiredLine: { ...sansAt(600, 11, 1.55) },
  chip: { alignSelf: 'flex-start', borderRadius: size.radiusPill },
  /* `padding:3px 8px` / `font-size:10px;font-weight:600` — :272. */
  chipSm: { paddingHorizontal: 8, paddingVertical: 3 },
  chipSmLine: { ...sansAt(600, 10, 1.2) },
  /* `padding:4px 9px` / `font-size:11px;font-weight:700` — :312. */
  chipMd: { paddingHorizontal: 9, paddingVertical: 4 },
  chipMdLine: { ...sansAt(700, 11, 1.2) },
  avatar: { alignItems: 'center', justifyContent: 'center' },
  /* 38px disc, `--text-xs` at 700 — :132. */
  avatarBig: { ...sansAt(700, 12, 1.2) },
  /* 32px disc, `--text-2xs` at 700, `letter-spacing:.01em` — :174. */
  avatarSmall: { ...sansAt(700, 11, 1.2), letterSpacing: tracking('0.01em', 11) },
  track: { height: 3, borderRadius: 2, overflow: 'hidden', marginTop: 11 },
  fill: { height: 3, borderRadius: 2 },
  /* `display:flex;flex-direction:column;gap:2px` — :325. */
  stat: { minWidth: 0, gap: 2 },
  statValue: { ...display(700), fontSize: size.textMd, lineHeight: 18 },
  statLabel: { ...sansAt(400, 10, 1.2) },
  hero: { overflow: 'hidden', borderRadius: size.radiusXl },
  /* `padding:19px 20px 0` — the sparkline is the card's bottom edge (:146). */
  heroToday: { paddingHorizontal: 20, paddingTop: 19, paddingBottom: 0 },
  /* `padding:17px 19px` — :248, :318. */
  heroMini: { paddingVertical: 17, paddingHorizontal: 19 },
  /* `padding:19px 20px` — :677, :718, :886. */
  heroPlain: { paddingVertical: 19, paddingHorizontal: 20 },
  heroHead: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 10,
  },
  /* `--text-xs`, weight 400, `line-height:1.4` — :148. */
  heroLabel: { flex: 1, minWidth: 0, ...sansAt(400, 12, 1.4) },
  /* `gap:4px;padding:4px 8px;border-radius:var(--radius-pill)` — :149. */
  heroChip: {
    flexShrink: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: size.radiusPill,
  },
  /* `font-size:var(--text-2xs);font-weight:700;line-height:1` — :149. */
  heroDelta: { ...sansAt(700, 11, 1) },
  /* `--text-4xl` at 700, `line-height:1.05;margin-top:9px` — :153. */
  heroValueToday: { ...displayAt(700, size.text4xl, 1.05), marginTop: 9 },
  /* `--text-3xl` at 700, `line-height:1.05`, in a row 7 below the label — :320. */
  heroValueMini: { ...displayAt(700, size.text3xl, 1.05), marginTop: 7 },
  /* `--text-4xl` at 700, `line-height:1;margin-top:4px` — :679. */
  heroValuePlain: { ...displayAt(700, size.text4xl, 1), marginTop: 4 },
  /* `--text-2xs`, weight 400, `margin-top:5px` — :154. */
  heroNote: { ...sansAt(400, 11, 1.45), marginTop: 5 },
  heroStats: { flexDirection: 'row', gap: 22, marginTop: 14, paddingTop: 13, borderTopWidth: 1 },
  /* `margin:14px -20px 0` against the card's 20 of side padding — :155. */
  spark: { marginTop: 14, marginHorizontal: -20 },
  /* `border:1px solid var(--border);padding:15px 16px` — :187. */
  panel: {
    borderWidth: 1,
    borderRadius: size.radiusLg,
    paddingVertical: 15,
    paddingHorizontal: 16,
  },
  /* `padding:13px 15px` — :165. */
  tile: {
    flexGrow: 1,
    flexBasis: '47%',
    minWidth: 0,
    borderRadius: size.radiusLg,
    paddingVertical: 13,
    paddingHorizontal: 15,
  },
  tileLabel: { ...sansAt(400, 11, 1.45) },
  tileValue: { marginTop: 4 },
  /* `font-size:10px;font-weight:600;margin-top:2px` — :168. Not `text.caps`:
     the design sets neither `text-transform` nor `letter-spacing` here, and
     borrowing the caps preset meant undoing both at every call site. */
  tileDelta: { ...sansAt(600, 10, 1.25), marginTop: 2 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  /* 44 minimum because it is a retry control, not a caption. */
  demoLine: { minHeight: 44, justifyContent: 'center', paddingVertical: 6 },
});
