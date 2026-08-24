import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { ORDER_STATE_SPECS, isOrderState } from '@restaurant/i18n/order-state';

/**
 * Here rather than in `packages/i18n`, and the reason is the package's shape.
 *
 * `@restaurant/i18n` is pure TypeScript with no Node dependency — that is what
 * lets React Native import it unchanged (`apps/mobile/README.md` §3). Adding
 * `@types/node` to it so one test could open a file would spend that property
 * on a test. `apps/web` already reads the design file for
 * `design-tokens.test.ts`, so the pair sit together.
 */

/**
 * The tones, read out of the design rather than trusted.
 *
 * The design's `STATES` table gives every row a `bg` and a `dot`, and this
 * ladder's `tone` is the name for that pair. Transcribing thirteen colours by
 * hand is exactly the operation that produced three different amounts of amber
 * for `cooking` across three screens, so the table is parsed instead.
 */
describe('the state tones match the design file', () => {
  const DESIGN = join(process.cwd(), '../../docs/design/source/Smart Restaurant OS.dc.html');

  /** The design's `bg` token → the tone `StatusChip` knows it by. */
  const AS_TONE: Readonly<Record<string, string>> = {
    'var(--bg-muted)': 'neutral',
    'var(--brand-50)': 'brand',
    'var(--warning-50)': 'warning',
    'var(--success-50)': 'success',
    'var(--danger-50)': 'danger',
  };

  const table = (() => {
    const file = readFileSync(DESIGN, 'utf8');
    const start = file.indexOf('STATES = [');
    const block = file.slice(start, file.indexOf('\n  ];', start));
    const found = new Map<string, string>();

    for (const entry of block.split(/\{\s*k:/).slice(1)) {
      const key = /^\s*"(\w+)"/.exec(entry)?.[1];
      const bg = /bg:\s*"([^"]+)"/.exec(entry)?.[1];
      if (key !== undefined && bg !== undefined) found.set(key, bg);
    }

    return found;
  })();

  it('parses the design table', () => {
    // Twelve rows: the design has no `comped`, which DECISIONS Q8 adds here.
    expect(table.size).toBeGreaterThanOrEqual(12);
  });

  it('gives every state the design’s own tone', () => {
    const wrong: string[] = [];

    for (const [key, bg] of table) {
      if (!isOrderState(key)) continue;

      const wanted = AS_TONE[bg];
      const ours = ORDER_STATE_SPECS[key].tone;

      if (wanted !== undefined && wanted !== ours) {
        wrong.push(`${key}: design ${bg} (${wanted}) · code ${ours}`);
      }
    }

    expect(wrong).toEqual([]);
  });

  it('tones the one state the design does not draw', () => {
    // A comp is a decision somebody made and signed for, not a failure — amber
    // like `topay`, not red like `voided`.
    expect(table.has('comped')).toBe(false);
    expect(ORDER_STATE_SPECS.comped.tone).toBe('warning');
  });
});
