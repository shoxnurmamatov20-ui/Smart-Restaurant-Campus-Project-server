'use client';

import { useLocale } from 'next-intl';
import { useState } from 'react';

import type { Locale } from '@/i18n';

import { pagesCopy } from '../pages-copy';
import { PAGE_ROLES } from '../pages-data';
import { PageHead } from '../page-ui';

/**
 * Who sees what — `Sayt v2.dc.html:407-464`.
 *
 * Nine roles, each opening onto two columns: what the role can do and what it
 * cannot. The **cannot** column is the reason this page exists. A restaurant
 * owner buying a till system is not asking what a waiter can do; they are
 * asking whether a waiter can void a paid bill, and every system's marketing
 * answers the first question.
 *
 * The home page carried a seven-role summary that claimed eight in its own
 * copy. Nine is the number — `apps/web/src/lib/roles.ts` has had nine since the
 * order operator was added, and `DesignRoleMatrixTest` checks the server agrees.
 *
 * One open at a time, and the first opens by default — a page of nine closed
 * rows tells a reader nothing about what is inside them.
 */
export function RolesBoard() {
  const locale = useLocale() as Locale;
  const t = pagesCopy(locale);
  const [open, setOpen] = useState<string | null>(PAGE_ROLES[0]?.id ?? null);

  return (
    <section data-pagetop className="pt-[76px] pb-[96px]">
      <div data-wrap>
        <PageHead eyebrow={t.page.nRoles} title={t.page.rolH} lede={t.page.rolP} />

        <div className="mt-11 grid gap-3">
          {PAGE_ROLES.map((role, index) => {
            const words = t.roles[index];
            const expanded = open === role.id;

            if (words === undefined) return null;

            return (
              <div
                key={role.id}
                /* `--brand-300` open, not `--brand-500` — `dc.html:1304`.
                   The full-strength border made an opened row look selected
                   rather than expanded, which on a page of nine reads as "this
                   is the role you are", and a reader opening a second one
                   expects the first to have been wrong. */
                className={`bg-surface overflow-hidden rounded-[14px] border ${
                  expanded ? 'border-brand-300' : 'border-border'
                }`}
              >
                <button
                  type="button"
                  aria-expanded={expanded}
                  onClick={() => setOpen(expanded ? null : role.id)}
                  className="hover:bg-bg-subtle flex w-full items-center gap-4 px-[22px] py-5 text-left"
                >
                  <span
                    className={`grid size-[38px] flex-none place-items-center rounded-full text-[13px] font-bold ${
                      expanded ? 'bg-brand-50 text-brand-700' : 'bg-bg-muted text-fg-muted'
                    }`}
                  >
                    {role.initials}
                  </span>

                  <span className="min-w-0 flex-1">
                    <span className="block text-[16px] font-semibold tracking-[-.01em]">
                      {words.title}
                    </span>
                    <span className="text-fg-subtle mt-0.5 block text-[13px]">{words.short}</span>
                  </span>

                  <span
                    data-hidesm
                    className="bg-bg-muted text-fg-muted flex-none rounded-full px-[11px] py-[5px] text-xs font-semibold whitespace-nowrap"
                  >
                    {words.device}
                  </span>

                  <span
                    aria-hidden
                    className="text-fg-subtle grid size-[22px] flex-none place-items-center text-[19px] leading-none"
                  >
                    {expanded ? '−' : '+'}
                  </span>
                </button>

                {expanded ? (
                  <div data-two className="grid grid-cols-2 gap-8 border-t px-[22px] pt-1 pb-6">
                    <div className="pt-5">
                      <div className="text-success-700 text-xs font-semibold tracking-wide uppercase">
                        {t.page.rolCan}
                      </div>
                      <div className="mt-3 grid gap-2.5">
                        {words.can.map((line) => (
                          <div key={line} className="flex items-start gap-2.5">
                            <svg
                              width="13"
                              height="13"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="var(--success-600)"
                              strokeWidth="3.2"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              aria-hidden
                              className="mt-1 flex-none"
                            >
                              <path d="M20 6 9 17l-5-5" />
                            </svg>
                            <span className="text-[14px] leading-[1.55]">{line}</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="pt-5">
                      <div className="text-fg-subtle text-xs font-semibold tracking-wide uppercase">
                        {t.page.rolCant}
                      </div>
                      <div className="mt-3 grid gap-2.5">
                        {words.cannot.map((line) => (
                          <div key={line} className="flex items-start gap-2.5">
                            {/* A dash, not a cross. "Cannot" here means the
                                screen is not theirs, which is a boundary rather
                                than a refusal — a red X would read as an error
                                the reader had caused. */}
                            <svg
                              width="13"
                              height="13"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="var(--fg-disabled)"
                              strokeWidth="3"
                              strokeLinecap="round"
                              aria-hidden
                              className="mt-1 flex-none"
                            >
                              <path d="M5 12h14" />
                            </svg>
                            <span className="text-fg-muted text-[14px] leading-[1.55]">{line}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>

        {/*
         * The sentence that keeps the page honest: a hidden module is not a
         * forbidden one. The sidebar is visibility; the boundary is the
         * server's permission check, and `DesignRoleMatrixTest` is what proves
         * the two agree.
         */}
        <div className="border-border bg-bg-subtle mt-8 flex items-start gap-3.5 rounded-[14px] border px-[22px] py-5">
          <span aria-hidden className="bg-brand-500 mt-[7px] size-2 flex-none rounded-full" />
          <p className="text-fg-muted text-[14px] leading-[1.6] text-pretty">{t.page.rolNote}</p>
        </div>
      </div>
    </section>
  );
}
