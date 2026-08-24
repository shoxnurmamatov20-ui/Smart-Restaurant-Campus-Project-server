import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * The public site's header, at the two widths it used to fail at.
 *
 * Both failures were found by measuring in a real browser and both are the
 * kind a unit test cannot measure — so this locks the two decisions that fixed
 * them rather than the pixels: the words stay at every width, and a link
 * label may never break.
 */
const here = path.dirname(new URL(import.meta.url).pathname);
const chrome = readFileSync(path.join(here, 'site-chrome.tsx'), 'utf8');
const css = readFileSync(path.join(here, 'marketing.css'), 'utf8');

const header = chrome.slice(chrome.indexOf('<header'), chrome.indexOf('</header>'));

/**
 * Every `@media (max-width: <width>)` body in `marketing.css`, joined, with
 * comments stripped.
 *
 * Both halves of that matter. *Every* block, because a width may be declared
 * more than once and a test that reads only the first one silently stops
 * checking the rest. *Comments stripped*, because these assertions are about
 * what the stylesheet does, and the prose in this file names the selectors it
 * is explaining — `not.toContain('[data-wordmark]')` matched a sentence that
 * said the wordmark is deliberately not the thing being targeted here.
 */
function mediaBlock(width: string): string {
  const needle = `@media (max-width: ${width})`;
  const bodies: string[] = [];

  for (let at = css.indexOf(needle); at >= 0; at = css.indexOf(needle, at + 1)) {
    const open = css.indexOf('{', at);
    let depth = 0;
    for (let i = open; i < css.length; i++) {
      if (css[i] === '{') depth++;
      else if (css[i] === '}' && --depth === 0) {
        bodies.push(css.slice(open + 1, i));
        break;
      }
    }
  }

  if (!bodies.length) throw new Error(`no ${needle} in marketing.css`);

  return bodies.join('\n').replace(/\/\*[\s\S]*?\*\//g, '');
}

describe('the header brand', () => {
  it('is the words, not a two-letter square', () => {
    // The footer keeps its `SR` lockup; the bar does not. The owner's call —
    // on a phone the square used to be the whole brand.
    expect(header).not.toMatch(/>\s*SR\s*</);
    expect(header).toContain('data-wordmark');
    expect(header).toContain('Smart Restaurant');
  });

  it('stays visible at every width', () => {
    // It was `display: none` below 600px. Now it stacks into a two-line
    // lockup instead; no rule may hide it.
    const hides = /\[data-wordmark[^\]]*\]\s*\{[^}]*display:\s*none/;
    expect(css).not.toMatch(hides);
    expect(css).toContain('[data-wordmark-name]');
    expect(css).toContain('[data-wordmark-tail]');
  });
});

describe('the link row', () => {
  it('never breaks a label across lines', () => {
    // "Kim uchun" was on two lines in the middle of a desktop bar because the
    // row was over its wrap and a bare text link may shrink. `nowrap` is the
    // design's own rule (`dc.html:100`) and `flex-none` is what stops flex
    // from trying.
    const link = header.slice(header.indexOf('data-navlink'), header.indexOf('data-underline'));
    expect(link).toContain('whitespace-nowrap');
    expect(link).toContain('flex-none');
  });

  it('marks the current page', () => {
    expect(header).toContain("aria-current={on ? 'page' : undefined}");
    expect(css).toMatch(
      /\[data-navlink\]\[data-on='1'\]\s*\[data-underline\]\s*\{[^}]*opacity:\s*1/,
    );
  });

  it('keeps a language control and the day/night glyph in the bar at every width', () => {
    /*
     * This has been rewritten twice, and both rewrites were the owner reading
     * the built page rather than the plan.
     *
     * It first locked the opposite rule — both controls left the bar at 720
     * and were drawn again inside the sheet. Then it locked a two-row bar,
     * which is where they went when the owner asked for them to stay visible.
     * A preference that drops below the line it belongs on reads as something
     * that fell off, so now it is one row at every width, and the language
     * changes shape rather than place: three segments above 500, one chip that
     * opens below it. Measured, the pill needs 460px and no phone is that wide.
     *
     * What is locked is the contract, not the pixels: a language control and
     * the glyph are in the bar at every width, exactly one language form is
     * drawn at a time, neither is pushed into the sheet, and the bar never
     * wraps.
     */
    const hiddenSomewhere = (attr: string) =>
      new RegExp(`\\[data-${attr}\\][^{}]*\\{[^}]*display:\\s*none`);

    expect(css).not.toMatch(hiddenSomewhere('themepill'));
    expect(chrome).toContain('data-langpill');
    expect(chrome).toContain('data-langchip');

    // The chip is off by default and the pill stands; below 500 they swap, so
    // that one query has to name both or a width is left with neither.
    expect(css).toMatch(/\[data-langchip\]\s*\{\s*display:\s*none/);
    expect(mediaBlock('499px')).toContain('[data-langchip]');
    expect(mediaBlock('499px')).toContain('[data-langpill]');

    // Not in the sheet, and not on a second line.
    expect(chrome).not.toContain('data-prefsheet');
    expect(css).not.toMatch(/\[data-navbar\][^{}]*\{[^}]*flex-wrap/);
  });
});
