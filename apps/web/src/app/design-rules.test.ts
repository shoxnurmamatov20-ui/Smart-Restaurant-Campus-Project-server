import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Two rules the design states once and every screen has to keep.
 *
 * Both were broken across the whole app and both are invisible in review: a
 * button with no handler renders perfectly, and an emoji is a picture somebody
 * chose on purpose. They are checked by machine here because the only other way
 * to catch them is to press every control on ninety-eight screens.
 *
 * `guest-fidelity.test.ts` already asserted the emoji rule — for one file. This
 * is the same rule over the whole tree, which is where it was actually being
 * broken.
 */

const ROOT = join(process.cwd(), 'src');

/** Every `.tsx` under `src`, tests excluded. */
function sources(dir: string, found: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);

    if (statSync(path).isDirectory()) {
      sources(path, found);
      continue;
    }

    if (entry.endsWith('.tsx') && !entry.includes('.test.')) found.push(path);
  }

  return found;
}

/**
 * Comments out, so a note *about* a removed emoji does not read as one.
 *
 * Several files carry exactly that — "the empty state had a 📝 here and the
 * design has none" — and a check that flagged them would push the next reader
 * to delete the explanation rather than keep the rule.
 */
const withoutComments = (source: string): string =>
  source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

const FILES = sources(ROOT).map((path) => ({
  path: path.slice(process.cwd().length + 1),
  code: withoutComments(readFileSync(path, 'utf8')),
}));

describe('the tree is big enough to be worth checking', () => {
  it('found the screens', () => {
    // A glob that silently matched nothing would make everything below pass.
    expect(FILES.length).toBeGreaterThan(150);
  });
});

describe('no emoji outside the Telegram surface', () => {
  /*
   * `FOUNDATIONS §8`: "No emoji in product UI. Emoji are permitted **only** in
   * the Telegram bot, for status glyphs, because Telegram conventions require
   * them." A read of all fourteen design files finds them in exactly one — the
   * Telegram file — so the rule and the design agree.
   *
   * The marketplace had twelve, one per cuisine circle, and they had cost more
   * than the rule: an emoji set has no plov, no somsa, no manti and no
   * choyxona, so the categories had been swapped for the ones the keyboard does
   * have. An Uzbek marketplace lost the four things people order.
   */
  /*
   * Pictographs and the variation selector, and deliberately not the dingbat
   * block. `✓`, `✕` and `★` live at U+27xx and the design uses all three as
   * *type* — a tick in a comparison table, a close control, a rating glyph —
   * which is why `FOUNDATIONS §8` bans emoji rather than banning symbols. What
   * it is after is a picture: something that renders as a different drawing on
   * every platform. `\uFE0F` is included because it is what turns one of those
   * dingbats into exactly that.
   */
  const EMOJI = /[\u{1F300}-\u{1FAFF}\u{FE0F}]/u;

  it('holds', () => {
    const offenders = FILES.filter((file) => !file.path.includes('(telegram)'))
      .filter((file) => EMOJI.test(file.code))
      .map((file) => {
        const line = file.code.split('\n').findIndex((text) => EMOJI.test(text)) + 1;
        return `${file.path}:${line}`;
      });

    expect(offenders, 'FOUNDATIONS §8 — emoji are the Telegram bot’s alone').toEqual([]);
  });
});

describe('no button without a handler', () => {
  /*
   * `START-HERE §7` certifies the design has zero of these, and a re-count over
   * the fourteen files confirms it. The build had sixty — forty-nine of them in
   * the console — and forty-three carried no TODO, so there was nothing to grep
   * for either.
   *
   * A control that absorbs a tap and does nothing is worse than one that is
   * missing: the reader concludes the product is broken rather than unfinished.
   * Where an endpoint genuinely does not exist yet, `PendingAction` says so, and
   * where a screen means "not yet", `disabled` says that.
   */
  const handled = (attrs: string): boolean =>
    /onClick|onPointerDown|onMouseDown|type="submit"|type=\{|asChild|\{\.\.\./.test(attrs) ||
    /\bdisabled\b(?!=\{)/.test(attrs);

  /**
   * The attributes of one `<button …>`, read by scanning rather than by regex.
   *
   * A regex cannot do this: `onClick={() => close()}` contains `=>`, and any
   * pattern that stops at the first `>` ends the tag in the middle of the very
   * handler it is looking for — so every handled button is reported as
   * unhandled. Braces are counted instead, and the tag ends at the first `>`
   * outside a JSX expression.
   *
   * `null` when the tag never closes: the file did not parse the way this
   * expects and should not be judged on it.
   */
  function attributesAt(code: string, start: number): string | null {
    let depth = 0;

    for (let at = start; at < code.length; at += 1) {
      const char = code[at];

      if (char === '{') depth += 1;
      else if (char === '}') depth -= 1;
      else if (char === '>' && depth === 0) return code.slice(start, at);
    }

    return null;
  }

  it('holds', () => {
    const offenders: string[] = [];

    for (const file of FILES) {
      for (const match of file.code.matchAll(/<button\b/g)) {
        const attrs = attributesAt(file.code, (match.index ?? 0) + '<button'.length);

        if (attrs === null || handled(attrs)) continue;

        offenders.push(`${file.path}:${file.code.slice(0, match.index).split('\n').length}`);
      }
    }

    expect(offenders, 'give it an onClick, a PendingAction, or `disabled` with a reason').toEqual(
      [],
    );
  });
});

describe('nothing sits under the home indicator', () => {
  /*
   * The five phone surfaces are the ones a person only ever opens on a phone,
   * and every modern iPhone reserves the bottom ~34px for the home indicator.
   * An element pinned to `bottom-0` renders correctly in a desktop browser, in
   * every screenshot, and in the design file — and on the actual device its
   * contents sit in that strip, greyed by the indicator drawn over them.
   *
   * Three of the six docks had this: the marketplace's four tabs, the Telegram
   * mini app's four, and the pill the guest menu floats over the fold — which
   * is the single control on the single surface that has no desktop version at
   * all. The customer dock had always handled it, which is why nothing looked
   * wrong in review: the surface people checked was the one that was right.
   *
   * `viewportFit: 'cover'` in the root layout is what makes `env()` return a
   * real number rather than zero; `pwa-manifests.test.ts` holds that end.
   */
  const PHONE = ['(customer)', '(staff)', '(marketplace)', '(guest)', '(telegram)', '(merchant)'];

  it('holds', () => {
    const offenders = FILES.filter((file) => PHONE.some((group) => file.path.includes(group)))
      // Pinned to the bottom of the viewport. A `bottom-0` inside a relatively
      // positioned card is a different thing and is not this rule's business.
      .filter((file) =>
        /(?:fixed|sticky)[^"'`]*\bbottom-0\b|\bbottom-0\b[^"'`]*(?:fixed|sticky)/.test(file.code),
      )
      .filter((file) => !file.code.includes('safe-area-inset-bottom'))
      .map((file) => file.path);

    expect(offenders, 'pad with env(safe-area-inset-bottom, 0px)').toEqual([]);
  });
});
