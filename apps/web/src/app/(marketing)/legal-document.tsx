import Link from 'next/link';

import type { LegalDoc } from './legal-copy';
import { CARD, EYEBROW, PageHead } from './page-ui';

/**
 * The renderer both legal documents share.
 *
 * `/terms` and `/privacy` are the same page with different words in it — a
 * heading, a draft banner, a table of contents and twenty-odd numbered clauses,
 * some of which carry a table. Written twice they would drift on the first fix,
 * and the fix a legal document gets is exactly the kind that lands in one file
 * and not the other: a heading level, an anchor offset, a table that scrolls.
 *
 * It sits here rather than under `terms/` or `privacy/` for the same reason
 * `page-ui.tsx` does: it is furniture shared by routes, and putting it inside
 * one of them would make the other import across a sibling.
 *
 * A server component. Nothing on these pages has state — the table of contents
 * is anchors, and anchors are what a reader who prints the page or follows a
 * link from a support email needs to work without JavaScript.
 */
export function LegalDocument({ doc }: { doc: LegalDoc }) {
  return (
    <section data-pagetop className="pt-[76px] pb-[96px]">
      <div data-wrap>
        {/*
         * 72ch, not the site's 1200px wrap.
         *
         * Everything else on this site is scanned; these two are read, top to
         * bottom, by someone deciding whether to sign. A measure of about
         * seventy-two characters is where a paragraph stops needing the eye to
         * travel back across the page to find the next line, and it is also
         * what a printed page gives — which matters here, because a lawyer
         * reviewing this draft will print it.
         */}
        <article className="max-w-[72ch]">
          <PageHead eyebrow={doc.eyebrow} title={doc.title} lede={doc.lede} size={42} />

          {/*
           * The draft banner, and why it is the first thing under the title.
           *
           * A public offer binds whoever accepts it and a privacy policy is a
           * statement to a regulator. Neither of these was written by a lawyer,
           * and a reader who finds that out at the bottom of the page has
           * already read it as if it were settled. `role="note"` rather than
           * `alert`, because it is not interrupting anything — it is a standing
           * condition of the document.
           */}
          <aside
            role="note"
            className="bg-warning-50 border-warning-500/35 mt-7 rounded-lg border p-4 print:break-inside-avoid"
          >
            <p className="text-warning-700 text-[14px] leading-[1.5] font-semibold">{doc.draftH}</p>
            <p className="text-warning-700 mt-1 text-[14px] leading-[1.6] opacity-90">
              {doc.draftP}
            </p>
          </aside>

          <p className="text-fg-subtle mt-5 font-mono text-[12px]">{doc.updated}</p>

          <nav aria-label={doc.tocH} className={`${CARD} mt-8 p-5 print:break-inside-avoid`}>
            <div className={EYEBROW}>{doc.tocH}</div>
            <ol className="mt-3 grid gap-1.5">
              {doc.sections.map((section) => (
                <li key={section.id}>
                  <a
                    href={`#${section.id}`}
                    className="text-fg-muted hover:text-brand-600 text-[14px] leading-[1.5]"
                  >
                    {section.h}
                  </a>
                </li>
              ))}
            </ol>
          </nav>

          {doc.sections.map((section) => (
            /* `scroll-mt-24` because the header is sticky at h-16: without it
               every anchor lands with its own heading hidden behind the bar. */
            <section key={section.id} id={section.id} className="mt-11 scroll-mt-24">
              <h2 className="font-display text-[22px] leading-[1.25] font-bold tracking-[-.018em]">
                {section.h}
              </h2>

              {section.body.map((paragraph) => (
                <p
                  key={paragraph}
                  className="text-fg-muted mt-3.5 text-[15px] leading-[1.7] text-pretty"
                >
                  {paragraph}
                </p>
              ))}

              {section.rows === undefined ? null : (
                /* The table scrolls inside its own box. A three-column table of
                   recipients on a 360px screen is wider than the viewport, and
                   letting it widen the document gives every clause below it a
                   horizontal scrollbar — the same fix `[data-cmp]` needed. */
                <div className="mt-5 overflow-x-auto print:break-inside-avoid">
                  <table className="w-full min-w-[420px] border-collapse text-left text-[14px]">
                    {section.head === undefined ? null : (
                      <thead>
                        <tr>
                          {section.head.map((cell) => (
                            <th
                              key={cell}
                              scope="col"
                              className="text-fg-subtle tracking-caps border-b pb-2 text-xs font-semibold uppercase"
                            >
                              {cell}
                            </th>
                          ))}
                        </tr>
                      </thead>
                    )}
                    <tbody>
                      {section.rows.map((row) => (
                        <tr key={row.join('|')} className="align-top">
                          {row.map((cell, column) => (
                            <td
                              key={`${String(column)}-${cell}`}
                              className={`border-b py-3 pr-5 leading-[1.55] ${
                                column === 0 ? 'text-fg font-medium' : 'text-fg-muted'
                              }`}
                            >
                              {cell}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {section.after?.map((paragraph) => (
                <p
                  key={paragraph}
                  className="text-fg-muted mt-3.5 text-[15px] leading-[1.7] text-pretty"
                >
                  {paragraph}
                </p>
              ))}

              {section.links === undefined ? null : (
                <div className="mt-4 flex flex-wrap gap-2">
                  {section.links.map((link) => (
                    <Link
                      key={link.href}
                      data-btn-quiet
                      data-press
                      href={link.href}
                      className="border-border-strong bg-surface text-fg inline-flex h-9 items-center rounded-[9px] border px-3.5 text-[13px] font-semibold"
                    >
                      {link.label}
                    </Link>
                  ))}
                </div>
              )}
            </section>
          ))}
        </article>
      </div>
    </section>
  );
}
