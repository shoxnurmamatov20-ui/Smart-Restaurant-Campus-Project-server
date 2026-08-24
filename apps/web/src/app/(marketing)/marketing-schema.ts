import { CONTACT } from '@/lib/constants';
import { siteUrl } from '@/lib/site-url';

import { pagesCopy } from './pages-copy';

/**
 * What a search engine is told about the platform itself.
 *
 * Two things, and the second is the one that changes a result:
 *
 *   `Organization` + `SoftwareApplication` — who makes this and what it is.
 *   Ordinary, and what puts a knowledge panel beside a branded search.
 *
 *   `FAQPage` — the questions on `/faq`, marked up. This is the markup that
 *   produces the expandable question list under a result, and it is the single
 *   highest-leverage thing a B2B landing page can emit: it occupies several
 *   times the vertical space of a plain result and answers the reader's
 *   objection before they click.
 *
 * Uzbek, matching the layout's own decision: the site carries a uz/ru/en switch
 * in a cookie, so the document a crawler and a shared link receive is the Uzbek
 * one. Marking up Russian text a crawler cannot see would be a mismatch — the
 * one thing Google penalises outright.
 *
 * ---------------------------------------------------------------------------
 * Why the source changed
 *
 * `faqPage()` used to read six keys out of `site-data.ts` and the six matching
 * entries out of `src/i18n/uz.ts`, which was right when the home page drew six
 * questions in a flat list. The design's FAQ is ten questions in four
 * categories on its own route, and nothing moved the markup with it: the
 * platform emitted, on every page, a description of six answers — four of them
 * no longer rendered anywhere. Google treats markup describing an answer a
 * reader cannot see as a manual action rather than a missed opportunity.
 *
 * So the source is now the one array the FAQ route iterates, and the markup is
 * emitted by that route rather than by the layout: the questions and the page
 * that draws them cannot end up in two different places again.
 */

type FaqEntry = { q: string; a: string };

/**
 * The FAQ, built from the ordered list the page renders.
 *
 * A parameter rather than reached for, so a test can hand it entries and prove
 * the markup carries exactly those, in order, and drops anything unusable.
 * A test that cannot fail is not a test.
 */
export function faqPageFrom(entries: readonly FaqEntry[]): object {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: entries
      /*
       * An entry with no `name` is invalid markup, and one invalid entry makes
       * a crawler discard the whole FAQ block — not just that question. A
       * blank is exactly what a half-finished translation leaves behind.
       */
      .filter((entry) => entry.q.trim() !== '' && entry.a.trim() !== '')
      .map((entry) => ({
        '@type': 'Question',
        name: entry.q,
        acceptedAnswer: {
          '@type': 'Answer',
          text: entry.a,
        },
      })),
  };
}

/** The real FAQ: the ten questions `/faq` draws, in the order it draws them. */
export function faqPage(): object {
  return faqPageFrom(pagesCopy('uz').faq);
}

/** The company and the product, as one graph. */
export function platformGraph(): object {
  const base = siteUrl();
  const t = pagesCopy('uz').page;

  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Organization',
        '@id': `${base}/#org`,
        name: 'Smart Restaurant Cloud',
        url: base,
        description: t.heroP,
        areaServed: { '@type': 'Country', name: 'Uzbekistan' },
        availableLanguage: ['uz', 'ru', 'en'],
        /*
         * The sales line, from the same constant the header and the contact
         * page print. A result card that shows a number is a call that never
         * has to find the contact page first — and a number here that differs
         * from the one on the page is the kind of mismatch a crawler demotes.
         */
        /*
         * Where the company sits. A crawler that knows the city files the
         * result under it — which for a platform sold in one country is the
         * difference between showing up for "Termizda restoran dasturi" and
         * not showing up at all.
         */
        address: {
          '@type': 'PostalAddress',
          addressLocality: CONTACT.office.en,
          addressCountry: 'UZ',
        },
        contactPoint: {
          '@type': 'ContactPoint',
          telephone: CONTACT.phone.replace(/\s/g, ''),
          email: CONTACT.email,
          contactType: 'sales',
          availableLanguage: ['uz', 'ru', 'en'],
        },
      },
      {
        '@type': 'SoftwareApplication',
        '@id': `${base}/#app`,
        name: 'Smart Restaurant Cloud',
        applicationCategory: 'BusinessApplication',
        /*
         * Named rather than left blank: a crawler that cannot tell what this
         * runs on files it under nothing, and the answer — a browser, a
         * tablet, a phone — is the reason a restaurant does not have to buy
         * hardware to try it.
         */
        operatingSystem: 'Web, Android, iOS',
        publisher: { '@id': `${base}/#org` },
        inLanguage: ['uz', 'ru', 'en'],
        url: base,
      },
    ],
  };
}
