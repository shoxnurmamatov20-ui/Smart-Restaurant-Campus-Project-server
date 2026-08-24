/**
 * The design's own two typefaces, bundled into the binary.
 *
 * The handoff's `<link>` is not decoration: every screen in every `.dc.html`
 * file is set in **Inter** with **Inter Tight** on the headings and the figures,
 * and until this file existed the app rendered all of it in the platform
 * default — San Francisco on iOS, Roboto on Android. Two different typefaces at
 * two different widths and two different x-heights: nothing on any screen lined
 * up with the design, and no amount of correcting padding was going to make it.
 *
 * ---------------------------------------------------------------------------
 * Why one family per weight, and not `fontWeight`
 *
 * On the web, `font-weight:600` picks the semibold face out of a family the
 * browser has four files for. React Native does not do that on Android: a
 * runtime-registered font is one family under the exact name it was registered
 * with, and `fontWeight` on top of it is ignored or synthesised into a smear.
 * So each weight is its own family here, and `face()` is how a screen asks for
 * one. `src/type.ts` binds the pairs the design actually draws; nothing else
 * should name these strings.
 *
 * ---------------------------------------------------------------------------
 * Bundled, not fetched
 *
 * The `.ttf` files sit in `assets/fonts/` and go into the APK. A restaurant's
 * waiter opens this app in a basement with no signal, and a typeface that
 * arrives over the network is a screen that reflows a second after it is read —
 * or never. 2.2 MB for seven faces is the right trade for that.
 *
 * They are Google's own static instances of Inter v20 and Inter Tight v7, SIL
 * Open Font License 1.1, which permits bundling and requires only that they are
 * not sold on their own. `assets/fonts/OFL.txt` carries the licence.
 */

/**
 * The seven faces, as a family name and the file that carries it.
 *
 * One list, read three ways: `fonts.assets.ts` maps it to `require` calls,
 * `fonts.test.ts` walks it on disk, and the two helpers below index into it. A
 * weight added in one place and forgotten in another is a failing test.
 */
export const FACES = [
  { family: 'Inter_400Regular', file: 'Inter-Regular.ttf', role: 'sans', weight: 400 },
  { family: 'Inter_500Medium', file: 'Inter-Medium.ttf', role: 'sans', weight: 500 },
  { family: 'Inter_600SemiBold', file: 'Inter-SemiBold.ttf', role: 'sans', weight: 600 },
  { family: 'Inter_700Bold', file: 'Inter-Bold.ttf', role: 'sans', weight: 700 },
  {
    family: 'InterTight_600SemiBold',
    file: 'InterTight-SemiBold.ttf',
    role: 'display',
    weight: 600,
  },
  { family: 'InterTight_700Bold', file: 'InterTight-Bold.ttf', role: 'display', weight: 700 },
  {
    family: 'InterTight_800ExtraBold',
    file: 'InterTight-ExtraBold.ttf',
    role: 'display',
    weight: 800,
  },
] as const;

/** The weights the design draws, per role. */
export type SansWeight = 400 | 500 | 600 | 700;
export type DisplayWeight = 600 | 700 | 800;

const SANS: Record<SansWeight, string> = {
  400: 'Inter_400Regular',
  500: 'Inter_500Medium',
  600: 'Inter_600SemiBold',
  700: 'Inter_700Bold',
};

const DISPLAY: Record<DisplayWeight, string> = {
  600: 'InterTight_600SemiBold',
  700: 'InterTight_700Bold',
  800: 'InterTight_800ExtraBold',
};

/**
 * The interface face — `var(--font-sans)` in the design.
 *
 * Everything a person reads as text: body copy, labels, buttons, table rows.
 */
export const sans = (weight: SansWeight = 400): { fontFamily: string } => ({
  fontFamily: SANS[weight],
});

/**
 * The heading face — `var(--font-display)` in the design.
 *
 * Inter Tight is narrower and tighter than Inter, which is why the design uses
 * it for headings and for any figure large enough to be read as a headline. It
 * is never used below 600: the design has no light Inter Tight anywhere, and
 * loading a face nothing draws is 300 KB in the APK for nothing.
 */
export const display = (weight: DisplayWeight = 700): { fontFamily: string } => ({
  fontFamily: DISPLAY[weight],
});
