import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import robots from '@/app/robots';

import {
  FILL,
  LEGAL,
  LEGAL_COOKIES,
  LEGAL_TODO,
  LEGAL_UPDATED,
  LEGAL_VERSION,
  legalCopy,
  type LegalDoc,
} from './legal-copy';
import { LegalDocument } from './legal-document';
import { pagesCopy } from './pages-copy';

/**
 * `/terms` and `/privacy`, and the parts of them a person cannot proof-read.
 *
 * These two documents are 8000 words across three languages. Nobody re-reads
 * all of that after a change, which makes them exactly the kind of content
 * that rots quietly: a clause dropped from the Russian version, a placeholder
 * filled in one language and left in another, a cookie added to the platform
 * and never added to the policy that lists them.
 *
 * So what is checked here is structure and counts rather than prose. The three
 * languages must be the same document; nothing may be blank; every unknown fact
 * must still be marked; and the cookie section must name every cookie this
 * platform actually sets.
 */

const LOCALES = ['uz', 'ru', 'en'] as const;
const DOCS = ['terms', 'privacy'] as const;

/** `apps/web` — vitest runs from the package root, as the other suites assume. */
const WEB = process.cwd();

/** Every string a reader can see in one document, in one flat list. */
function strings(doc: LegalDoc): string[] {
  const out = [doc.eyebrow, doc.title, doc.lede, doc.draftH, doc.draftP, doc.updated, doc.tocH];

  for (const section of doc.sections) {
    out.push(section.h, ...section.body, ...(section.after ?? []), ...(section.head ?? []));
    for (const row of section.rows ?? []) out.push(...row);
    for (const link of section.links ?? []) out.push(link.label);
  }

  return out;
}

/** Only the running prose — the paragraphs, not the tables. */
function prose(doc: LegalDoc): string[] {
  return doc.sections.flatMap((section) => [...section.body, ...(section.after ?? [])]);
}

describe('the two documents are one document in three languages', () => {
  it('carries the same sections, in the same order, everywhere', () => {
    /*
     * The failure this is written for: a clause added to the Uzbek text and
     * forgotten in the other two. TypeScript cannot catch it — an array is an
     * array whatever its length — and a reader of the Russian page has no way
     * to know that section 7 exists and they were not shown it.
     */
    for (const key of DOCS) {
      const ids = LEGAL.uz[key].sections.map((section) => section.id);

      for (const locale of LOCALES) {
        expect(
          LEGAL[locale][key].sections.map((section) => section.id),
          `${locale}.${key}`,
        ).toEqual(ids);
      }
    }
  });

  it('has thirteen clauses in the offer and twelve in the privacy policy', () => {
    // Named counts, so deleting a clause is a decision rather than an accident.
    expect(LEGAL.uz.terms.sections).toHaveLength(13);
    expect(LEGAL.uz.privacy.sections).toHaveLength(12);
  });

  it('gives every clause an id that works as an anchor', () => {
    for (const key of DOCS) {
      const ids = LEGAL.uz[key].sections.map((section) => section.id);

      // Unique, or the table of contents sends two entries to the same place.
      expect(new Set(ids).size, key).toBe(ids.length);

      for (const id of ids) {
        expect(id, `${key}#${id}`).toMatch(/^[a-z][a-z0-9-]*$/);
      }
    }
  });

  it('leaves nothing blank in any language', () => {
    for (const locale of LOCALES) {
      for (const key of DOCS) {
        for (const value of strings(LEGAL[locale][key])) {
          expect(value.trim(), `${locale}.${key}`).not.toBe('');
        }
      }
    }
  });

  it('gives every clause at least one paragraph', () => {
    // A heading in the table of contents that leads to nothing is worse than a
    // missing heading: the reader concludes the clause was withheld.
    for (const locale of LOCALES) {
      for (const key of DOCS) {
        for (const section of LEGAL[locale][key].sections) {
          expect(section.body.length, `${locale}.${key}#${section.id}`).toBeGreaterThan(0);
        }
      }
    }
  });

  it('keeps every table square, with a heading per column', () => {
    for (const locale of LOCALES) {
      for (const key of DOCS) {
        for (const section of LEGAL[locale][key].sections) {
          const where = `${locale}.${key}#${section.id}`;

          // `head` and `rows` travel together: a table with no column headings
          // renders as an unlabelled grid, and headings with no rows render as
          // a table that is only a header.
          expect(section.head === undefined, where).toBe(section.rows === undefined);
          if (section.rows === undefined || section.head === undefined) continue;

          expect(section.rows.length, where).toBeGreaterThan(0);
          for (const row of section.rows) {
            expect(row, where).toHaveLength(section.head.length);
          }
        }
      }
    }
  });

  it('falls back to Uzbek for a cookie value nobody set', () => {
    // `srcp.site.lang` is whatever the browser sends. A page that trusted it
    // would render `undefined` for every reader who never touched the switch.
    expect(legalCopy('ru')).toBe(LEGAL.ru);
    expect(legalCopy(undefined)).toBe(LEGAL.uz);
    expect(legalCopy('')).toBe(LEGAL.uz);
    expect(legalCopy('de')).toBe(LEGAL.uz);
    expect(legalCopy('__proto__')).toBe(LEGAL.uz);
  });
});

describe('the draft banner', () => {
  it('says so on both documents, in all three languages', () => {
    /*
     * The whole point of publishing these as drafts. Neither was written by a
     * lawyer, and a reader who is not told that reads a public offer — which
     * binds whoever accepts it — as settled terms.
     */
    for (const locale of LOCALES) {
      for (const key of DOCS) {
        const doc = LEGAL[locale][key];

        expect(doc.draftH.trim(), `${locale}.${key}`).not.toBe('');
        expect(doc.draftP, `${locale}.${key}`).toContain(LEGAL_VERSION);
        expect(doc.draftP, `${locale}.${key}`).toContain(LEGAL_UPDATED);
        expect(doc.updated, `${locale}.${key}`).toContain(LEGAL_UPDATED);
      }
    }
  });

  it('is a version below one, because that is what a draft is', () => {
    expect(LEGAL_VERSION).toBe('0.1');
    expect(LEGAL_UPDATED).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe('the facts these drafts are still missing', () => {
  /*
   * Counted rather than described. Every unknown — the legal entity, its TIN,
   * the personal-data registry number — is rendered as `[to’ldirilsin]`, and
   * the count of those markers is checked against `LEGAL_TODO`. Fill one in
   * and this fails until its id is struck off the list, which is the reminder:
   * a blank that stops being counted is a blank that ships.
   */
  const EXPECTED = {
    terms: ['company', 'tin', 'address', 'bank', 'director', 'email', 'effective'],
    privacy: ['operator', 'address', 'registry', 'email', 'officer', 'datacenter'],
  } as const;

  it('names seven in the offer and six in the privacy policy', () => {
    expect([...LEGAL_TODO.terms]).toEqual([...EXPECTED.terms]);
    expect([...LEGAL_TODO.privacy]).toEqual([...EXPECTED.privacy]);

    for (const key of DOCS) {
      expect(new Set(LEGAL_TODO[key]).size, key).toBe(LEGAL_TODO[key].length);
    }
  });

  it('marks exactly that many blanks, in every language', () => {
    for (const locale of LOCALES) {
      for (const key of DOCS) {
        const marks = strings(LEGAL[locale][key]).filter((value) => value === FILL[locale]);

        expect(marks, `${locale}.${key}`).toHaveLength(LEGAL_TODO[key].length);
      }
    }
  });

  it('keeps the blanks in the table and out of the prose', () => {
    /*
     * A placeholder inside a sentence reads as part of the sentence and gets
     * missed; in a two-column table under a heading that says these fields are
     * not filled in yet, it cannot be. This also keeps the count above exact,
     * because there is exactly one place to look.
     */
    for (const locale of LOCALES) {
      for (const key of DOCS) {
        for (const paragraph of prose(LEGAL[locale][key])) {
          expect(paragraph, `${locale}.${key}`).not.toContain(FILL[locale]);
        }
      }
    }
  });

  it('shows a placeholder a reader of that language can read', () => {
    // The first draft used the Uzbek marker in all three, which tells a Russian
    // reader nothing — and a blank that does not read as a blank gets published
    // as if it were a value.
    expect(new Set(Object.values(FILL)).size).toBe(3);

    for (const locale of LOCALES) {
      expect(FILL[locale]).toMatch(/^\[.+\]$/);
    }
  });
});

describe('the cookie section', () => {
  it('names every cookie this platform sets', () => {
    /*
     * Double entry against `CLAUDE.md`'s own table — the three the till sets
     * and the three the staff app sets, deliberately separate because one
     * person can be at the till and on their phone at once. The seventh is the
     * public site's own language cookie, which is set on this very page.
     *
     * The list is spelled out here rather than imported, so adding a cookie to
     * `legal-copy.ts` and forgetting it in the platform (or the reverse) shows
     * up as a failure instead of agreeing with itself.
     */
    expect([...LEGAL_COOKIES]).toEqual([
      'restaurant-campus-session',
      'restaurant-campus-terminal',
      'restaurant-campus-shift',
      'restaurant-campus-crew-device',
      'restaurant-campus-crew-tenant',
      'restaurant-campus-crew-session',
      'srcp.site.lang',
    ]);
  });

  it('lists every one of them, with a reason and a lifetime, in all three languages', () => {
    for (const locale of LOCALES) {
      const section = LEGAL[locale].privacy.sections.find((entry) => entry.id === 'cookies');

      expect(section, locale).toBeDefined();
      expect(section?.rows, locale).toHaveLength(LEGAL_COOKIES.length);

      const named = (section?.rows ?? []).map((row) => row[0]);
      for (const cookie of LEGAL_COOKIES) {
        expect(named, `${locale} · ${cookie}`).toContain(cookie);
      }

      // Three columns: what it is called, what it is for, how long it lives. A
      // cookie policy that names a cookie without saying either is a list.
      for (const row of section?.rows ?? []) {
        expect(row, locale).toHaveLength(3);
      }
    }
  });

  it('is reached from the table of contents like every other clause', () => {
    for (const locale of LOCALES) {
      const ids = LEGAL[locale].privacy.sections.map((section) => section.id);
      expect(ids, locale).toContain('cookies');
    }
  });
});

describe('the pages', () => {
  it('has a route on disk for each document', () => {
    for (const key of DOCS) {
      expect(existsSync(join(import.meta.dirname, key, 'page.tsx')), key).toBe(true);
    }
  });

  it('leaves both open to crawlers', () => {
    /*
     * The one part of this site a regulator or a buyer looks for by name. The
     * question is asked the way a crawler asks it — `disallow` is a prefix
     * match — rather than by searching for the literal path.
     */
    const rules = robots().rules;
    const disallowed = Array.isArray(rules) ? [] : [rules.disallow ?? []].flat();

    for (const rule of disallowed) {
      expect('/terms'.startsWith(rule), rule).toBe(false);
      expect('/privacy'.startsWith(rule), rule).toBe(false);
    }

    // And the guard finds one where there is one, or it proves nothing.
    expect(disallowed.some((rule) => '/dashboard'.startsWith(rule))).toBe(true);
  });

  it('links only where there is a page to land on', () => {
    /*
     * Every clause that points at another page — the plans on `/pricing`, the
     * request form on `/contact` — is a real route, checked under every route
     * group because groups are not part of a URL.
     */
    const app = join(WEB, 'src/app');
    const groups = [
      '',
      ...readdirSync(app, { withFileTypes: true })
        .filter((entry) => entry.isDirectory() && entry.name.startsWith('('))
        .map((entry) => entry.name),
    ];

    const hrefs = new Set(
      DOCS.flatMap((key) =>
        LEGAL.uz[key].sections.flatMap((section) => (section.links ?? []).map((link) => link.href)),
      ),
    );

    expect(hrefs.size).toBeGreaterThan(0);

    for (const href of hrefs) {
      // Internal only: a legal document that sends a reader off-site to read
      // our own terms is a document somebody else can edit.
      expect(href, href).toMatch(/^\/[a-z-]+$/);
      expect(
        groups.some((group) => existsSync(join(app, group, href, 'page.tsx'))),
        href,
      ).toBe(true);
    }
  });

  it('keeps the same links in every language', () => {
    for (const key of DOCS) {
      const shape = LEGAL.uz[key].sections.map((section) =>
        (section.links ?? []).map((link) => link.href),
      );

      for (const locale of LOCALES) {
        expect(
          LEGAL[locale][key].sections.map((section) =>
            (section.links ?? []).map((link) => link.href),
          ),
          `${locale}.${key}`,
        ).toEqual(shape);
      }
    }
  });
});

describe('the footer', () => {
  const chrome = readFileSync(join(import.meta.dirname, 'site-chrome.tsx'), 'utf8');

  it('links to both documents instead of flashing a promise', () => {
    /*
     * These two rows were buttons answering with "coming soon" for as long as
     * neither page existed. Now that both do, a button in their place is worse
     * than a 404: a customer looking for the terms before signing is told the
     * platform has none.
     *
     * `withLocale` since the language moved into the path: a reader on
     * `/ru/pricing` who taps the privacy policy should get the Russian one,
     * and a bare `/privacy` would hand them whatever their cookie last said.
     */
    expect(chrome).toContain("{ label: t.fTerms, href: withLocale('/terms', locale) }");
    expect(chrome).toContain("{ label: t.fPrivacy, href: withLocale('/privacy', locale) }");
    expect(chrome).not.toContain('flash(t.fTermsSoon)');
    expect(chrome).not.toContain('flash(t.fPrivacySoon)');
  });

  it('keeps the retired copy keys in all three catalogues', () => {
    /*
     * Deliberately not deleted. `pages-copy.ts` types its Russian and English
     * objects against the Uzbek one, so a key removed from one language and not
     * the others breaks the build — and removing a key from three languages to
     * tidy up an unused string is how a catalogue starts drifting. They cost
     * nothing where they are.
     */
    for (const locale of LOCALES) {
      const page = pagesCopy(locale).page;

      expect(page.fTermsSoon.trim(), locale).not.toBe('');
      expect(page.fPrivacySoon.trim(), locale).not.toBe('');
    }
  });
});

describe('the rendered page', () => {
  /*
   * Rendered rather than inspected, for one reason: the table of contents is
   * the only navigation these documents have, and an anchor that points at an
   * id the markup does not carry fails silently — the reader presses a heading
   * and the page does not move. Comparing the two lists in the data would only
   * compare the data with itself.
   */
  const markup = renderToStaticMarkup(createElement(LegalDocument, { doc: LEGAL.uz.terms }));

  it('gives every entry in the table of contents somewhere to land', () => {
    const anchors = [...markup.matchAll(/href="#([a-z0-9-]+)"/g)].map((match) => match[1]);

    expect(anchors).toHaveLength(LEGAL.uz.terms.sections.length);

    for (const anchor of anchors) {
      expect(markup, `#${anchor ?? ''}`).toContain(`id="${anchor ?? ''}"`);
    }
  });

  it('puts the draft warning in the markup, not just in the data', () => {
    expect(markup).toContain(LEGAL.uz.terms.draftH);
    expect(markup).toContain(LEGAL_VERSION);
    expect(markup).toContain(LEGAL_UPDATED);
  });

  it('renders one heading per clause under one h1', () => {
    expect(markup.match(/<h1/g) ?? []).toHaveLength(1);
    expect(markup.match(/<h2/g) ?? []).toHaveLength(LEGAL.uz.terms.sections.length);
  });

  it('still shows the blanks it has not filled in', () => {
    const marks = markup.split(FILL.uz).length - 1;

    expect(marks).toBe(LEGAL_TODO.terms.length);
  });
});
