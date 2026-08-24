/*
 * GENERATED — do not edit. Run `pnpm theme` in apps/mobile.
 *
 * Source: docs/design/source/MyPOS Marketplace - Ilova.dc.html — 31 colours.
 *
 * The marketplace is a second product with a second palette: a grey page under
 * white cards, its own status tones, and a brand that lightens on dark. See
 * `scripts/build-theme.mjs` for why it is not folded into `theme.ts`.
 */

export const mpLight = {
  n0: '#FFFFFF',
  n50: '#F8F9FB',
  n100: '#F1F3F7',
  n150: '#E7EAF0',
  n200: '#D9DEE6',
  n400: '#98A1B0',
  n900: '#0F1320',
  page: '#F1F3F7',
  surface: '#FFFFFF',
  sunken: '#F1F3F7',
  fg: '#0F1320',
  fgMuted: '#4C5568',
  fgSubtle: '#6E7789',
  fgDisabled: '#98A1B0',
  border: '#E7EAF0',
  borderStrong: '#D9DEE6',
  divider: '#F1F3F7',
  brand: '#2E74EA',
  brandDark: '#1C5AD1',
  brandSoft: '#EEF5FF',
  brandLine: '#BDD7FC',
  ok: '#12B76A',
  okSoft: '#ECFDF3',
  okFg: '#027A48',
  warn: '#F79009',
  warnSoft: '#FFFAEB',
  warnFg: '#B54708',
  bad: '#F04438',
  badSoft: '#FEF3F2',
  badFg: '#B42318',
  star: '#FFB020',
};

export const mpDark: typeof mpLight = {
  n0: '#0B0E16',
  n50: '#12161F',
  n100: '#1A1F2B',
  n150: '#232A38',
  n200: '#2E3648',
  n400: '#566073',
  n900: '#EDF0F5',
  page: '#0B0E16',
  surface: '#12161F',
  sunken: '#1A1F2B',
  fg: '#EDF0F5',
  fgMuted: '#9AA3B4',
  fgSubtle: '#79839A',
  fgDisabled: '#566073',
  border: '#232A38',
  borderStrong: '#2E3648',
  divider: '#1C2230',
  brand: '#3B82F6',
  brandDark: '#2E74EA',
  brandSoft: 'rgba(59,130,246,.14)',
  brandLine: 'rgba(59,130,246,.30)',
  ok: '#12B76A',
  okSoft: 'rgba(18,183,106,.14)',
  okFg: '#5AD69B',
  warn: '#F79009',
  warnSoft: 'rgba(247,144,9,.14)',
  warnFg: '#F2B15C',
  bad: '#F04438',
  badSoft: 'rgba(240,68,56,.14)',
  badFg: '#F58C84',
  star: '#FFB020',
};

export type MpColour = keyof typeof mpLight;

/**
 * The marketplace's two shadows — `--sh-card` under every store card and
 * `--sh-pop` under its sheets. Both go to `none` on dark, as the design says.
 */
export const mpShadowLight = {
  card: '0 1px 2px rgba(16,24,40,.05)',
  pop: '0 12px 20px -6px rgba(16,24,40,.12),0 4px 8px -4px rgba(16,24,40,.06)',
};

export const mpShadowDark: typeof mpShadowLight = {
  card: 'none',
  pop: '0 16px 28px -8px rgba(0,0,0,.55)',
};

export const mpShadowsFor = (scheme: 'light' | 'dark' | null | undefined): typeof mpShadowLight =>
  scheme === 'dark' ? mpShadowDark : mpShadowLight;

/** The palette for a scheme. `null` — a system with no preference — is light. */
export const mpPaletteFor = (scheme: 'light' | 'dark' | null | undefined): typeof mpLight =>
  scheme === 'dark' ? mpDark : mpLight;
