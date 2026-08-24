import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { CONTACT } from '@/lib/constants';
import { pagesCopy, SITE_PAGES } from './pages-copy';
import {
  PAGE_CASES,
  PAGE_CHANGES,
  PAGE_CITIES,
  PAGE_COMPARISON,
  PAGE_DEVICES,
  PAGE_FAQ_CATEGORY,
  PAGE_INTEGRATIONS,
  PAGE_MODS,
  PAGE_PLANS,
  PAGE_ROLES,
} from './pages-data';
import { PLANS as SITE_PLANS, QUOTES, SITE_NAV, STATS } from './site-data';

/**
 * The public site, checked against `Smart Restaurant Cloud - Sayt v2.dc.html`.
 *
 * Two things this locks. **Counts**, because the site's worst deviation was
 * exactly that kind: a sentence claiming eight roles above a list of seven,
 * where the design has nine — a number a buyer checks against their own
 * restaurant. And **index alignment** between `pages-copy.ts` and
 * `pages-data.ts`, which are two generated files that have to stay parallel:
 * the moment `mods[3]` in one is a different module from `mods[3]` in the
 * other, the product page shows one screenshot under another module's headline.
 */
const LOCALES = ['uz', 'ru', 'en'] as const;

describe('the counts the design fixes', () => {
  it('has nine roles, six modules, three plans and eight integrations', () => {
    expect(PAGE_ROLES).toHaveLength(9);
    expect(PAGE_MODS).toHaveLength(6);
    expect(PAGE_PLANS).toHaveLength(3);
    expect(PAGE_INTEGRATIONS).toHaveLength(8);
    expect(PAGE_CASES).toHaveLength(3);
    expect(PAGE_CHANGES).toHaveLength(3);
    expect(PAGE_DEVICES).toHaveLength(5);
    // Five cities, and no counts beside them: the strip carried an invented
    // restaurant tally per city under a heading that called them customers.
    // See `honest-claims.test.ts`.
    expect(PAGE_CITIES).toBe(5);
  });

  it('compares twelve capabilities across the three plans', () => {
    expect(PAGE_COMPARISON).toHaveLength(12);

    for (const row of PAGE_COMPARISON) {
      expect(row).toHaveLength(3);
    }

    // Start ⊆ Growth ⊆ Enterprise. A table where a cheaper plan has something
    // a dearer one lacks is either a real product decision or — far more often
    // — a transcription slip, and it is the kind a reader spots before we do.
    for (const [start, growth, enterprise] of PAGE_COMPARISON) {
      if (start) expect(growth).toBe(true);
      if (growth) expect(enterprise).toBe(true);
    }
  });

  it('asks ten questions across four categories', () => {
    expect(PAGE_FAQ_CATEGORY).toHaveLength(10);

    for (const locale of LOCALES) {
      expect(pagesCopy(locale).faqCategories).toHaveLength(4);
    }

    // Every category has at least one question, or a chip filters to nothing.
    for (let category = 0; category < 4; category += 1) {
      expect(PAGE_FAQ_CATEGORY).toContain(category);
    }
  });
});

describe('the home page reads the design file, not a paraphrase of it', () => {
  /*
   * Four blocks the home page used to take from `src/i18n`, where they had been
   * hand-written from an earlier draft: the four figures, the four compliance
   * cards, the three quotes and the ten labels inside the hero mock. Every one
   * of them had drifted a sentence or two from `Sayt v2.dc.html`, and none of
   * it was checkable, because the catalogue is shared with the console and its
   * `marketing` namespace answers to nothing.
   *
   * They are transcribed into `pages-copy.ts` now, beside the other six pages'
   * copy, and these are the counts that stop one of the three languages from
   * losing a card.
   */
  it('gives the four figures, four compliance cards and three quotes their words', () => {
    for (const locale of LOCALES) {
      const t = pagesCopy(locale);

      expect(t.stats).toHaveLength(STATS.length);
      expect(t.compliance).toHaveLength(4);
      expect(t.quotes).toHaveLength(QUOTES.length);
      expect(Object.keys(t.mock)).toHaveLength(9);
    }
  });

  it('gives every contact row something to say when it is copied', () => {
    // The Copy button really writes to the clipboard, and the design answers
    // each of the four with a different note — "number", "handle", "address".
    for (const locale of LOCALES) {
      const rows = pagesCopy(locale).contactRows;

      expect(rows).toHaveLength(4);

      for (const row of rows) expect(row.copied.trim()).not.toBe('');

      /* The address moved to `CONTACT.office` — a fact, not prose — so this
         asserts the fact is filled in for the language being drawn. */
      expect(CONTACT.office[locale].trim()).not.toBe('');
    }
  });
});

describe('the ROI calculator states a basis it can actually compute', () => {
  /*
   * `dc.html:1381` builds the reporting line as `adminHours + " soat / oy …"`,
   * so the hours move with the branch count. The catalogue had transcribed the
   * whole sentence including a literal zero — "0 soat / oy · soati 45 000 so'm
   * hisobida" — under a figure of several million so'm. A saving justified by
   * zero hours of work is the one line on a pricing page a sceptical reader
   * stops at, and it read that way in all three languages.
   */
  it('leaves the hours to the page and starts the basis with the separator', () => {
    for (const locale of LOCALES) {
      const basis = pagesCopy(locale).roiRows[2]!.basis;

      expect(basis.startsWith(' ')).toBe(true);
      expect(basis.trimStart().startsWith('0')).toBe(false);
    }
  });

  it('names the plan being charged for above five branches', () => {
    // `dc.html:1383` — Start, Growth, or Growth plus the extra branches. The
    // row said "Start" at twenty branches, where the figure it explains is
    // Growth plus fifteen.
    for (const locale of LOCALES) {
      expect(pagesCopy(locale).roiPlanExtra.trim()).not.toBe('');
    }
  });
});

describe('the two generated files stay parallel', () => {
  it('gives every structural entry its words, in all three languages', () => {
    for (const locale of LOCALES) {
      const t = pagesCopy(locale);

      expect(t.roles).toHaveLength(PAGE_ROLES.length);
      expect(t.mods).toHaveLength(PAGE_MODS.length);
      expect(t.plans).toHaveLength(PAGE_PLANS.length);
      expect(t.integrations).toHaveLength(PAGE_INTEGRATIONS.length);
      expect(t.cases).toHaveLength(PAGE_CASES.length);
      expect(t.changes).toHaveLength(PAGE_CHANGES.length);
      expect(t.devices).toHaveLength(PAGE_DEVICES.length);
      expect(t.capabilities).toHaveLength(PAGE_COMPARISON.length);
      expect(t.faq).toHaveLength(PAGE_FAQ_CATEGORY.length);
      expect(t.cities).toHaveLength(PAGE_CITIES);

      // Each module's screen rows line up with the chips beside them.
      t.mods.forEach((mod, index) => {
        expect(mod.rows).toHaveLength(PAGE_MODS[index]!.rows.length);
      });

      // And each case's metrics line up with their figures.
      t.cases.forEach((study, index) => {
        expect(study.metrics).toHaveLength(PAGE_CASES[index]!.metrics.length);
      });
    }
  });

  it('leaves nothing blank in any language', () => {
    // A generated catalogue is exactly where an empty string hides: it type-checks,
    // it renders, and it shows a reader a heading with nothing under it.
    const walk = (value: unknown, path: string): void => {
      if (typeof value === 'string') {
        expect(value.trim(), path).not.toBe('');

        return;
      }

      if (Array.isArray(value)) {
        value.forEach((entry, index) => walk(entry, `${path}[${index}]`));

        return;
      }

      if (value !== null && typeof value === 'object') {
        for (const [key, entry] of Object.entries(value)) walk(entry, `${path}.${key}`);
      }
    };

    for (const locale of LOCALES) walk(SITE_PAGES[locale], locale);
  });
});

describe('the navigation', () => {
  it('has a page on disk for every link in the header', () => {
    // The header used to point at anchors — `#product`, `#roles` — that
    // scrolled to a summary of a page rather than to the page. A link that
    // 404s would be caught by a build; a link that quietly scrolls somewhere
    // plausible would not.
    const here = join(process.cwd(), 'src/app/(marketing)');
    const routes = readdirSync(here, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name);

    for (const item of SITE_NAV) {
      expect(routes, item.href).toContain(item.href.replace('/', ''));
    }

    expect(routes).toContain('contact');
  });
});

describe('the prices, in the unit the renderer expects', () => {
  /*
   * This suite counted things — three plans, twelve capabilities, ten questions
   * — and checked no figure. So a plan priced a hundred times too low passed
   * every assertion in the file: there were still three of them.
   *
   * `pricing/page.tsx` prints these through `formatTiyinAmount`, which divides
   * by a hundred. The design's own numbers are so'm, so anything transcribed
   * straight off `Sayt v2.dc.html` and dropped in here is wrong by exactly that
   * factor — which is the mistake that was made, and the one worth a test.
   */
  it('prices Start and Growth as the company sells them, in tiyin', () => {
    /*
     * The design file says 2 400 000 and 6 900 000 (`Sayt v2.dc.html:1325`),
     * and here the file does not win: a price is a commercial decision the
     * owner makes, not a drawing. Set 2026-08-23 — 150 000 to start, 390 000
     * for Growth. What the test is still for is the unit: `formatTiyinAmount`
     * divides by a hundred, so a number transcribed as so'm shows a plan a
     * hundred times too cheap, which is the mistake this file was written for.
     */
    expect(PAGE_PLANS[0]?.monthlyTiyin).toBe(150_000 * 100);
    expect(PAGE_PLANS[1]?.monthlyTiyin).toBe(390_000 * 100);
  });

  it('quotes Enterprise rather than pricing it', () => {
    expect(PAGE_PLANS[2]?.monthlyTiyin).toBeNull();
  });

  it('agrees with the home page about what a plan costs', () => {
    // Two files carry these three prices, for two screens of one site. A guest
    // who reads the home page and then opens /pricing must not find a
    // different number.
    const home = SITE_PLANS.map((plan) => plan.priceTiyin);
    const pricing = PAGE_PLANS.map((plan) => plan.monthlyTiyin);

    expect(pricing).toEqual(home);
  });
});
