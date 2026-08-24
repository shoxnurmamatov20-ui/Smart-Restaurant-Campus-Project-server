import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { size } from './theme';
import { text } from './type';

/**
 * The measurements the design fixes, and the two the app kept getting wrong.
 *
 * `design-fidelity.test.ts` asks whether every screen the design declares has a
 * file. This asks whether what those files draw is the size the design drew it.
 * The audit that produced this work found 540 divergences across four surfaces,
 * and almost all of them were one of two habits:
 *
 *   A rounded step off a spacing scale where the design writes a literal — 20
 *   for 18, 16 for 13, 14 for 16. Those are per-screen and the screens carry
 *   the design's numbers now; a test cannot check every one without becoming a
 *   second copy of the design.
 *
 *   Two rules applied everywhere, which a test CAN check, and which were wrong
 *   everywhere at once. They are below.
 */

const ROOTS = ['app', 'src'].map((dir) => join(process.cwd(), dir));

function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);

    return entry.isDirectory() ? walk(path) : [path];
  });
}

const SCREENS = ROOTS.flatMap(walk).filter(
  (file) => file.endsWith('.tsx') && !file.endsWith('.test.tsx'),
);

const relative = (file: string) => file.replace(process.cwd() + '/', '');

/**
 * The file's code, without its comments.
 *
 * Both rules below are string scans, and both are explained in comments that
 * quote the very thing they forbid — a rule that forbids writing down its own
 * reason is a rule that erases it.
 */
const code = (file: string) =>
  readFileSync(file, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');

describe('what every screen inherits', () => {
  it('sweeps a real number of files', () => {
    // A glob that matched nothing would pass both rules below forever.
    expect(SCREENS.length).toBeGreaterThan(30);
  });

  it('draws a rule at one point, never at a hairline', () => {
    /*
     * `StyleSheet.hairlineWidth` is 0.5 at @2x and 0.33 at @3x — on the phones
     * this app runs on, a third of the weight the design draws. The design
     * writes `border:1px solid var(--border)` on every card, every divider and
     * every field, 200-odd times across the four files, and never once writes a
     * sub-pixel rule. 76 places here did, so every outline in the app was
     * lighter than the drawing and the cards read as flat panels.
     */
    const guilty = SCREENS.filter((file) => code(file).includes('hairlineWidth')).map(relative);

    expect(guilty).toEqual([]);
  });

  it('answers a press by scaling, not by fading', () => {
    /*
     * `[data-press]:active{transform:scale(.97)}` — the design's own rule, in
     * every one of the four files. The app faded to `opacity:.72`, which is a
     * different gesture: a fade reads as "disabled for a moment", a scale reads
     * as "pressed". `PRESSED` in `ui/primitives.tsx` is the one definition.
     *
     * Matched on the style key rather than on the word `opacity`, which has
     * honest uses — a sold-out row is genuinely dimmed, and so is a disabled
     * button.
     */
    const guilty = SCREENS.filter((file) => /\bpressed\s*:\s*\{[^}]*opacity/.test(code(file))).map(
      relative,
    );

    expect(guilty).toEqual([]);
  });
});

describe('the type scale', () => {
  /**
   * The steps the design's `:root` declares, and the presets bound to them.
   *
   * `--text-2xs` is the single most-used step on the phone — 144 uses across
   * the four files — and there was no preset for it at all, so every one of
   * those lines was drawn at 12 (`caption`) or 10 (`caps`). The other two here
   * are the ones a screen heading and a page heading are told apart by.
   */
  it('binds the design’s steps to the presets that use them', () => {
    expect(text.label.fontSize).toBe(size.text2xs);
    expect(text.caption.fontSize).toBe(size.textXs);
    expect(text.small.fontSize).toBe(size.textSm);
    expect(text.body.fontSize).toBe(size.textMd);
    expect(text.title.fontSize).toBe(size.textXl);
    expect(text.screenTitle.fontSize).toBe(size.text2xl);
    expect(text.display.fontSize).toBe(size.text3xl);
  });

  it('leaves the dock’s label in sentence case', () => {
    // Both docks draw `font-size:10px;font-weight:600` with no
    // `text-transform`. `caps` — the only other 10px preset — forces uppercase,
    // so "Menyu" was rendering as "MENYU" in every tab bar in the app.
    expect(text.tab).not.toHaveProperty('textTransform');
    expect(text.caps.textTransform).toBe('uppercase');
  });
});
