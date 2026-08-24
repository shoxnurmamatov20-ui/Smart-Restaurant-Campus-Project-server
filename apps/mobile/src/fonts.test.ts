import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { display, FACES, sans } from './fonts';
import { text } from './type';

/**
 * The app is set in the design's typefaces, and the test says so out loud.
 *
 * This is the defect that made the owner say the app "does not look like the
 * design at all", and it had two halves, both invisible to every other check in
 * the repository:
 *
 *   `family.display` and `family.sans` were `undefined`, so React Native drew
 *   San Francisco on iOS and Roboto on Android while every `.dc.html` in
 *   `docs/design/source` is set in Inter with Inter Tight on the headings.
 *   Different widths, different x-heights, different letterforms: every line
 *   broke at a different word than the design breaks it, and no correction to
 *   padding could have closed that.
 *
 *   `text.num` swapped the family to `monospace` for the 186 places that draw a
 *   figure — every price, every time, every count. The design asks for
 *   `font-variant-numeric:tabular-nums`, which is the tabular FIGURES of the
 *   same Inter, not a typewriter face. The bill and the cart were rendered in a
 *   typeface the design never mentions.
 *
 * Neither showed up in `tsc`, in the theme test or in a screenshot nobody took.
 */

const FONT_DIR = join(process.cwd(), 'assets/fonts');

/** Every file under a directory, recursively. */
function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);

    return entry.isDirectory() ? walk(path) : [path];
  });
}

describe('the design’s typefaces', () => {
  it('are bundled, as real TrueType files', () => {
    expect(FACES).toHaveLength(7);

    for (const face of FACES) {
      const path = join(FONT_DIR, face.file);

      expect(existsSync(path), `${face.file} is missing from assets/fonts`).toBe(true);

      // A 400-byte file is a failed download or an HTML error page renamed —
      // Metro would bundle it happily and the phone would fall back in silence.
      expect(statSync(path).size).toBeGreaterThan(100_000);

      // `\0\1\0\0` is the TrueType magic. A .ttf that is not one is the same
      // silent fallback with a longer story.
      const head = readFileSync(path).subarray(0, 4);

      expect([...head]).toEqual([0, 1, 0, 0]);
    }
  });

  it('ships the licence they are bundled under', () => {
    // SIL OFL 1.1 permits bundling and requires the licence to travel with the
    // files. It is four lines of work and the alternative is shipping somebody
    // else's typeface without its terms.
    const licence = readFileSync(join(FONT_DIR, 'OFL.txt'), 'utf8');

    expect(licence).toContain('SIL Open Font License');
  });

  it('names one family per weight, because Android resolves nothing else', () => {
    // On the web a family has four files and `font-weight:600` picks one. A
    // runtime-registered font on Android is one family under one name, and
    // `fontWeight` on top of it is ignored or synthesised into a smear — so the
    // weight has to be in the family name.
    expect(sans(400).fontFamily).toBe('Inter_400Regular');
    expect(sans(600).fontFamily).toBe('Inter_600SemiBold');
    expect(display(700).fontFamily).toBe('InterTight_700Bold');
    expect(display(800).fontFamily).toBe('InterTight_800ExtraBold');
  });

  it('draws headings in Inter Tight and copy in Inter', () => {
    expect(text.display.fontFamily).toContain('InterTight');
    expect(text.title.fontFamily).toContain('InterTight');

    expect(text.body.fontFamily).toContain('Inter_');
    expect(text.small.fontFamily).toContain('Inter_');
    expect(text.caption.fontFamily).toContain('Inter_');
    expect(text.caps.fontFamily).toContain('Inter_');
  });

  it('never sets a weight beside a family', () => {
    // Both together is a bold drawn on top of a bold: Android synthesises the
    // second one and the letterforms thicken unevenly.
    for (const [name, style] of Object.entries(text)) {
      expect(style, `text.${name} sets fontWeight beside a family`).not.toHaveProperty(
        'fontWeight',
      );
    }
  });

  it('is the only way a weight is set anywhere in the app', () => {
    /*
     * `fontWeight` beside a runtime-registered family does nothing on Android
     * and synthesises a second bold on iOS — and, worse, it reads as if it
     * works. 198 places set one before the faces were bundled, so every screen
     * carried a weight the platform quietly ignored while the design's own
     * semibold sat in a file nobody loaded.
     *
     * The rule is mechanical: ask for the face, never for the weight.
     */
    const files = [...walk(join(process.cwd(), 'app')), ...walk(join(process.cwd(), 'src'))].filter(
      (file) => file.endsWith('.tsx'),
    );

    // A real sweep, not an empty one: this app has dozens of screens and a
    // glob that silently matched nothing would pass forever.
    expect(files.length).toBeGreaterThan(30);

    const guilty = files.filter((file) => /fontWeight\s*:/.test(readFileSync(file, 'utf8')));

    expect(guilty.map((file) => file.replace(process.cwd() + '/', ''))).toEqual([]);
  });

  it('draws figures in the same typeface as the words beside them', () => {
    // `[data-num]{font-variant-numeric:tabular-nums}` — a feature of the face
    // in use, not a different face.
    expect(text.num).not.toHaveProperty('fontFamily');
    expect(text.num.fontVariant).toEqual(['tabular-nums']);
  });
});
