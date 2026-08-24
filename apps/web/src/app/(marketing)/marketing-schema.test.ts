import { describe, expect, it } from 'vitest';

import { asScriptJson } from '../(site)/venue-schema';
import { faqPage, faqPageFrom, platformGraph } from './marketing-schema';
import { pagesCopy } from './pages-copy';
import { PAGE_FAQ_CATEGORY } from './pages-data';

/**
 * The markup that turns a link into an expandable question list.
 *
 * `FAQPage` is the highest-leverage thing a landing page can emit — the result
 * occupies several times the height of a plain link — and it is also the one
 * with a penalty attached: Google requires the marked-up answers to be visible
 * on the page. Markup describing a question the page has stopped showing is not
 * a missed opportunity, it is a manual action.
 *
 * So the test that matters here is not "is the JSON well formed". It is "does
 * the markup describe exactly what the page renders, in the same order".
 */
describe('faqPage', () => {
  const graph = faqPage() as {
    '@type': string;
    mainEntity: { name: string; acceptedAnswer: { text: string } }[];
  };

  const faq = pagesCopy('uz').faq;

  it('marks up exactly the questions the page draws', () => {
    /*
     * The markup described six questions for as long as the page drew six.
     * The design's FAQ is ten, on its own route, and the markup did not move
     * with it — four of the six it described were no longer rendered anywhere.
     */
    expect(graph.mainEntity).toHaveLength(PAGE_FAQ_CATEGORY.length);
    expect(graph.mainEntity).toHaveLength(faq.length);
    expect(graph.mainEntity.map((question) => question.name)).toEqual(faq.map((entry) => entry.q));
  });

  it('carries the answer text, not a summary of it', () => {
    // A shortened answer is a different answer from the one on the page.
    for (const [index, entry] of faq.entries()) {
      expect(graph.mainEntity[index]?.acceptedAnswer.text).toBe(entry.a);
    }
  });

  it('drops a half-written entry rather than emitting a nameless question', () => {
    // One invalid entry makes a crawler discard the whole FAQ block — not just
    // that question — and a blank is what a half-finished translation leaves.
    const missing = faqPageFrom([
      { q: 'Here', a: 'Yes' },
      { q: '', a: 'Nameless' },
      { q: 'No answer', a: '   ' },
    ]) as { mainEntity: { name: string }[] };

    expect(missing.mainEntity).toHaveLength(1);
    expect(missing.mainEntity[0]?.name).toBe('Here');
  });

  it('is a FAQPage a crawler will accept', () => {
    expect(graph['@type']).toBe('FAQPage');
    expect(graph.mainEntity.every((question) => question.name.length > 0)).toBe(true);
  });
});

describe('platformGraph', () => {
  const graph = platformGraph() as { '@graph': Record<string, unknown>[] };

  it('names the company and the product, and links them', () => {
    const org = graph['@graph'].find((node) => node['@type'] === 'Organization');
    const app = graph['@graph'].find((node) => node['@type'] === 'SoftwareApplication');

    expect(org).toBeDefined();
    expect(app).toBeDefined();
    expect((app?.publisher as { '@id': string })['@id']).toBe(org?.['@id']);
  });

  it('says which three languages it is available in', () => {
    // The platform ships uz/ru/en and a crawler that does not know that files
    // it as Uzbek-only — which is most of the Tashkent market missed.
    const app = graph['@graph'].find((node) => node['@type'] === 'SoftwareApplication');

    expect(app?.inLanguage).toEqual(['uz', 'ru', 'en']);
  });
});

describe('both graphs survive being put inside a script element', () => {
  it('emits nothing that could close the block', () => {
    // The catalogue is written by hand and an apostrophe or an angle bracket in
    // an answer must not end up as markup on the public landing page.
    for (const json of [asScriptJson(faqPage()), asScriptJson(platformGraph())]) {
      expect(json).not.toContain('<');
      expect(json).not.toContain('>');
      expect(() => JSON.parse(json)).not.toThrow();
    }
  });
});
