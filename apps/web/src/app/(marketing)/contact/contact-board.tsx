'use client';

import { useLocale } from 'next-intl';
import { useState } from 'react';
import { flash } from '@restaurant/ui';

import { CONTACT, CONTACT_TEL } from '@/lib/constants';
import type { Locale } from '@/i18n';

import { pagesCopy } from '../pages-copy';
import { PageHead } from '../page-ui';
import { submitLead } from './submit-lead';

/**
 * Contact — `Sayt v2.dc.html:705-795`.
 *
 * Three steps down the left so a reader knows what happens after they press
 * send, four copyable contact rows, and the lead form with its success state.
 * The site had a dark call-to-action band with a phone number on it.
 *
 * ---------------------------------------------------------------------------
 * The form is the top of the funnel, and it is kept now
 *
 * It used to validate, show the success panel and forget everything typed into
 * it — a funnel with no top. `POST /api/v1/public/leads` writes a `crm.leads`
 * row an operator works from a console screen, and CLAUDE.md makes that the
 * only way a restaurant joins: "restoran `#contact` orqali keladi, tenant'ni
 * operator ochadi".
 *
 * It goes through this app's own route handler rather than straight to Laravel,
 * for the reasons every public write does — the idempotency key the `tenant`
 * middleware group demands, the tenant that is not in this URL, and the 419 a
 * browser→Laravel call earns from `SANCTUM_STATEFUL_DOMAINS`.
 *
 * **A failure keeps the reader's work.** The success panel is only drawn when
 * the row landed; anything else says so and leaves every field filled in, so
 * pressing send again is one tap rather than retyping a form. A lead lost
 * silently is worse than a form that admits it did not go.
 *
 * The reference is derived from the phone number, not random: `Math.random()`
 * would give a different string on the server and the client and produce a
 * hydration mismatch, and a reference nobody can look up twice is not a
 * reference.
 */
export function ContactBoard() {
  const locale = useLocale() as Locale;
  const t = pagesCopy(locale);

  const [name, setName] = useState('');
  const [restaurant, setRestaurant] = useState('');
  const [phone, setPhone] = useState('');
  const [branches, setBranches] = useState(0);
  const [when, setWhen] = useState(0);
  const [message, setMessage] = useState('');
  const [sent, setSent] = useState<string | null>(null);
  /* Stops the second press, not to draw a spinner: the server keeps one live
     enquiry per number per day, so a double tap is answered as a duplicate and
     reads as a bug from this side. */
  const [sending, setSending] = useState(false);

  /* Nine digits or more, once the punctuation is stripped — the same rule the
     booking form on the restaurant site uses. */
  const phoneOk = phone.replace(/[^\d]/g, '').length >= 9;
  const ready = name.trim().length > 1 && restaurant.trim().length > 1 && phoneOk;

  /*
   * Four rows, and the fourth is the office — `dc.html:1547`.
   *
   * It was the opening hours, which is the one line of the four a reader
   * cannot do anything with: there is nothing to copy, nowhere to go, and the
   * Copy button beside it put "Har kuni, 9:00–21:00" on the clipboard. The
   * design's fourth row is an address, which is what the label above it
   * ("Ofis") has said all along. The hours are still on the site — they are a
   * line of the dark call-to-action band on the other six pages.
   */
  const rows = [
    { value: CONTACT.phone, href: CONTACT_TEL },
    { value: CONTACT.telegram, href: CONTACT.telegramUrl },
    { value: CONTACT.email, href: `mailto:${CONTACT.email}` },
    /* The address comes from `CONTACT` rather than the catalogue: it is the
       same fact in three languages, and a company that moves should change it
       in one place, not in three copies of the site's prose. */
    { value: CONTACT.office[locale], href: null },
  ];

  /* Said while typing, in the design's three states — `dc.html:1651`. A number
     one digit short is the single most common reason a lead is never called
     back, and "9+" beside a red border said nothing about which digit. */
  const digits = phone.replace(/[^\d]/g, '');
  const phoneHint =
    phone === ''
      ? { text: t.page.conPhoneHintEmpty, tone: 'text-fg-subtle' }
      : phoneOk
        ? { text: t.page.conPhoneHintOk, tone: 'text-success-700' }
        : { text: `${digits.length}${t.page.conPhoneHintShort}`, tone: 'text-danger-600' };

  return (
    <section data-pagetop className="pt-[76px] pb-[96px]">
      <div data-wrap>
        <div data-two className="grid grid-cols-[1fr_480px] items-start gap-14">
          <div>
            <PageHead eyebrow={t.page.nContact} title={t.page.conH} lede={t.page.conP} size={42} />

            <div className="mt-9 grid gap-5">
              {t.steps.map((step, index) => (
                <div key={step.title} className="flex items-start gap-4">
                  <span className="bg-brand-50 text-brand-700 font-display grid size-[30px] flex-none place-items-center rounded-full text-[13px] font-bold">
                    {index + 1}
                  </span>
                  <div>
                    <div className="text-[16px] font-semibold tracking-[-.01em]">{step.title}</div>
                    <div className="text-fg-muted mt-1 text-[14px] leading-[1.6] text-pretty">
                      {step.body}
                    </div>
                    <div className="text-brand-600 mt-1.5 text-xs font-semibold">{step.when}</div>
                  </div>
                </div>
              ))}
            </div>

            <div className="bg-border border-border mt-9 grid gap-px overflow-hidden rounded-[14px] border">
              {rows.map((row, index) => (
                <div
                  key={row.value}
                  className="bg-surface flex flex-wrap items-center justify-between gap-4 px-5 py-4"
                >
                  <div>
                    <div className="text-fg-subtle text-xs font-semibold tracking-wide uppercase">
                      {t.contactRows[index]?.label}
                    </div>
                    {row.href === null ? (
                      <div data-num className="mt-0.5 text-[16px] font-semibold">
                        {row.value}
                      </div>
                    ) : (
                      <a
                        href={row.href}
                        data-num
                        className="mt-0.5 block text-[16px] font-semibold"
                      >
                        {row.value}
                      </a>
                    )}
                  </div>

                  {/*
                   * Copy, and it really copies. The clipboard API is the whole
                   * feature: on a laptop this row is read and then retyped into
                   * a phone, and a "Copy" button that only looked like one
                   * would be the most annoying possible thing on the page.
                   */}
                  <button
                    type="button"
                    data-press
                    onClick={() => {
                      void navigator.clipboard?.writeText(row.value);
                      flash(t.contactRows[index]?.copied ?? t.page.conCopy);
                    }}
                    className="border-border-strong bg-surface text-fg-muted hover:bg-bg-muted h-[34px] flex-none rounded-[9px] border px-3.5 text-[13px] font-semibold whitespace-nowrap"
                  >
                    {t.page.conCopy}
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* ------------------------------------------------------- form */}
          <div className="border-border bg-surface rounded-[18px] border p-[30px] shadow-lg">
            {sent === null ? (
              <form
                onSubmit={async (event) => {
                  event.preventDefault();

                  /* The design says which field is wrong rather than leaving a
                     grey button unexplained — `dc.html:1668`. */
                  if (name.trim().length < 2) {
                    flash.problem(t.page.conNeedName);

                    return;
                  }

                  if (restaurant.trim().length < 2) {
                    flash.problem(t.page.conNeedRest);

                    return;
                  }

                  if (!phoneOk) {
                    flash.problem(t.page.conNeedPhone);

                    return;
                  }

                  if (sending) return;
                  setSending(true);

                  const landed = await submitLead({
                    name: name.trim(),
                    phone: phone.trim(),
                    restaurant: restaurant.trim(),
                    /*
                     * The two chip rows travel inside the message rather than as
                     * columns of their own. `crm.leads` has no `branches` or
                     * `when` field and should not: they are this page's
                     * questions, an operator reads them once on the phone, and a
                     * column per marketing question is a migration per campaign.
                     */
                    message: [
                      `${t.page.conBranches}: ${t.branchOptions[branches] ?? ''}`,
                      `${t.page.conWhen}: ${t.whenOptions[when] ?? ''}`,
                      message.trim(),
                    ]
                      .filter((line) => line.trim() !== '')
                      .join('\n'),
                    locale,
                  });

                  setSending(false);

                  if (!landed.ok) {
                    // Every field stays filled in: a lead the reader has to
                    // retype is a lead that does not come back.
                    flash.problem(landed.message ?? t.page.conNeedPhone);

                    return;
                  }

                  const reference = `SR-${digits.slice(-4)}`;

                  setSent(reference);
                  flash(`${t.page.conSentBefore}${reference}`);
                }}
              >
                <div className="font-display text-[22px] font-bold tracking-[-.02em]">
                  {t.page.conFormH}
                </div>
                <p className="text-fg-subtle mt-1.5 text-[14px] leading-[1.5]">{t.page.conFormP}</p>

                <Field label={t.page.conName}>
                  <input
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    /* A placeholder, not an example customer: the same three
                       invented names were presented as testimonials elsewhere
                       on this site, and a name here reads as one more of them. */
                    placeholder={t.page.conNamePlaceholder}
                    required
                    className="border-border-strong bg-surface h-11 w-full rounded-[10px] border px-3.5 text-[15px]"
                  />
                </Field>

                <Field label={t.page.conRest}>
                  <input
                    value={restaurant}
                    onChange={(event) => setRestaurant(event.target.value)}
                    placeholder="Osh Xona"
                    required
                    className="border-border-strong bg-surface h-11 w-full rounded-[10px] border px-3.5 text-[15px]"
                  />
                </Field>

                <Field label={t.page.conPhone}>
                  <input
                    value={phone}
                    onChange={(event) => setPhone(event.target.value)}
                    placeholder="+998 90 123 45 67"
                    type="tel"
                    inputMode="tel"
                    required
                    data-num
                    className={`bg-surface h-11 w-full rounded-[10px] border px-3.5 text-[15px] ${
                      phone === '' || phoneOk ? 'border-border-strong' : 'border-danger-500'
                    }`}
                  />
                  <p className={`mt-1.5 text-xs ${phoneHint.tone}`}>{phoneHint.text}</p>
                </Field>

                <Field label={t.page.conBranches}>
                  <Chips options={t.branchOptions} value={branches} onChange={setBranches} />
                </Field>

                <Field label={t.page.conWhen}>
                  <Chips options={t.whenOptions} value={when} onChange={setWhen} />
                </Field>

                <Field label={t.page.conMsg}>
                  <textarea
                    value={message}
                    onChange={(event) => setMessage(event.target.value)}
                    placeholder={t.page.conMsgPh}
                    rows={3}
                    className="border-border-strong bg-surface w-full resize-y rounded-[10px] border px-3.5 py-3 text-[15px] leading-[1.5]"
                  />
                </Field>

                {/*
                 * Grey until it can be pressed, per the design. The button is
                 * not `disabled`: a disabled control gives no focus and no
                 * explanation, and a reader who cannot tell why is stuck. It
                 * simply does nothing until the three required fields are
                 * usable, and the phone field says what is wrong.
                 */}
                <button
                  type="submit"
                  data-press
                  aria-disabled={!ready}
                  className={`mt-5.5 h-12 w-full rounded-[12px] text-[15px] font-semibold text-white ${
                    ready ? 'bg-brand-500' : 'bg-fg-disabled cursor-not-allowed'
                  }`}
                >
                  {t.page.conSend}
                </button>

                <p className="text-fg-subtle mt-3 text-xs leading-[1.5]">{t.page.conNote}</p>
              </form>
            ) : (
              <div data-sheet className="px-1.5 py-6 text-center">
                <span className="bg-success-50 inline-flex size-13 items-center justify-center rounded-full">
                  <svg
                    width="24"
                    height="24"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="var(--success-600)"
                    strokeWidth="3"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden
                  >
                    <path d="M20 6 9 17l-5-5" />
                  </svg>
                </span>

                <div className="font-display mt-4.5 text-[22px] font-bold tracking-[-.02em]">
                  {t.page.conDoneH}
                </div>

                {/* The design answers by name and says what happens next —
                    `dc.html:1656`. This used to reprint step one of the three
                    steps in the left column, which the reader had just read. */}
                <p className="text-fg-muted mt-2.5 text-[15px] leading-[1.6] text-pretty">
                  {name.trim().split(' ')[0]}
                  {t.page.conDoneBody}
                </p>

                <div className="text-fg-subtle mt-4 font-mono text-[13px]">
                  {t.page.conRefBefore}
                  {sent}
                </div>

                <button
                  type="button"
                  onClick={() => setSent(null)}
                  className="border-border-strong bg-surface mt-6 h-[42px] rounded-[11px] border px-4.5 text-[14px] font-semibold"
                >
                  {t.page.conAgain}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="mt-4 block">
      <span className="mb-1.5 block text-[13px] font-semibold">{label}</span>
      {children}
    </label>
  );
}

function Chips({
  options,
  value,
  onChange,
}: {
  options: readonly string[];
  value: number;
  onChange: (next: number) => void;
}) {
  return (
    <span className="flex flex-wrap gap-2">
      {options.map((option, index) => (
        <button
          key={option}
          type="button"
          data-press
          aria-pressed={index === value}
          onClick={() => onChange(index)}
          className={`h-[38px] rounded-[10px] border px-3.5 text-[14px] font-semibold ${
            index === value
              ? 'border-brand-500 bg-brand-50 text-brand-700'
              : 'border-border bg-surface text-fg-muted'
          }`}
        >
          {option}
        </button>
      ))}
    </span>
  );
}
