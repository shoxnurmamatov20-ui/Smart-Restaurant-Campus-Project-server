import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { STEP_META, STEP_TITLES } from './setup-copy';
import { STEPS } from './setup-data';

/**
 * The setup wizard, checked against `Smart Restaurant Sozlash.dc.html`.
 *
 * It was the one built surface whose design file no test read. The wizard is
 * eight steps with a minute estimate on each, and the sum of those minutes is
 * the promise on its first screen — "about thirty minutes" — so a step added or
 * an estimate changed on one side and not the other is a promise the product
 * then breaks in its first half hour with a restaurant.
 *
 * The file's `STEPS` array is parsed for its titles, its meta lines and its
 * `min:` values and compared to `setup-data.ts` and `setup-copy.ts`, in order.
 */

const FILE = join(process.cwd(), '../../docs/design/source/Smart Restaurant Sozlash.dc.html');
const available = existsSync(FILE);

if (!available) console.warn(`[setup-fidelity] SKIP — ${FILE} not found`);

type DesignStep = { title: string; meta: string; minutes: number };

function stepsInDesign(): DesignStep[] {
  const html = readFileSync(FILE, 'utf8');
  const start = html.indexOf('STEPS = [');
  const end = html.indexOf('];', start);
  const block = html.slice(start, end);

  return [
    ...block.matchAll(/\{ t: P\("([^"]+)",[^)]*\), m: P\("([^"]+)",[^)]*\), min: (\d+)/g),
  ].map((m) => ({ title: m[1]!, meta: m[2]!, minutes: Number(m[3]) }));
}

describe.skipIf(!available)('the wizard is the one the design draws', () => {
  const design = stepsInDesign();

  it('has eight steps in the file', () => {
    // A regex that matched nothing would make every assertion below vacuous.
    expect(design.length).toBe(8);
  });

  it('builds the same steps, in the same order', () => {
    expect(STEPS.length).toBe(design.length);

    STEPS.forEach((step, index) => {
      const drawn = design[index]!;

      expect(STEP_TITLES[step.id].uz, `step ${index + 1} title`).toBe(drawn.title);
      expect(STEP_META[step.id].uz, `step ${index + 1} meta`).toBe(drawn.meta);
      expect(step.minutes, `step ${index + 1} (${step.id}) minutes`).toBe(drawn.minutes);
    });
  });

  it('keeps the half-hour promise', () => {
    const total = design.reduce((sum, step) => sum + step.minutes, 0);

    expect(STEPS.reduce((sum, step) => sum + step.minutes, 0)).toBe(total);
    // "About thirty minutes" is what the first screen says.
    expect(total).toBeGreaterThanOrEqual(25);
    expect(total).toBeLessThanOrEqual(35);
  });

  it('lets exactly the two people-and-hardware steps be deferred', () => {
    // The design marks crew and devices as "keyin" — a restaurant can open its
    // till before it has enrolled every waiter's phone. The other six cannot be
    // skipped because the till does not work without them.
    expect(STEPS.filter((step) => step.deferrable).map((step) => step.id)).toEqual([
      'crew',
      'devices',
    ]);
  });
});
