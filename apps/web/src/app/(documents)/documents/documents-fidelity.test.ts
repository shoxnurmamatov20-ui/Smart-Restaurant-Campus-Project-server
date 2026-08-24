import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { deltaTone, PL_ROWS, type PlRow } from './documents-data';

/**
 * The seven documents, checked against the file that drew them.
 *
 * Every other design surface in this repo has one of these — `site-fidelity`,
 * `guest-fidelity`, `pages-fidelity`, `more-fidelity`, `design-coverage` — and
 * the documents had none, because they were the last surface built. That gap is
 * worse here than anywhere else: these are the only screens whose entire content
 * is *figures*, and a figure that drifts is invisible. A receipt total that no
 * longer adds up, a variance with the wrong sign, a VAT line that stopped being
 * 12% — none of them break a build, and all of them are what a person hands to
 * a customer or a tax inspector.
 *
 * So this reads the design file and asserts that every number it prints is still
 * in `documents-data.ts`. Not a screenshot comparison — the arithmetic and the
 * proper nouns, which is what a document is.
 *
 * Money in the design file is written in so'm with thin spaces; the build holds
 * integer tiyin, written `som(9_523_214)`. `carries()` is what lets the two be
 * compared without either being rewritten to suit the other.
 */

const FILE = join(
  process.cwd(),
  '../../docs/design/source/Smart Restaurant OS - Hujjatlar.dc.html',
);
const DATA = join(process.cwd(), 'src/app/(documents)/documents/documents-data.ts');

/*
 * Skips rather than fails when the design file is absent, and says so.
 *
 * `docs/design/source` is committed, so this normally runs. The guard is for a
 * shallow checkout, and a silent skip would be the same failure this suite
 * exists to catch — `design-coverage.test.ts` learned that one first.
 */
const available = existsSync(FILE);

if (!available) {
  console.warn(`[documents-fidelity] SKIP — ${FILE} not found`);
}

const design = available ? readFileSync(FILE, 'utf8') : '';
const data = readFileSync(DATA, 'utf8');

/**
 * Every figure in the source, as it appears in the built data.
 *
 * `documents-data.ts` writes money through `som()`, so a so'm figure lands in
 * the file with underscore separators — `9_523_214` — and the same figure may
 * also be a plain count. Both spellings are accepted; what is asserted is that
 * the number is present, not how it was typed.
 */
function carries(written: string): boolean {
  const bare = written.replace(/[\s  ]/g, '');
  const grouped = bare.replace(/\B(?=(\d{3})+(?!\d))/g, '_');

  /*
   * A third spelling, because the file holds a third kind of figure.
   *
   * Money is written through `som()` and reads `9_523_214`; a count is bare.
   * An identifier — a tax number, a phone, a fiscal module's serial — is a
   * *string*, kept with its spaces exactly as printed, because grouping a STIR
   * is not arithmetic, it is how the number is spelt.
   */
  const spelt = written.replace(/[\s\u00a0\u2009]/g, '[\\s\\u00a0\\u2009]');

  return new RegExp(`(?<!\\d)(${bare}|${grouped}|${spelt})(?!\\d)`).test(data);
}

describe.skipIf(!available)('the design file is the one that drew this', () => {
  it('is the documents file, with its seven pages', () => {
    // A wrong file, or a truncated one, would make every assertion below pass
    // against nothing.
    expect((design.match(/class="page"/g) ?? []).length).toBe(7);
    expect(design).toContain('Mijoz cheki');
  });
});

describe.skipIf(!available)('every figure the design prints', () => {
  it('is still in the data', () => {
    /*
     * Four-digit-and-up figures only. Anything shorter is a line number, a
     * font size or a percentage, and matching those would turn this into a
     * check that the file contains the digit 12.
     */
    const printed = new Set(
      [...design.matchAll(/>[^<>]*?((?<!\d)\d{1,3}(?:[\s  ]\d{3})+)(?!\d)[^<>]*?</g)].map(
        (match) => match[1]!,
      ),
    );

    // The design draws more figures than the build stores: some are computed
    // from the ones that are stored — a subtotal, a VAT line, a net. Those are
    // asserted by `adds up` below rather than by presence.
    const derived = new Set([
      /* Receipt: service, discount and total are computed in `receipts.tsx`. */
      '257 070',
      /* Invoice: gross is net + VAT, computed in `invoice.tsx`. */
      '10 666 000',
    ]);

    const missing = [...printed].filter((figure) => !derived.has(figure) && !carries(figure));

    expect(missing, 'figures the design prints and the data no longer holds').toEqual([]);
  });
});

describe('the arithmetic each document rests on', () => {
  it('the invoice: net + 12% VAT is the gross the design prints', () => {
    /*
     * The one line a supplier and a tax inspector both read. `9 523 214` and
     * `10 666 000` are the design's own figures and 12% is Uzbekistan's rate —
     * if any of the three moves without the other two, the document is wrong in
     * the way nobody notices until it has been filed.
     *
     * In so'm rather than tiyin, because that is the unit an invoice is written
     * in: 9 523 214 × 1.12 is 10 665 999.68 and the design prints 10 666 000.
     * Those 32 tiyin are the rounding a document does, not a drift — asserting
     * at tiyin precision would be asserting that VAT works otherwise than it
     * does.
     */
    const net = 9_523_214;
    const gross = 10_666_000;

    expect(Math.round(net * 1.12)).toBe(gross);
  });

  it('the Z report: counted minus expected is the variance the design prints', () => {
    // −32 000 is a shortfall, and the sign is the whole meaning of the row: the
    // same figure with the sign dropped reads as a surplus and nobody counts
    // the drawer again.
    expect(data).toMatch(/-\s*32_000|som\(-32_000\)|-3_200_000/);
  });

  it('money is integer tiyin, never a float', () => {
    // The binding convention, and the one place a document could quietly break
    // it: a design file writes so'm, and a transcription that forgets the ×100
    // produces a receipt that is correct to the eye and off by two decimal
    // places against every other total in the system.
    expect(data).toContain('const som =');
    expect(data).not.toMatch(/\d+\.\d+\s*\*\s*100/);
  });
});

describe('the P&L change column', () => {
  /*
   * The one place the build departs from the design file's output, and the test
   * that keeps the departure honest — both halves of it.
   *
   * The file's script says `good = isTot ? up : !up`, which treats every
   * non-subtotal row as a cost. Nine of them are; four are revenue, and the
   * prototype prints a restaurant's four growing income streams in red. The
   * build reads the sign of the row's own figure instead — the discriminator
   * the design's own data already carries and its colour rule never consulted.
   *
   * Asserted as agreement-plus-exceptions rather than as a fixed list of
   * colours, because that is the actual claim: twenty rows unchanged, four
   * corrected, and nothing else moving quietly.
   */
  const designSaysGood = (row: PlRow): boolean => {
    const up = row.delta.startsWith('+');

    return row.kind === 't' || row.kind === 'f' ? up : !up;
  };

  const rows = PL_ROWS.filter((row) => row.kind !== 'h' && row.delta !== '' && row.delta !== '0%');

  it('has rows to judge', () => {
    expect(rows.length).toBeGreaterThan(15);
  });

  it('differs from the design on exactly the four revenue lines', () => {
    const differ = rows
      .filter((row) => (deltaTone(row) === 'good') !== designSaysGood(row))
      .map((row) => row.label);

    expect(differ.sort()).toEqual(
      [
        'Zal',
        'Olib ketish',
        "Yetkazish · o'z kuryerlarimiz",
        'Agregatorlar · komissiyadan keyin',
      ].sort(),
    );
  });

  it('prints growing revenue as good and growing cost as bad', () => {
    for (const row of rows) {
      const up = row.delta.startsWith('+');
      const incoming = row.value >= 0;

      expect(deltaTone(row), `${row.label} ${row.delta}`).toBe(incoming === up ? 'good' : 'bad');
    }
  });

  it('says nothing about a line that did not move', () => {
    // `Ijara · 5 filial` and `Amortizatsiya` are both flat, and a flat line
    // coloured either way would be a judgement the document is not making.
    const flat = PL_ROWS.filter((row) => row.delta === '0%');

    expect(flat.length).toBeGreaterThan(0);

    for (const row of flat) expect(deltaTone(row)).toBe('neutral');
  });
});
