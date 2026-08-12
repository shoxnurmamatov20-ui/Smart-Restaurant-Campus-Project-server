import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import * as ui from './index';

/**
 * The design system's own tests.
 *
 * These are not about how a button looks — that is a judgement, and the /design
 * gallery is where it gets made. They are about the two promises the system
 * makes to everything downstream, both of which fail silently when broken:
 *
 *   1. Every primitive in the folder is reachable from the barrel. A component
 *      that exists but is not exported is a component three apps cannot import
 *      and nobody notices until someone needs it.
 *
 *   2. No primitive names a colour directly. This is the whole reason the token
 *      layer exists: a new palette from design has to be a change to a dozen
 *      values in tokens.css, not a hunt through thirty components. One
 *      `text-white` slipped past — the destructive button and badge wore it
 *      while `--destructive-foreground` sat declared and unused — and that is
 *      exactly the failure this catches.
 */

const COMPONENTS_DIR = join(process.cwd(), 'src/components');

function componentFiles(): string[] {
  return readdirSync(COMPONENTS_DIR)
    .filter((name) => name.endsWith('.tsx'))
    .sort();
}

describe('the barrel', () => {
  it('re-exports every component file', () => {
    const barrel = readFileSync(join(process.cwd(), 'src/index.ts'), 'utf8');

    for (const file of componentFiles()) {
      const module = file.replace(/\.tsx$/, '');

      expect(barrel, `src/components/${file} is not exported from src/index.ts`).toContain(
        `./components/${module}`,
      );
    }
  });

  it('exports something for each of them', () => {
    // A barrel line that resolves to nothing would still satisfy the check
    // above; this makes sure the modules actually carry components.
    expect(Object.keys(ui).length).toBeGreaterThanOrEqual(componentFiles().length);
  });
});

describe('the token contract', () => {
  /**
   * Tailwind's built-in palette, plus the two absolutes. `bg-black/50` is
   * allowed on the modal scrims and only there: a scrim is meant to read as
   * the same darkening in both themes, so a theme-aware token would be wrong.
   */
  const RAW_COLOUR =
    /\b(?:bg|text|border|ring|divide|fill|stroke|from|via|to|outline|shadow|accent|caret|decoration)-(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|white|black)\b/g;

  const SCRIM_EXEMPT = new Set(['alert-dialog.tsx', 'dialog.tsx', 'sheet.tsx']);

  it.each(componentFiles())('%s references tokens, never a raw colour', (file) => {
    const source = readFileSync(join(COMPONENTS_DIR, file), 'utf8');
    const found = [...source.matchAll(RAW_COLOUR)].map((match) => match[0]);

    const offending = SCRIM_EXEMPT.has(file)
      ? found.filter((cls) => cls !== 'bg-black')
      : // The scrim exemption is deliberately narrow: everything else must go
        // through a semantic name so a palette change reaches it.
        found;

    expect(offending, `${file} hardcodes ${offending.join(', ')}`).toEqual([]);
  });

  it('keeps the destructive pair symmetric with the other intents', () => {
    // Every intent is a `bg-X` / `text-X-foreground` pair. Destructive used to
    // be the exception, which left --destructive-foreground dead.
    for (const file of ['button.tsx', 'badge.tsx']) {
      const source = readFileSync(join(COMPONENTS_DIR, file), 'utf8');

      expect(source, `${file} lost text-destructive-foreground`).toContain(
        'bg-destructive text-destructive-foreground',
      );
    }
  });
});
