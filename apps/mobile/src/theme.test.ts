import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { dark, light, size } from './theme';

/**
 * `theme.ts` still says what `tokens.css` says.
 *
 * The file is generated, and a generated file is only a single source of truth
 * for as long as somebody re-runs the generator. Nothing forces that: a designer
 * changes `--brand-500` in `packages/ui/src/styles/tokens.css`, the web build
 * follows on the next render, and the phone keeps shipping last month's blue
 * until a person notices — which, for a colour, means never.
 *
 * So the test regenerates into memory and compares. It fails with "run
 * `pnpm theme`", which is the whole fix.
 */

const HERE = join(process.cwd(), 'src');

describe('the generated theme', () => {
  /**
   * Dark is the phone's dark, not the console's.
   *
   * `tokens.css` carries the console's dark block — `--bg:#12151E`,
   * `--surface:#161A24`, and a `--brand-500` shifted to #3b82f6. The two
   * restaurant phone design files agree on a different one, and the phone is
   * what this app draws. Generated from `tokens.css` alone, every dark screen
   * in the app was the desktop console's dark mode: thirteen tokens out, on
   * every card, border and line of text.
   */
  it('takes its dark palette from the phone design files', () => {
    const html = readFileSync(
      join(process.cwd(), '../../docs/design/source/Smart Restaurant Mijoz ilovasi.dc.html'),
      'utf8',
    );
    const at = html.indexOf('[data-theme="dark"]');
    const block = html.slice(html.indexOf('{', at) + 1, html.indexOf('}', at));
    const want: Record<string, string> = Object.fromEntries(
      [...block.matchAll(/--([\w-]+)\s*:\s*([^;]+);/g)].map((m) => [m[1]!, m[2]!.trim()]),
    );

    const camel = (name: string) =>
      name
        .split('-')
        .map((part, index) =>
          index === 0 || /^\d/.test(part) ? part : (part[0] ?? '').toUpperCase() + part.slice(1),
        )
        .join('');

    let checked = 0;

    for (const [name, value] of Object.entries(want)) {
      if (!value.startsWith('#')) continue;

      const key = camel(name) as keyof typeof dark;

      expect(dark[key]?.toLowerCase(), `--${name} in dark`).toBe(value.toLowerCase());
      checked += 1;
    }

    // The design remaps thirteen colours for dark. A run that checked none
    // would pass on an empty regex, which is the way this kind of test dies.
    expect(checked).toBe(13);
  });

  /**
   * And it leaves alone what the phone leaves alone.
   *
   * The console's dark block moves `--n-0` to the page ground and `--brand-500`
   * to a lighter blue. Neither happens in the phone design, so a white label on
   * a brand button stays white and the blue stays the one every other surface
   * uses.
   */
  it('keeps the neutral ramp and the brand where the phone design keeps them', () => {
    expect(dark.n0).toBe(light.n0);
    expect(dark.n900).toBe(light.n900);
    expect(dark.brand500).toBe(light.brand500);
  });

  it('matches tokens.css', () => {
    const fresh = execFileSync(
      'node',
      [join(process.cwd(), 'scripts/build-theme.mjs'), '--stdout'],
      {
        encoding: 'utf8',
        env: { ...process.env, THEME_STDOUT: '1' },
      },
    );

    expect(fresh.trim(), 'tokens.css has moved — run `pnpm theme` in apps/mobile').toBe(
      readFileSync(join(HERE, 'theme.ts'), 'utf8').trim(),
    );
  });
});

describe('both themes are usable', () => {
  it('have exactly the same keys', () => {
    // A colour that exists in one theme only renders `undefined` in the other,
    // which React Native draws as nothing rather than as an error.
    expect(Object.keys(dark).sort()).toEqual(Object.keys(light).sort());
  });

  it('carry no CSS strings', () => {
    for (const [name, value] of Object.entries(light)) {
      expect(value, `${name} is not a literal colour`).toMatch(/^(#|rgb|hsl)/);
    }
  });

  it('give sizes as numbers', () => {
    // `fontSize: "20px"` is ignored on Android and throws on iOS.
    for (const [name, value] of Object.entries(size)) {
      expect(typeof value, `${name} is ${typeof value}`).toBe('number');
    }
  });

  it('remap colour between themes rather than keeping one palette', () => {
    // If this ever passes trivially the generator has stopped reading the dark
    // block, and every dark screen would silently be a light one.
    const different = Object.keys(light).filter(
      (name) => light[name as keyof typeof light] !== dark[name as keyof typeof dark],
    );

    expect(different.length).toBeGreaterThan(20);
  });
});
