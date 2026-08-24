/*
 * GENERATED — do not edit. Run `pnpm theme` in apps/mobile.
 *
 * Source: packages/ui/src/styles/tokens.css — 87 rang · 33 o'lcham · 3 davomiylik · 22 xom.
 *
 * Sorted rather than dumped, because React Native does not read CSS strings: a
 * size is a number of density-independent pixels, and `fontSize: "20px"` is
 * ignored on Android and throws on iOS.
 *
 * 5 token dropped, their values being `var()` chains, `color-mix()` or
 * `calc()` that only a cascade could resolve: focus-ring, font-display, font-sans, font-mono, shadow-focus.
 * The three font tokens are among them on purpose — a CSS font stack names
 * fallbacks for a browser to walk, and React Native takes one loaded family. See
 * `src/type.ts`, which names them.
 */

/*
 * Deliberately not `as const`.
 *
 * A colour here is a string, not a literal: `as const` froze `light.brand500` to
 * the type `"#2e74ea"`, and `dark` — the same keys holding different strings —
 * then failed to satisfy `typeof light` on every remapped token. The whole point
 * of `typeof light` is "both themes carry this key set", which is a statement
 * about keys and not about values.
 */
export const light = {
  n0: "#ffffff",
  n25: "#fcfcfd",
  n50: "#f8f9fb",
  n100: "#f1f3f7",
  n150: "#e7eaf0",
  n200: "#d9dee6",
  n300: "#bfc6d2",
  n400: "#98a1b0",
  n500: "#6e7789",
  n600: "#4c5568",
  n700: "#333b4c",
  n800: "#1f2533",
  n900: "#0f1320",
  brand50: "#eef5ff",
  brand100: "#dbe9fe",
  brand200: "#bdd7fc",
  brand300: "#8dbbf9",
  brand400: "#5897f3",
  brand500: "#2e74ea",
  brand600: "#1c5ad1",
  brand700: "#1947a8",
  brand800: "#1a3d85",
  brand900: "#1a3469",
  accent50: "#ecfbf6",
  accent100: "#d1f5e8",
  accent500: "#0fb48a",
  accent600: "#0a8f6c",
  accent700: "#086f54",
  success50: "#ecfdf3",
  success500: "#12b76a",
  success600: "#039855",
  success700: "#027a48",
  warning50: "#fffaeb",
  warning500: "#f79009",
  warning600: "#dc6803",
  warning700: "#b54708",
  danger50: "#fef3f2",
  danger500: "#f04438",
  danger600: "#d92d20",
  danger700: "#b42318",
  ratingStar: "#ffb020",
  bg: "#ffffff",
  bgSubtle: "#f8f9fb",
  bgMuted: "#f1f3f7",
  bgInverse: "#0f1320",
  surface: "#ffffff",
  surfaceRaised: "#ffffff",
  surfaceSunken: "#f8f9fb",
  border: "#e7eaf0",
  borderStrong: "#d9dee6",
  divider: "#f1f3f7",
  fg: "#0f1320",
  fgMuted: "#4c5568",
  fgSubtle: "#6e7789",
  fgDisabled: "#98a1b0",
  fgInverse: "#ffffff",
  fgBrand: "#1c5ad1",
  fgLink: "#1c5ad1",
  background: "#ffffff",
  foreground: "#0f1320",
  card: "#ffffff",
  cardForeground: "#0f1320",
  popover: "#ffffff",
  popoverForeground: "#0f1320",
  primary: "#2e74ea",
  primaryForeground: "#ffffff",
  secondary: "#f1f3f7",
  secondaryForeground: "#0f1320",
  muted: "#f8f9fb",
  mutedForeground: "#4c5568",
  destructive: "#f04438",
  destructiveForeground: "#ffffff",
  input: "#e7eaf0",
  ring: "#2e74ea",
  chart1: "#2e74ea",
  chart2: "#0fb48a",
  chart3: "#f79009",
  chart4: "#f04438",
  chart5: "#98a1b0",
  sidebar: "#ffffff",
  sidebarForeground: "#0f1320",
  sidebarPrimary: "#1c5ad1",
  sidebarPrimaryForeground: "#ffffff",
  sidebarAccent: "#eef5ff",
  sidebarAccentForeground: "#1947a8",
  sidebarBorder: "#e7eaf0",
  sidebarRing: "#2e74ea",
};

export const dark: typeof light = {
  n0: "#ffffff",
  n25: "#fcfcfd",
  n50: "#f8f9fb",
  n100: "#f1f3f7",
  n150: "#e7eaf0",
  n200: "#d9dee6",
  n300: "#bfc6d2",
  n400: "#98a1b0",
  n500: "#6e7789",
  n600: "#4c5568",
  n700: "#333b4c",
  n800: "#1f2533",
  n900: "#0f1320",
  brand50: "rgba(46,116,234,.14)",
  brand100: "rgba(46,116,234,.2)",
  brand200: "rgba(46,116,234,.3)",
  brand300: "rgba(46,116,234,.42)",
  brand400: "#5897f3",
  brand500: "#2e74ea",
  brand600: "#1c5ad1",
  brand700: "#1947a8",
  brand800: "#1a3d85",
  brand900: "#1a3469",
  accent50: "rgba(15,180,138,.14)",
  accent100: "#d1f5e8",
  accent500: "#0fb48a",
  accent600: "#0a8f6c",
  accent700: "#086f54",
  success50: "rgba(18,183,106,.14)",
  success500: "#12b76a",
  success600: "#039855",
  success700: "#027a48",
  warning50: "rgba(247,144,9,.14)",
  warning500: "#f79009",
  warning600: "#dc6803",
  warning700: "#b54708",
  danger50: "rgba(240,68,56,.14)",
  danger500: "#f04438",
  danger600: "#d92d20",
  danger700: "#b42318",
  ratingStar: "#ffb020",
  bg: "#0B0E16",
  bgSubtle: "#12161F",
  bgMuted: "#1A1F2B",
  bgInverse: "#0f1320",
  surface: "#12161F",
  surfaceRaised: "#1A1F2B",
  surfaceSunken: "#f8f9fb",
  border: "#232A38",
  borderStrong: "#2E3648",
  divider: "#1C2230",
  fg: "#EDF0F5",
  fgMuted: "#9AA3B4",
  fgSubtle: "#79839A",
  fgDisabled: "#566073",
  fgInverse: "#0B0E16",
  fgBrand: "#1c5ad1",
  fgLink: "#1c5ad1",
  background: "#0B0E16",
  foreground: "#EDF0F5",
  card: "#12161F",
  cardForeground: "#EDF0F5",
  popover: "#12161F",
  popoverForeground: "#EDF0F5",
  primary: "#2e74ea",
  primaryForeground: "#ffffff",
  secondary: "#1A1F2B",
  secondaryForeground: "#EDF0F5",
  muted: "#12161F",
  mutedForeground: "#9AA3B4",
  destructive: "#f04438",
  destructiveForeground: "#ffffff",
  input: "#232A38",
  ring: "#2e74ea",
  chart1: "#2e74ea",
  chart2: "#0fb48a",
  chart3: "#f79009",
  chart4: "#f04438",
  chart5: "#98a1b0",
  sidebar: "#12161F",
  sidebarForeground: "#EDF0F5",
  sidebarPrimary: "#1c5ad1",
  sidebarPrimaryForeground: "#ffffff",
  sidebarAccent: "rgba(46,116,234,.14)",
  sidebarAccentForeground: "#1947a8",
  sidebarBorder: "#232A38",
  sidebarRing: "#2e74ea",
};

/** Theme-independent: the design remaps colour between themes, never metrics. */
export const size = {
  text3xs: 10,
  text2xs: 11,
  textXs: 12,
  textSm: 13,
  textMd: 15,
  textLg: 17,
  textXl: 20,
  text2xl: 24,
  text3xl: 30,
  text4xl: 38,
  text5xl: 48,
  text6xl: 60,
  text7xl: 76,
  sp1: 4,
  sp2: 8,
  sp3: 12,
  sp4: 16,
  sp5: 20,
  sp6: 24,
  sp7: 32,
  sp8: 40,
  sp9: 48,
  sp10: 64,
  sp11: 80,
  sp12: 96,
  radiusXs: 4,
  radiusSm: 6,
  radiusMd: 10,
  radiusLg: 14,
  radiusXl: 20,
  radius2xl: 28,
  radiusPill: 999,
  radius: 10,
} as const;

/** Milliseconds. */
export const duration = {
  durFast: 120,
  durMed: 200,
  durSlow: 320,
} as const;

/** Carried but not converted — kept so nothing is silently lost. */
export const raw = {
  posIdle: "linear-gradient(165deg, #141a28 0%, #0b0e16 58%, #0f1320 100%)",
  lhTight: "1.12",
  lhSnug: "1.25",
  lhNormal: "1.45",
  lhRelaxed: "1.6",
  trackingTight: "-0.022em",
  trackingSnug: "-0.012em",
  trackingNormal: "0",
  trackingWide: "0.02em",
  trackingCaps: "0.08em",
  fwRegular: "400",
  fwMedium: "500",
  fwSemibold: "600",
  fwBold: "700",
  shadowXs: "0 1px 2px rgba(16, 24, 40, 0.04)",
  shadowSm: "0 1px 2px rgba(16, 24, 40, 0.06), 0 1px 3px rgba(16, 24, 40, 0.06)",
  shadowMd: "0 4px 8px -2px rgba(16, 24, 40, 0.06), 0 2px 4px -2px rgba(16, 24, 40, 0.04)",
  shadowLg: "0 12px 16px -4px rgba(16, 24, 40, 0.06), 0 4px 6px -2px rgba(16, 24, 40, 0.03)",
  shadowXl: "0 20px 24px -4px rgba(16, 24, 40, 0.08), 0 8px 8px -4px rgba(16, 24, 40, 0.03)",
  easeStandard: "cubic-bezier(0.4, 0, 0.2, 1)",
  easeOut: "cubic-bezier(0, 0, 0.2, 1)",
  easeSpring: "cubic-bezier(0.34, 1.38, 0.64, 1)",
} as const;

export type Colour = keyof typeof light;
export type Size = keyof typeof size;

/** The palette for a scheme. `null` — a system with no preference — is light. */
export const paletteFor = (scheme: 'light' | 'dark' | null | undefined): typeof light =>
  scheme === 'dark' ? dark : light;

/**
 * The design's box-shadows, as React Native takes them.
 *
 * `boxShadow` reads CSS syntax since RN 0.76, so these are the design's own
 * strings. Dark switches four of the five off — see the generator.
 */
/* Not `as const`, for the reason the palette is not: dark holds different
   strings under the same keys, and a frozen literal type refuses them. */
export const shadowLight = {
  xs: "0 1px 2px rgba(16,24,40,.04)",
  sm: "0 1px 2px rgba(16,24,40,.06),0 1px 3px rgba(16,24,40,.06)",
  md: "0 4px 8px -2px rgba(16,24,40,.06),0 2px 4px -2px rgba(16,24,40,.04)",
  lg: "0 12px 16px -4px rgba(16,24,40,.06),0 4px 6px -2px rgba(16,24,40,.03)",
  xl: "0 20px 24px -4px rgba(16,24,40,.08),0 8px 8px -4px rgba(16,24,40,.03)",
};

export const shadowDark: typeof shadowLight = {
  xs: "none",
  sm: "none",
  md: "none",
  lg: "none",
  xl: "0 20px 40px rgba(0,0,0,.5)",
};

export const shadowsFor = (
  scheme: 'light' | 'dark' | null | undefined,
): typeof shadowLight => (scheme === 'dark' ? shadowDark : shadowLight);
