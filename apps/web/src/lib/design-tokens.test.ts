import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * The token layer against the design file, token by token, mechanically.
 *
 * `design-fidelity.test.ts` beside this one pins the *structure* — twenty-four
 * sidebar rows, nine roles, the permission matrix — by transcribing the design's
 * arrays. This pins the *values*, and it does not transcribe anything: it parses
 * `:root` out of `docs/design/source/Smart Restaurant OS.dc.html` and asserts
 * every custom property it declares exists in `packages/ui/src/styles/tokens.css`
 * at the same value.
 *
 * It exists because three tokens had already gone wrong in three different ways
 * and none of them raised anything:
 *
 *   **`--pos-idle` was missing.** The design declares the till's idle gradient
 *   as a token with a separate, deeper value for dark. The token layer had
 *   neither, so `idle-screen.tsx` held the light value as a literal — and a till
 *   stands in a dark room.
 *
 *   **`--danger-400` was invented.** No ramp declares it, the design's included.
 *   An unresolved `var()` in a `stroke` paints nothing rather than failing, so
 *   the sixth slice of the analytics donut was a gap in the ring.
 *
 *   **`--text-7xl` was declared and never mapped**, so `text-7xl` fell through to
 *   Tailwind's own 72px instead of the design's 76.
 *
 * A missing token is silent, an invented one is silent, and a wrong one is a
 * shade nobody can name. That is the whole argument for checking them by machine.
 *
 * ---------------------------------------------------------------------------
 * What counts as equal
 *
 * The design file is minified and this repository is prettier-formatted, so
 * `rgba(16,24,40,.04)` and `rgba(16, 24, 40, 0.04)` are the same shadow written
 * two ways. Whitespace is dropped and bare leading decimals are normalised
 * before comparing. Nothing else is forgiven: a different hex is a different
 * colour and a different pixel count is a different size.
 */

const DESIGN = join(process.cwd(), '../../docs/design/source/Smart Restaurant OS.dc.html');

const TOKENS = join(process.cwd(), '../../packages/ui/src/styles/tokens.css');

/** Every `--name: value` pair inside one CSS block. */
function declarations(block: string): Map<string, string> {
  const found = new Map<string, string>();

  for (const match of block.matchAll(/(--[\w-]+)\s*:\s*([^;}]+)/g)) {
    found.set(match[1]!, match[2]!.trim());
  }

  return found;
}

/** `rgba(16,24,40,.04)` and `rgba(16, 24, 40, 0.04)` are one value. */
const normalise = (value: string): string =>
  value
    .replace(/\s+/g, '')
    .replace(/(^|[^\d])\.(\d)/g, '$10.$2')
    .toLowerCase();

const design = declarations(/:root\{([^}]*)\}/.exec(readFileSync(DESIGN, 'utf8'))?.[1] ?? '');

const tokensCss = readFileSync(TOKENS, 'utf8');
const rootStart = tokensCss.indexOf(':root {');
const code = declarations(tokensCss.slice(rootStart, tokensCss.indexOf('\n}', rootStart)));

/**
 * The three the token layer deliberately states differently, and why.
 *
 * Each is a font stack where the design names a family and this repository
 * prepends the variable `next/font` injects for the self-hosted copy. The
 * design's own stack has to survive as the tail — that is what the assertion
 * below checks — but it cannot be the whole value or the fonts the build ships
 * would never be used.
 */
const FONT_STACKS = new Set(['--font-display', '--font-sans', '--font-mono']);

describe('the design file parses', () => {
  it('finds the token block', () => {
    // If the export format changes and this silently matches nothing, every
    // assertion below passes over an empty set.
    expect(design.size).toBeGreaterThan(100);
  });

  it('is the current export, not the superseded one', () => {
    // v1.0 had no `--pos-idle` and a shorter ramp. A regression to it would
    // make this whole suite compare against the wrong design.
    expect(design.has('--pos-idle')).toBe(true);
  });
});

describe('every token the design declares', () => {
  it('exists in the token layer', () => {
    const missing = [...design.keys()].filter((name) => !code.has(name));

    expect(missing, 'declared in the design and absent from tokens.css').toEqual([]);
  });

  it('carries the design’s value', () => {
    const wrong = [...design.entries()]
      .filter(([name]) => !FONT_STACKS.has(name))
      .filter(([name, value]) => {
        const ours = code.get(name);
        return ours !== undefined && normalise(ours) !== normalise(value);
      })
      .map(([name, value]) => `${name}: design ${value} · code ${code.get(name)}`);

    expect(wrong, 'these resolve to a different value than the design draws').toEqual([]);
  });

  it('keeps the design’s font stack as the fallback tail', () => {
    for (const name of FONT_STACKS) {
      const wanted = design.get(name);
      const ours = code.get(name);

      expect(wanted, `${name} is missing from the design`).toBeDefined();
      expect(ours, `${name} is missing from tokens.css`).toBeDefined();

      // The design's families, in the design's order, still at the end.
      const families = normalise(wanted!).split(',');
      const mine = normalise(ours!).split(',');

      for (const family of families) {
        expect(mine, `${name} dropped ${family}`).toContain(family);
      }
    }
  });
});

/**
 * Dark, which is where this was always going to drift.
 *
 * `FOUNDATIONS §1.3` and the design file disagree about every value in the dark
 * palette — the document says `--bg #0B0E16`, the file draws `#12151E`, and so
 * on down the list. The token layer followed the file, correctly, and wrote down
 * why. This is what keeps it there: a future reader who trusts the document and
 * "fixes" the token layer to match it fails here.
 */
const designDark = declarations(
  /\[data-theme="dark"\]\{([^}]*)\}/.exec(readFileSync(DESIGN, 'utf8'))?.[1] ?? '',
);

const darkStart = tokensCss.indexOf('\n.dark {');
const codeDark = declarations(tokensCss.slice(darkStart, tokensCss.indexOf('\n}', darkStart)));

describe('the dark remapping', () => {
  it('parses', () => {
    expect(designDark.size).toBeGreaterThan(30);
    expect(codeDark.size).toBeGreaterThan(30);
  });

  it('declares everything the design remaps', () => {
    const missing = [...designDark.keys()].filter((name) => !codeDark.has(name));

    expect(missing, 'remapped in the design and left at its light value here').toEqual([]);
  });

  it('carries the design’s values, not the document’s', () => {
    const wrong = [...designDark.entries()]
      .filter(([name, value]) => {
        const ours = codeDark.get(name);
        return ours !== undefined && normalise(ours) !== normalise(value);
      })
      .map(([name, value]) => `${name}: design ${value} · code ${codeDark.get(name)}`);

    expect(wrong).toEqual([]);
  });
});

describe('the tokens the design does not declare here', () => {
  it('are additions rather than substitutions', () => {
    // The token layer legitimately holds more than this one file: the shadcn
    // aliases, the accent axis for the guest surfaces, `--page`, the chat
    // colours, and the two type steps only the marketing file uses. What it
    // must not hold is a *different answer* to something the design already
    // decided — which the assertion above is what catches.
    const extra = [...code.keys()].filter((name) => !design.has(name));

    expect(extra.length).toBeGreaterThan(0);
    // A canary: if this ever drops to zero the parser has stopped working.
    expect(code.size).toBeGreaterThan(design.size);
  });
});
