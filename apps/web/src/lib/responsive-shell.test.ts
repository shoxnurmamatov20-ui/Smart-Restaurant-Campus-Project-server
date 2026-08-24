import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * The two failures that make a page unusable on a phone, held shut.
 *
 * Both were real and both were silent — every screen still rendered, every test
 * still passed, and the product was broken on the device it was opened on.
 *
 *   **A hidden rail with nothing in its place.** `[data-nav] { display: none }`
 *   below 820px left the console reachable only by typing URLs. The restaurant
 *   console shipped that way once and the platform console shipped that way
 *   until it was found here.
 *
 *   **`vh` on a phone.** Mobile browsers measure `vh` against the viewport with
 *   the address bar collapsed, so `100vh` is taller than what the reader can
 *   see: a docked button — checkout, pay, confirm — sits under the bar for the
 *   whole first scroll. `dvh` is the same number on a desktop and the right one
 *   on a phone, so there is no case for `vh` in a class name.
 */
const SHELLS = {
  console: { css: join(process.cwd(), 'src/app/(dashboard)/app-shell.css'), rail: 'data-nav' },
  platform: {
    css: join(process.cwd(), '../admin/src/app/(admin)/admin-shell.css'),
    rail: 'data-nav',
  },
  /*
   * The seller panel's rail answers to its own attribute. It imports the
   * console's stylesheet, which collapses `[data-nav]` to a 76px icon rail —
   * and its rows are words with no icon behind them.
   */
  merchant: {
    css: join(process.cwd(), 'src/app/(merchant)/merchant-shell.css'),
    rail: 'data-mrail',
  },
} as const;

/** The block a phone reads, by the width both shells switch at. */
function phoneBlock(css: string): string {
  const start = css.indexOf('@media (max-width: 820px)');
  expect(start, 'a shell with no phone breakpoint has no phone layout').toBeGreaterThan(-1);

  let depth = 0;
  for (let i = css.indexOf('{', start); i < css.length; i += 1) {
    if (css[i] === '{') depth += 1;
    if (css[i] === '}') {
      depth -= 1;
      if (depth === 0) return css.slice(start, i + 1);
    }
  }

  throw new Error('unbalanced braces in the phone block');
}

describe.each(Object.entries(SHELLS))('%s shell', (name, shell) => {
  const css = readFileSync(shell.css, 'utf8');
  const phone = phoneBlock(css);
  const rail = shell.rail;

  it('turns the rail into a drawer rather than hiding it', () => {
    expect(phone).not.toMatch(new RegExp(`\\[${rail}\\]\\s*\\{[^}]*display:\\s*none`));
    expect(phone).toMatch(new RegExp(`\\[${rail}\\]\\s*\\{[^}]*position:\\s*fixed`));
    expect(phone).toMatch(
      new RegExp(`\\[${rail}\\]\\[data-open='true'\\]\\s*\\{[^}]*transform:\\s*translateX\\(0\\)`),
    );
  });

  /*
   * The seller panel takes the button from the console's stylesheet, which it
   * imports; the two consoles declare it themselves.
   */
  if (name !== 'merchant') {
    it('shows the button that opens it', () => {
      expect(phone).toMatch(/\[data-nav-open\]\s*\{\s*display:\s*grid/);
    });

    /*
     * Order, not merely presence. The base rule and the media query have the
     * same specificity, so a `display: none` written after the query wins at
     * every width and the drawer becomes an unopenable panel.
     */
    it('hides that button at wider widths, and says so first', () => {
      const base = css.search(/^\[data-nav-open\]\s*\{\s*\n\s*display:\s*none/m);
      expect(base, 'no base rule hiding the drawer button').toBeGreaterThan(-1);
      expect(base).toBeLessThan(css.indexOf('@media (max-width: 820px)'));
    });
  }
});

/* ------------------------------------------------------------------ */

const APPS = [join(process.cwd(), 'src/app'), join(process.cwd(), '../admin/src/app')];

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (full.endsWith('.tsx')) out.push(full);
  }

  return out;
}

/*
 * Only inside `className`, because the prose around these rules explains the
 * `vh`/`dvh` difference by name and a check that read the comments would
 * forbid the sentence that documents it.
 */
const CLASS_ATTRIBUTE = /className=(?:"[^"]*"|\{`[^`]*`\})/g;

describe('viewport height', () => {
  it('is dvh everywhere, never vh', () => {
    const offenders: string[] = [];

    for (const root of APPS) {
      for (const file of walk(root)) {
        for (const attribute of readFileSync(file, 'utf8').match(CLASS_ATTRIBUTE) ?? []) {
          if (/\b(?:min-)?h-screen\b|100vh/.test(attribute))
            offenders.push(`${file.slice(root.length + 1)} — ${attribute.slice(0, 60)}`);
        }
      }
    }

    expect(offenders).toEqual([]);
  });
});

/* ------------------------------------------------------------------ */

/*
 * `repeat(auto-fit, minmax(320px, 1fr))` is the most-repeated responsive defect
 * there is, and it is invisible on the machine it is written on: the track keeps
 * its 320px floor inside a 292px container, so the row hangs off the side of
 * every phone. `min(320px, 100%)` says what was meant — this wide, or the room
 * there is, whichever is less. Fifty-seven tracks were written the first way.
 */
describe('auto-fit grids', () => {
  it('floor at min(width, 100%), never at a bare pixel value', () => {
    const offenders: string[] = [];

    for (const root of APPS) {
      for (const file of walk(root)) {
        const source = readFileSync(file, 'utf8');
        for (const track of source.match(/repeat\(auto-fi(?:t|ll),\s*minmax\([^)]*\)/g) ?? []) {
          if (!/minmax\(min\(/.test(track))
            offenders.push(`${file.slice(root.length + 1)} — ${track}`);
        }
      }
    }

    expect(offenders).toEqual([]);
  });
});
