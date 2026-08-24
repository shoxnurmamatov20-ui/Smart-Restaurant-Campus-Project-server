import type { FontVariant } from 'react-native';

import { display, sans, type DisplayWeight, type SansWeight } from './fonts';
import { raw, size } from './theme';

/**
 * Type, as the design writes it.
 *
 * ---------------------------------------------------------------------------
 * What was wrong here, and why every screen looked foreign
 *
 * This file used to set `family.display` and `family.sans` to `undefined` with
 * a comment saying the platform default would "stand in" until the two families
 * were bundled. They are bundled now (`./fonts.ts`), and the stand-in was never
 * a small thing: San Francisco and Roboto are different widths, different
 * x-heights and different letterforms from Inter, so every line of every screen
 * broke at a different word than the design does. No amount of correcting
 * padding was going to close that.
 *
 * The second half was worse and quieter. `text.num` set `fontFamily:
 * 'monospace'`, and 186 places use it — every price, every time, every count.
 * The design does no such thing: `[data-num]{font-variant-numeric:tabular-nums}`
 * asks for the tabular FIGURES of the same Inter, not a typewriter face. Screens
 * that are mostly numbers — the bill, the cart, the till — were rendered in a
 * typeface the design never mentions.
 *
 * ---------------------------------------------------------------------------
 * How to set type on a screen
 *
 * The design is not built on a type scale with names; it is built on literal
 * values, and screens are meant to carry them. So the primary tool is the pair
 * of face helpers, used with the design's own numbers:
 *
 *     { ...sans(600), fontSize: 15, lineHeight: 22 }      // font-size:15px;line-height:1.45
 *     { ...display(800), fontSize: 30, letterSpacing: tracking(raw.trackingTight, 30) }
 *
 * The presets below are for the handful of combinations that repeat across all
 * four surfaces. Where a screen and the design disagree, the design wins and the
 * screen writes the literal value.
 */
export { display, sans } from './fonts';
export type { DisplayWeight, SansWeight } from './fonts';

/** `-0.022em` at a given size, as the pixel value `letterSpacing` takes. */
export const tracking = (em: string, at: number): number => Number.parseFloat(em) * at;

/** A line height ratio, as the pixel value `lineHeight` takes. */
export const leading = (ratio: string, at: number): number =>
  Math.round(Number.parseFloat(ratio) * at);

/**
 * A face and a size in one call, for the common shape.
 *
 * `type.sans(600, 15)` is `{fontFamily, fontSize:15, lineHeight:22}` — the
 * design's `font-size:var(--text-md);line-height:1.45;font-weight:600` in one
 * line. `line` overrides the ratio where the design names a different one.
 */
export const sansAt = (weight: SansWeight, at: number, line = 1.5) => ({
  ...sans(weight),
  fontSize: at,
  lineHeight: Math.round(at * line),
});

/** The same for the heading face. Tracking comes with it: the design never
 *  sets Inter Tight without `--tracking-tight` or `--tracking-snug`. */
export const displayAt = (
  weight: DisplayWeight,
  at: number,
  line = 1.15,
  track = raw.trackingTight,
) => ({
  ...display(weight),
  fontSize: at,
  lineHeight: Math.round(at * line),
  letterSpacing: tracking(track, at),
});

/**
 * The presets, each a combination the design repeats on every surface.
 *
 * No `fontWeight` on any of them: the weight is the family (see `./fonts.ts`),
 * and setting both makes Android synthesise a second bold on top of a bold.
 */
export const text = {
  /** Screen headings — `--text-3xl` in Inter Tight, the design's `at.auth` h2. */
  display: {
    ...display(700),
    fontSize: size.text3xl,
    lineHeight: leading(raw.lhTight, size.text3xl),
    letterSpacing: tracking(raw.trackingTight, size.text3xl),
  },
  /** Section and card headings — `--text-xl`. */
  title: {
    ...display(700),
    fontSize: size.textXl,
    lineHeight: leading(raw.lhSnug, size.textXl),
    letterSpacing: tracking(raw.trackingSnug, size.textXl),
  },
  /** Body copy — `--text-md`. */
  body: {
    ...sans(400),
    fontSize: size.textMd,
    lineHeight: leading(raw.lhNormal, size.textMd),
  },
  /** Secondary copy and field labels — `--text-sm`. */
  small: {
    ...sans(400),
    fontSize: size.textSm,
    lineHeight: leading(raw.lhNormal, size.textSm),
  },
  /** Notes and helper lines — `--text-xs`. */
  caption: {
    ...sans(500),
    fontSize: size.textXs,
    lineHeight: leading(raw.lhNormal, size.textXs),
  },
  /**
   * The screen header — `--text-2xl` (24px) in the display face.
   *
   * Separate from `title`, because the design draws both: 24px at the top of a
   * screen, 20px above a section inside one. They were the same preset, so
   * every screen title was a section heading.
   */
  screenTitle: {
    ...display(700),
    fontSize: size.text2xl,
    lineHeight: Math.round(size.text2xl * 1.15),
    letterSpacing: tracking(raw.trackingTight, size.text2xl),
  },
  /**
   * `--text-2xs` (11px), the single most-used step on the phone.
   *
   * 144 uses across the four design files — every status pill, every meta line,
   * every figure caption. There was no 11px preset at all, so each of those
   * lines was drawn at 12 (`caption`) or 10 (`caps`).
   */
  label: {
    ...sans(600),
    fontSize: size.text2xs,
    lineHeight: Math.round(size.text2xs * 1.45),
  },
  /** A filter chip's own type — `font-size:12px;font-weight:600`. */
  chip: {
    ...sans(600),
    fontSize: size.textXs,
    lineHeight: Math.round(size.textXs * 1.2),
  },
  /** A segment's — `font-size:11px;font-weight:600`. */
  seg: {
    ...sans(600),
    fontSize: size.text2xs,
    lineHeight: Math.round(size.text2xs * 1.2),
  },
  /** A button's label — `--text-md` at 600, which is what every CTA carries. */
  button: {
    ...sans(600),
    fontSize: size.textMd,
    lineHeight: Math.round(size.textMd * 1.2),
  },
  /** The stepper's glyph — `font-size:19px;font-weight:600;line-height:1`. */
  stepper: {
    ...sans(600),
    fontSize: 19,
    lineHeight: 19,
  },
  /** A count badge — `font-size:10px;font-weight:700`. */
  badge: {
    ...sans(700),
    fontSize: size.text3xs,
    lineHeight: Math.round(size.text3xs * 1.2),
  },
  /**
   * The dock's tab label — 10px at 600, in sentence case.
   *
   * Not `caps`: both docks draw `font-size:10px;font-weight:600` with no
   * `text-transform`, and `caps` forces uppercase. "Menyu" was rendering as
   * "MENYU" in every tab bar in the app.
   */
  tab: {
    ...sans(600),
    fontSize: size.text3xs,
    lineHeight: Math.round(size.text3xs * 1.25),
  },
  /** Uppercase micro-labels: the design's 10px at `.08em`. */
  caps: {
    ...sans(600),
    fontSize: size.text3xs,
    lineHeight: leading(raw.lhSnug, size.text3xs),
    letterSpacing: tracking(raw.trackingCaps, size.text3xs),
    textTransform: 'uppercase' as const,
  },
  /**
   * Figures that line up in a column.
   *
   * The design's `[data-num]` and nothing more: the same Inter, with its
   * tabular figures switched on. It used to swap the family to `monospace`,
   * which is a different typeface on a screen full of prices.
   *
   * The face is deliberately absent — spread `num` on top of whatever weight
   * the line already has, exactly as `data-num` sits on top of a styled element
   * in the design.
   */
  num: {
    // A mutable array on purpose: RN's `TextStyle.fontVariant` is typed as
    // `FontVariant[]`, and a `readonly` tuple does not satisfy it.
    fontVariant: ['tabular-nums'] as FontVariant[],
  },
} as const;
