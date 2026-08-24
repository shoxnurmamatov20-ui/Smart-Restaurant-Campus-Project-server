/*
 * The design's tokens, as a TypeScript object React Native can read.
 *
 * `packages/ui/src/styles/tokens.css` is the contract, and the whole point of a
 * contract is that there is one of it. Transcribing 398 declarations by hand
 * would produce a second palette that agrees with the first on the day it is
 * written and drifts on every day after — which is the exact failure this repo
 * already had once, between `specs/01-os.md` and the design file.
 *
 * So this reads the CSS and writes `src/theme.ts`. Run `pnpm theme` after any
 * token change; `theme.test.ts` fails if the generated file has fallen behind.
 *
 * ---------------------------------------------------------------------------
 * Dark comes from the phone, not from the console
 *
 * `tokens.css` is the console's palette and its dark block is the console's
 * dark block — `--bg:#12151E`, `--surface:#161A24`. The three phone design
 * files agree with each other on a *different* one — `--bg:#0B0E16`,
 * `--surface:#12161F` — and the phone is what this app draws. Generated from
 * `tokens.css` alone, every dark screen on every phone surface was the desktop
 * console's dark mode: thirteen tokens out, on every card, border and line of
 * text in the app.
 *
 * So the light palette still comes from `tokens.css` (the two agree there, and
 * it carries the whole brand scale), and the dark block is overlaid from the
 * design files themselves. They are read together and compared: if the three
 * ever disagree, that is a real question for a designer and this throws rather
 * than picking one.
 *
 * What it does NOT carry: `var()` chains, `color-mix()`, `@theme inline` and the
 * shadcn aliases. React Native has no cascade to resolve them in, and the
 * aliases exist only for the DOM primitives this app does not use. A token whose
 * value is a `var()` is followed to its source instead; anything still not a
 * literal after that is dropped, and named in the file's header so the omission
 * is visible rather than silent.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const TOKENS = join(HERE, '../../../packages/ui/src/styles/tokens.css');
const OUT = join(HERE, '../src/theme.ts');
const MP_OUT = join(HERE, '../src/mp-theme.ts');

const css = readFileSync(TOKENS, 'utf8');

/** Strip comments so a commented-out token never reaches the output. */
const bare = css.replace(/\/\*[\s\S]*?\*\//g, '');

/**
 * The declarations inside one selector's first block.
 *
 * Deliberately not a CSS parser: the file is hand-written, one declaration per
 * line, and a parser would be a dependency for a problem that does not exist.
 */
function block(selector) {
  /*
   * Anchored to the start of a line, and that is not fussiness.
   *
   * The file opens with `@custom-variant dark (&:where([data-theme='dark'], …))`
   * — which contains the dark selector as a *substring*. A plain `indexOf` finds
   * that line, walks to the next `{`, and returns the `:root` block: the dark
   * palette came out identical to the light one, every dark screen would have
   * rendered light, and nothing would have errored. `theme.test.ts` caught it by
   * asserting the two themes actually differ.
   */
  const at = bare.search(new RegExp(`^${selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'm'));

  if (at < 0) throw new Error(`tokens.css has no ${selector}`);

  const open = bare.indexOf('{', at);
  const close = bare.indexOf('}', open);

  return Object.fromEntries(
    [...bare.slice(open + 1, close).matchAll(/--([\w-]+)\s*:\s*([^;]+);/g)].map((m) => [
      m[1],
      m[2].trim(),
    ]),
  );
}

const light = block(':root {');

/**
 * The dark palette the three phone surfaces share.
 *
 * Read out of the design files rather than out of `tokens.css`, and read from
 * all three so a disagreement is a failure rather than a coin toss. Only the
 * tokens the phone actually remaps come back — the brand and neutral scales are
 * identical in both places and stay with the light palette.
 */
function phoneDark() {
  /*
   * The two restaurant phone surfaces, and deliberately not the marketplace.
   *
   * MyPOS Marketplace is a different product with a different token vocabulary
   * — `--page`, `--sunken`, `--brand`, `--ok`, `--star` — and its dark block
   * remaps `--n-0` and `--n-900` to the page ground, because in that system the
   * neutral ramp IS the surface ramp. Merged in here it dragged `--n-0` to
   * near-black for every surface, so a white label on a brand button came out
   * unreadable on all of them. Its two real differences (`--page` is the muted
   * grey rather than white, and its dark brand is the lighter #3B82F6) belong to
   * its own screens; see `app/(marketplace)/_layout.tsx`.
   */
  const files = [
    'Smart Restaurant Mijoz ilovasi.dc.html',
    'Smart Restaurant Xodimlar ilovasi.dc.html',
  ].map((name) => join(HERE, '../../../docs/design/source/', name));

  const palettes = files.map((path) => {
    const html = readFileSync(path, 'utf8');
    const at = html.indexOf('[data-theme="dark"]');

    if (at < 0) throw new Error(`${path} has no dark block`);

    const open = html.indexOf('{', at);
    const close = html.indexOf('}', open);

    return Object.fromEntries(
      [...html.slice(open + 1, close).matchAll(/--([\w-]+)\s*:\s*([^;]+);/g)].map((m) => [
        m[1],
        m[2].trim(),
      ]),
    );
  });

  const [first, ...rest] = palettes;

  for (const [name, value] of Object.entries(first)) {
    for (const other of rest) {
      if (other[name] !== undefined && other[name] !== value) {
        throw new Error(`the phone design files disagree on --${name}: ${value} vs ${other[name]}`);
      }
    }
  }

  return Object.assign({}, ...palettes);
}

/*
 * Light from `tokens.css`, dark from the phone — and the console's dark block
 * deliberately not in between.
 *
 * It remaps more than the phone design does. `--n-0` becomes the page ground
 * and `--brand-500` shifts to #3b82f6 there; the phone files leave both alone,
 * so a white label on a brand button stays white and the blue stays the blue
 * every other surface uses. Merging the console's block in first and the
 * phone's on top would keep those extra remappings, which is how a button
 * ended up with near-black text on it in dark mode.
 */
const dark = { ...light, ...phoneDark() };

/** Follow `var(--x)` to a literal, up to a short chain. */
function resolve(value, scope, depth = 0) {
  const match = /^var\(\s*--([\w-]+)\s*(?:,[^)]*)?\)$/.exec(value);

  if (match === null || depth > 4) return value;

  const next = scope[match[1]];

  return next === undefined ? value : resolve(next, scope, depth + 1);
}

/**
 * What kind of value this is, which decides where it lands.
 *
 * React Native does not take CSS strings: a size is a *number* of density-
 * independent pixels, and `fontSize: "20px"` is silently ignored on Android and
 * throws on iOS. So the generator sorts rather than dumping — a colour goes in
 * the palette, a `px` becomes a number, a duration becomes milliseconds, and
 * anything left is kept as a string under `raw` where a reader can see it was
 * carried but not converted.
 */
const COLOUR = /^(#[0-9a-f]{3,8}|rgba?\(|hsla?\()/i;
const PX = /^(-?\d+(?:\.\d+)?)px$/;
const MS = /^(\d+(?:\.\d+)?)ms$/;

const convertible = (value) =>
  !value.includes('var(') && !value.includes('color-mix(') && !value.includes('calc(');

/** `--brand-500` → `brand500`, so a screen writes `c.brand500`. */
const key = (name) => name.replace(/-(\w)/g, (_, c) => c.toUpperCase()).replace(/-/g, '');

function sort(scope) {
  const colour = {};
  const size = {};
  const duration = {};
  const raw = {};
  const dropped = [];

  for (const [name, source] of Object.entries(scope)) {
    const value = resolve(source, scope);

    if (!convertible(value)) {
      dropped.push(name);
      continue;
    }

    if (COLOUR.test(value)) colour[name] = value;
    else if (PX.test(value)) size[name] = Number(PX.exec(value)[1]);
    else if (MS.test(value)) duration[name] = Number(MS.exec(value)[1]);
    else raw[name] = value;
  }

  return { colour, size, duration, raw, dropped };
}

const l = sort(light);
const d = sort(dark);

const object = (scope, quote) =>
  Object.entries(scope)
    .map(([name, value]) => `  ${key(name)}: ${quote ? JSON.stringify(value) : value},`)
    .join('\n');

/*
 * Dark is built from the light key list rather than from its own, so the two are
 * the same shape by construction. A colour the design does not remap keeps its
 * light value — which is what stops a screen reading a token that exists in one
 * theme only and renders `undefined` in the other.
 */
const darkColour = Object.keys(l.colour)
  .map((name) => `  ${key(name)}: ${JSON.stringify(d.colour[name] ?? l.colour[name])},`)
  .join('\n');

/**
 * Elevation, which is theme-dependent and was not carried at all.
 *
 * The design applies a shadow twenty-seven times across the four phone files —
 * every bottom sheet, every toast, the staff dock, the raised cards — and none
 * of it reached the app: the generator sorts a `box-shadow` string into `raw`,
 * where it sits as a CSS string nothing reads. React Native 0.76 added
 * `boxShadow` and takes the CSS syntax, so the values travel verbatim.
 *
 * They belong here rather than in `raw` because the phone's dark block turns
 * four of the five OFF (`--shadow-xs..lg:none`) and rewrites the fifth. A
 * shadow that survives into dark mode is a grey halo on a near-black card,
 * which is exactly what a dark theme removes them to avoid.
 */
function shadows(theme) {
  const html = readFileSync(
    join(HERE, '../../../docs/design/source/Smart Restaurant Mijoz ilovasi.dc.html'),
    'utf8',
  );
  const at = theme === 'dark' ? html.indexOf('[data-theme="dark"]') : html.indexOf(':root{');
  const open = html.indexOf('{', at);
  const close = html.indexOf('}', open);

  return Object.fromEntries(
    [...html.slice(open + 1, close).matchAll(/--shadow-([\w-]+)\s*:\s*([^;]+);/g)].map((m) => [
      m[1],
      m[2].trim(),
    ]),
  );
}

const shadowL = shadows('light');
const shadowD = { ...shadowL, ...shadows('dark') };

const shadowFile = `
/**
 * The design's box-shadows, as React Native takes them.
 *
 * \`boxShadow\` reads CSS syntax since RN 0.76, so these are the design's own
 * strings. Dark switches four of the five off — see the generator.
 */
/* Not \`as const\`, for the reason the palette is not: dark holds different
   strings under the same keys, and a frozen literal type refuses them. */
export const shadowLight = {
${Object.entries(shadowL)
  .map(([name, value]) => `  ${key(name)}: ${JSON.stringify(value)},`)
  .join('\n')}
};

export const shadowDark: typeof shadowLight = {
${Object.keys(shadowL)
  .map((name) => `  ${key(name)}: ${JSON.stringify(shadowD[name] ?? shadowL[name])},`)
  .join('\n')}
};

export const shadowsFor = (
  scheme: 'light' | 'dark' | null | undefined,
): typeof shadowLight => (scheme === 'dark' ? shadowDark : shadowLight);
`;

const counts = `${Object.keys(l.colour).length} rang · ${Object.keys(l.size).length} o'lcham · ${
  Object.keys(l.duration).length
} davomiylik · ${Object.keys(l.raw).length} xom`;

const file = `/*
 * GENERATED — do not edit. Run \`pnpm theme\` in apps/mobile.
 *
 * Source: packages/ui/src/styles/tokens.css — ${counts}.
 *
 * Sorted rather than dumped, because React Native does not read CSS strings: a
 * size is a number of density-independent pixels, and \`fontSize: "20px"\` is
 * ignored on Android and throws on iOS.
 *
 * ${l.dropped.length} token dropped, their values being \`var()\` chains, \`color-mix()\` or
 * \`calc()\` that only a cascade could resolve: ${l.dropped.join(', ') || 'none'}.
 * The three font tokens are among them on purpose — a CSS font stack names
 * fallbacks for a browser to walk, and React Native takes one loaded family. See
 * \`src/type.ts\`, which names them.
 */

/*
 * Deliberately not \`as const\`.
 *
 * A colour here is a string, not a literal: \`as const\` froze \`light.brand500\` to
 * the type \`"#2e74ea"\`, and \`dark\` — the same keys holding different strings —
 * then failed to satisfy \`typeof light\` on every remapped token. The whole point
 * of \`typeof light\` is "both themes carry this key set", which is a statement
 * about keys and not about values.
 */
export const light = {
${object(l.colour, true)}
};

export const dark: typeof light = {
${darkColour}
};

/** Theme-independent: the design remaps colour between themes, never metrics. */
export const size = {
${object(l.size, false)}
} as const;

/** Milliseconds. */
export const duration = {
${object(l.duration, false)}
} as const;

/** Carried but not converted — kept so nothing is silently lost. */
export const raw = {
${object(l.raw, true)}
} as const;

export type Colour = keyof typeof light;
export type Size = keyof typeof size;

/** The palette for a scheme. \`null\` — a system with no preference — is light. */
export const paletteFor = (scheme: 'light' | 'dark' | null | undefined): typeof light =>
  scheme === 'dark' ? dark : light;
${shadowFile}`;

/* ============================================================
   MyPOS Marketplace — a second product, a second palette
   ============================================================ */

/**
 * The marketplace's own tokens, from its own design file.
 *
 * `MyPOS Marketplace - Ilova.dc.html` is not the restaurant system with a
 * different logo: it names its colours differently — `--page`, `--sunken`,
 * `--brand`, `--ok`, `--warn`, `--bad`, `--star` — and three of them have no
 * equivalent in the restaurant palette at all (`--ok-fg`, `--warn-fg`,
 * `--bad-fg`, the lightened status tones it uses on dark). Two more genuinely
 * differ rather than merely being renamed:
 *
 *   `--page` is `#F1F3F7`, the muted grey. The marketplace app sits on a grey
 *   ground with white cards on it; the restaurant surfaces sit on white. Drawn
 *   with `--bg`, every marketplace screen lost the contrast the whole layout is
 *   built on — the cards stopped being cards.
 *
 *   `--brand` lightens to `#3B82F6` on dark, where the restaurant's stays
 *   `#2E74EA`.
 *
 * So it gets its own generated file rather than a handful of overrides sprinkled
 * through the screens, and it is generated for the same reason the other one is:
 * a palette transcribed by hand agrees with the design on the day it is written.
 */
function marketplacePalette(theme) {
  const html = readFileSync(
    join(HERE, '../../../docs/design/source/MyPOS Marketplace - Ilova.dc.html'),
    'utf8',
  );
  const at = html.indexOf(`[data-theme="${theme}"]`);

  if (at < 0) throw new Error(`the marketplace design has no ${theme} block`);

  const open = html.indexOf('{', at);
  const close = html.indexOf('}', open);

  return Object.fromEntries(
    [...html.slice(open + 1, close).matchAll(/--([\w-]+)\s*:\s*([^;]+);/g)].map((m) => [
      m[1],
      m[2].trim(),
    ]),
  );
}

const mpLight = marketplacePalette('light');
const mpDark = { ...mpLight, ...marketplacePalette('dark') };

/** Colours only: the gradients and shadows need a cascade React Native has not. */
const mpColour = (scope) =>
  Object.fromEntries(Object.entries(scope).filter(([, value]) => COLOUR.test(value)));

const mpL = mpColour(mpLight);
const mpD = mpColour(mpDark);

/** `--sh-card` and `--sh-pop`, which are shadows rather than colours. */
const mpShadow = (scope) =>
  Object.fromEntries(
    Object.entries(scope)
      .filter(([name]) => name.startsWith('sh-'))
      .map(([name, value]) => [name.replace(/^sh-/, ''), value]),
  );

const mpShL = mpShadow(mpLight);
const mpShD = mpShadow(mpDark);

const mpFile = `/*
 * GENERATED — do not edit. Run \`pnpm theme\` in apps/mobile.
 *
 * Source: docs/design/source/MyPOS Marketplace - Ilova.dc.html — ${
   Object.keys(mpL).length
 } colours.
 *
 * The marketplace is a second product with a second palette: a grey page under
 * white cards, its own status tones, and a brand that lightens on dark. See
 * \`scripts/build-theme.mjs\` for why it is not folded into \`theme.ts\`.
 */

export const mpLight = {
${Object.entries(mpL)
  .map(([name, value]) => `  ${key(name)}: ${JSON.stringify(value)},`)
  .join('\n')}
};

export const mpDark: typeof mpLight = {
${Object.keys(mpL)
  .map((name) => `  ${key(name)}: ${JSON.stringify(mpD[name] ?? mpL[name])},`)
  .join('\n')}
};

export type MpColour = keyof typeof mpLight;

/**
 * The marketplace's two shadows — \`--sh-card\` under every store card and
 * \`--sh-pop\` under its sheets. Both go to \`none\` on dark, as the design says.
 */
export const mpShadowLight = {
${Object.entries(mpShL)
  .map(([name, value]) => `  ${key(name)}: ${JSON.stringify(value)},`)
  .join('\n')}
};

export const mpShadowDark: typeof mpShadowLight = {
${Object.keys(mpShL)
  .map((name) => `  ${key(name)}: ${JSON.stringify(mpShD[name] ?? mpShL[name])},`)
  .join('\n')}
};

export const mpShadowsFor = (
  scheme: 'light' | 'dark' | null | undefined,
): typeof mpShadowLight => (scheme === 'dark' ? mpShadowDark : mpShadowLight);

/** The palette for a scheme. \`null\` — a system with no preference — is light. */
export const mpPaletteFor = (scheme: 'light' | 'dark' | null | undefined): typeof mpLight =>
  scheme === 'dark' ? mpDark : mpLight;
`;

/*
 * `THEME_STDOUT=1` prints instead of writing, so `theme.test.ts` can regenerate
 * into memory and compare. Without it the test would have to write the file it
 * is checking, and a test that repairs what it measures measures nothing.
 */
if (process.env.THEME_STDOUT === '1') {
  process.stdout.write(file);
} else if (process.env.MP_THEME_STDOUT === '1') {
  process.stdout.write(mpFile);
} else {
  writeFileSync(OUT, file);
  writeFileSync(MP_OUT, mpFile);
  console.log(`theme.ts: ${counts}, ${l.dropped.length} tashlab yuborildi`);
  console.log(`mp-theme.ts: ${Object.keys(mpL).length} rang`);
}
