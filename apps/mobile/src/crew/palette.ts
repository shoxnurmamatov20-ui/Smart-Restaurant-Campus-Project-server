import { useColorScheme } from 'react-native';

/**
 * The two dark surfaces the staff design defines for itself.
 *
 * The hero card and the lock screen are dark in **both** themes — a revenue
 * figure and a notification stack read as objects rather than as page, and the
 * design draws them that way on a white background and on a black one.
 *
 * Their colours are declared inside `Smart Restaurant Xodimlar ilovasi.dc.html`
 * (`:root` at line 35, `[data-theme]` at 45 and 58–59) and **not** in
 * `packages/ui/src/styles/tokens.css`. So `src/theme.ts` cannot carry them: the
 * generator reads the token file, and a value that is not in it is not a token.
 *
 * Naming them once here is the alternative to a literal in nine panels. The rule
 * this bends — colour comes from `useTheme()` — exists so both appearances work,
 * and that is exactly what the second column below is for.
 */

export type CrewSkin = {
  /** The revenue card. */
  heroBg: string;
  heroFg: string;
  heroDim: string;
  heroLine: string;
  heroChip: string;
  /** The sparkline stroke — light blue on both, from the design. */
  heroSpark: string;
  /**
   * The delta chip's green, on the dark card only.
   *
   * `success-600` is drawn for a green figure on paper and is unreadable on
   * #0F1320; the design picks a mint for the one place a positive number sits on
   * a dark ground. It is the same in both appearances because the card is.
   */
  heroUp: string;
  /** The lock screen's vertical wash, top and bottom. */
  lockTop: string;
  lockBottom: string;
  lockFg: string;
  lockDim: string;
  lockCard: string;
  lockBorder: string;
};

const LIGHT: CrewSkin = {
  heroBg: '#0F1320',
  heroFg: '#FFFFFF',
  heroDim: 'rgba(255,255,255,.60)',
  heroLine: 'rgba(255,255,255,.13)',
  heroChip: 'rgba(255,255,255,.12)',
  heroSpark: '#8DBBF9',
  heroUp: '#7BE3AE',
  lockTop: '#1B2334',
  lockBottom: '#0F1320',
  lockFg: '#FFFFFF',
  lockDim: 'rgba(255,255,255,.62)',
  lockCard: 'rgba(255,255,255,.12)',
  lockBorder: 'rgba(255,255,255,.16)',
};

/*
 * Darker, not merely the same.
 *
 * A card that stays #0F1320 on a #0B0D14 page loses its edge and stops being a
 * card; the design lifts the hero to a navy and drops the lock screen further,
 * so both keep a boundary against the ground behind them.
 */
const DARK: CrewSkin = {
  ...LIGHT,
  heroBg: '#182545',
  lockTop: '#12161F',
  lockBottom: '#080A11',
  lockFg: '#EDF0F5',
  lockDim: 'rgba(237,240,245,.58)',
  lockCard: 'rgba(255,255,255,.08)',
  lockBorder: 'rgba(255,255,255,.11)',
};

/** The staff surface's own two dark skins, for the reader's appearance. */
export function useCrewSkin(): CrewSkin {
  return useColorScheme() === 'dark' ? DARK : LIGHT;
}
