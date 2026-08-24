import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Appearance, useColorScheme } from 'react-native';

import { KEYS, read, write } from './storage';

import { mpPaletteFor, mpShadowsFor, type mpLight, type mpShadowLight } from '../mp-theme';
import { paletteFor, shadowsFor, type light, type shadowLight } from '../theme';

/**
 * The palette, resolved from the person's choice or the system, and read by
 * every screen.
 *
 * The web build stamps `data-theme` on the root and lets the cascade do the
 * rest. There is no cascade here, so the resolved palette travels by context —
 * which is also the one place a later "always dark for the kitchen" toggle would
 * go, because that is the only screen the design keeps dark regardless.
 */
export type Palette = typeof light;

/**
 * The marketplace's palette, which is a different one.
 *
 * MyPOS is a second product in the same binary: a grey page under white cards,
 * its own status tones and a brand that lightens on dark — see
 * `scripts/build-theme.mjs`. Its screens read this instead, and the two never
 * mix: a marketplace card drawn on the restaurant's white ground stops being a
 * card, which is what every screen under `app/(marketplace)` was doing.
 */
export type MpPalette = typeof mpLight;

/**
 * Elevation, which the design turns off in dark.
 *
 * Its own context rather than a key on the palette: a shadow is a string for
 * `boxShadow`, the palette is colours, and folding one into the other means
 * every screen that spreads the palette also spreads a shadow it did not ask
 * for.
 */
export type Shadows = typeof shadowLight;

/** The marketplace's own two — `--sh-card` and `--sh-pop`. */
export type MpShadows = typeof mpShadowLight;

const ThemeContext = createContext<Palette>(paletteFor(null));
const MpThemeContext = createContext<MpPalette>(mpPaletteFor(null));
const ShadowContext = createContext<Shadows>(shadowsFor(null));
const MpShadowContext = createContext<MpShadows>(mpShadowsFor(null));

/**
 * Light, dark, or whatever the phone says — and remembered.
 *
 * The profile screen already offered the choice, through
 * `Appearance.setColorScheme()`, and lost it on every cold start: RN's override
 * lives for the run of the process and nothing wrote it down. The choice is a
 * setting, so it is stored beside the language and re-applied on launch.
 *
 * `'system'` sets the override back to `null` rather than storing a third
 * palette, which is the same shape the web uses: there, "system" *removes*
 * `data-theme` so `prefers-color-scheme` answers again.
 */
export type ThemeChoice = 'system' | 'light' | 'dark';

const isChoice = (value: unknown): value is ThemeChoice =>
  value === 'system' || value === 'light' || value === 'dark';

function apply(choice: ThemeChoice): void {
  /* `'unspecified'` and not `null`: RN 0.86 spells "no override" as a third
     member of `ColorSchemeName`, which is also why `ThemeProvider` below has to
     treat it as light. `null` is the older API and does not type-check here. */
  Appearance.setColorScheme(choice === 'system' ? 'unspecified' : choice);
}

const ChoiceContext = createContext<{
  choice: ThemeChoice;
  setChoice: (next: ThemeChoice) => void;
}>({ choice: 'system', setChoice: () => undefined });

export function ThemeProvider({ children }: { children: ReactNode }) {
  const scheme = useColorScheme();
  const [choice, setChoiceState] = useState<ThemeChoice>('system');

  useEffect(() => {
    let live = true;

    /* A stored choice beats the phone — it is what the person tapped, and on a
       cold start nothing else has said anything yet. */
    read(KEYS.theme).then((stored) => {
      if (!live || !isChoice(stored)) return;

      setChoiceState(stored);
      apply(stored);
    });

    return () => {
      live = false;
    };
  }, []);

  const choiceValue = useMemo(
    () => ({
      choice,
      setChoice: (next: ThemeChoice) => {
        setChoiceState(next);
        apply(next);
        void write(KEYS.theme, next);
      },
    }),
    [choice],
  );

  /*
   * RN 0.86 adds `'unspecified'` to `ColorSchemeName` — a system that has not
   * said. It reads as light, the same answer `paletteFor(null)` gives, so the
   * two unknowns resolve the same way rather than one of them throwing.
   */
  const resolved = scheme === 'dark' ? 'dark' : 'light';
  const palette = paletteFor(resolved);
  const mp = mpPaletteFor(resolved);
  const shadow = shadowsFor(resolved);

  return (
    <ChoiceContext.Provider value={choiceValue}>
      <ThemeContext.Provider value={palette}>
        <MpThemeContext.Provider value={mp}>
          <ShadowContext.Provider value={shadow}>
            <MpShadowContext.Provider value={mpShadowsFor(resolved)}>
              {children}
            </MpShadowContext.Provider>
          </ShadowContext.Provider>
        </MpThemeContext.Provider>
      </ThemeContext.Provider>
    </ChoiceContext.Provider>
  );
}

/** `const { choice, setChoice } = useThemeChoice()` — for the settings row. */
export const useThemeChoice = () => useContext(ChoiceContext);

/** `const c = useTheme(); … color: c.fgMuted`. */
export const useTheme = (): Palette => useContext(ThemeContext);

/** The same, for the marketplace surface only. `const c = useMpTheme()`. */
export const useMpTheme = (): MpPalette => useContext(MpThemeContext);

/** `const sh = useShadows(); … style={{ boxShadow: sh.xl }}`. */
export const useShadows = (): Shadows => useContext(ShadowContext);

/** The same, for the marketplace surface only. */
export const useMpShadows = (): MpShadows => useContext(MpShadowContext);
