'use client';

import { useState } from 'react';

import { flash } from '@restaurant/ui';

import { som } from '../../../(guest)/guest-session';
import { merchantCopy } from '../../merchant-copy';
import {
  BANK_ROWS,
  BANK_VERIFIED,
  MERCHANT_EMPTY,
  say,
  SETTLEMENT_ACTIONS,
  SETTLEMENT_BREAKDOWN,
  SETTLEMENT_COLUMNS,
  SETTLEMENT_HISTORY,
  type SettlementRow,
  SETTLEMENT_STATE,
  SETTLEMENT_WHEN,
  type Lang,
  type Trilingual,
} from '../../merchant-data';
import type { MerchantPayout } from '../../merchant-server';
import { BankSheet } from '../../merchant-sheets';

/**
 * The three states a payout account can be in, in words.
 *
 * `BANK_VERIFIED` is the design's own and covers one of them. The other two had
 * no words because the design drew a verified account and nothing else — and
 * "pending review" is the state that matters most, because it is the one where
 * Thursday does not pay.
 */
const PAYOUT_STATE: Readonly<Record<MerchantPayout['state'], Trilingual>> = {
  verified: BANK_VERIFIED,
  pending_review: {
    uz: 'Tekshiruvda · to‘lov to‘xtatilgan',
    ru: 'На проверке · выплаты приостановлены',
    en: 'Under review · payouts paused',
  },
  incomplete: {
    uz: 'To‘ldirilmagan · to‘lov yo‘q',
    ru: 'Не заполнено · выплат нет',
    en: 'Not filled in · no payouts',
  },
};

const PAYOUT_TONE: Readonly<Record<MerchantPayout['state'], string>> = {
  verified: 'text-success-700',
  pending_review: 'text-warning-700',
  incomplete: 'text-danger-600',
};

/** The two documents, and the one row that is not a document at all. */
const DOCUMENT_OF: Readonly<Record<string, 'invoice' | 'act' | undefined>> = {
  invoice: 'invoice',
  statement: 'act',
};

/** Said once when a button is pressed on a panel with no session behind it. */
const NO_STATEMENT: Trilingual = {
  uz: 'Namunaviy hisob-kitob · hujjat yo‘q',
  ru: 'Демонстрационный расчёт · документа нет',
  en: 'A sample settlement · there is no document',
};

/**
 * Payouts — `Do'kon paneli.dc.html:301-359`.
 *
 * The next payout at 40px, the four lines that got it there, the bank account
 * it lands in, and **six weeks of history in six columns** — the part that was
 * missing. A settlement screen with no history cannot answer the only question
 * a merchant asks it twice a month: "was last Thursday paid, and for how much?"
 * Period, invoice number, gross, fee, net and state, because the invoice number
 * is what a merchant matches against their accountant's copy.
 *
 * The three actions were drawn dimmed and inert. Two of them are downloads and
 * the third opens the bank sheet; none of them can reach a settlement service
 * that does not exist, so they confirm what they would produce — the design's
 * own filename included — and say it once rather than refusing three times.
 */
export function SettlementBoard({
  lang,
  rows = SETTLEMENT_HISTORY,
  payout = null,
  pending = null,
  live = false,
}: {
  lang: Lang;
  /** Issued statements, read through `merchant-server.ts`. */
  rows?: readonly SettlementRow[];
  /**
   * The week still running, from `meta.pending` — gross, commission, payable.
   *
   * The endpoint has always answered it and this board never took it: the block
   * was `SETTLEMENT_BREAKDOWN`, so a merchant opening the screen they check
   * they were paid on read a 24 180 000 turnover and a 2 176 200 commission
   * belonging to the design, above a live history.
   */
  pending?: { orders: number; gross: number; commission: number; payable: number } | null;
  /** Where the money lands, and whether the platform has confirmed it. */
  payout?: MerchantPayout | null;
  /**
   * Whether these rows are this restaurant's or the design's sample.
   *
   * Marked rather than left to be guessed at: a payout screen showing invented
   * figures as real is a merchant reconciling a bank account against nothing.
   */
  live?: boolean;
}) {
  const money = (tiyin: number) => som(tiyin, lang);
  const t = merchantCopy(lang);

  const [bankOpen, setBankOpen] = useState(false);

  /*
   * The running week, in the design's own four-line shape.
   *
   * Built from `meta.pending` when the platform sent one, so the commission
   * line carries the rate this merchant actually pays rather than the fixture's
   * nine per cent. The two rows the payload has no column for — dispute
   * withholdings and advertising — are not invented: the payable figure is the
   * server's and already accounts for whatever it accounts for.
   */
  const breakdown =
    pending === null
      ? SETTLEMENT_BREAKDOWN
      : [
          { ...SETTLEMENT_BREAKDOWN[0]!, amount: pending.gross },
          { ...SETTLEMENT_BREAKDOWN[1]!, amount: pending.commission },
          {
            ...SETTLEMENT_BREAKDOWN[SETTLEMENT_BREAKDOWN.length - 1]!,
            amount: pending.payable,
          },
        ];

  const net = breakdown.at(-1);

  /*
   * The statement the two document buttons open.
   *
   * The newest issued one — which is the week a merchant is holding an invoice
   * for when they open this screen. `null` on a panel drawing the design's
   * history, because those six rows carry invented invoice numbers and no key:
   * a link built from one would open somebody else's week or nothing at all.
   */
  const statementId = rows.find((row) => row.id !== undefined)?.id ?? null;

  /* The design's four rows, filled in from the account the platform holds. */
  const bankRows =
    payout === null
      ? BANK_ROWS
      : [
          { label: BANK_ROWS[0]!.label, value: payout.bankName, mono: false },
          {
            label: BANK_ROWS[1]!.label,
            // The last four and nothing more: twenty digits saying where a
            // business's money goes do not need to be readable over a shoulder,
            // and four are enough to recognise your own account.
            value: payout.accountLast4 === '' ? '—' : `···· ${payout.accountLast4}`,
            mono: true,
          },
          { label: BANK_ROWS[2]!.label, value: payout.inn, mono: true },
          { label: BANK_ROWS[3]!.label, value: '', mono: false },
        ];

  return (
    <>
      {/*
        The whole screen, marked when it is drawing the design's sample rather
        than this restaurant's rows. On the wrapper rather than on one card,
        because "these figures are not yours" is true of everything below it —
        and a merchant panel that quietly shows six invented orders is a
        merchant cooking six dinners nobody ordered.
      */}
      <div data-demo={live ? undefined : ''} className="contents">
        <div className="grid gap-4 lg:grid-cols-[1.5fr_1fr]">
          <section className="border-border bg-surface rounded-[14px] border px-6 py-5">
            <p className="text-fg-subtle text-xs">{t.text.setNext}</p>

            {/*
             * The next payout, at 40px. It is the number a merchant opens this
             * panel for, and everything under it exists to explain how it was
             * arrived at — which is the reason the breakdown is on the same card
             * rather than a click away.
             */}
            <p
              data-num
              className="font-display mt-1 text-[40px] leading-none font-bold tracking-tight"
            >
              {money(net?.amount ?? 0)}
            </p>

            <p data-num className="text-fg-muted mt-1.5 text-[13px]">
              {say(SETTLEMENT_WHEN, lang)}
            </p>

            <div className="border-divider mt-5 border-t pt-4.5">
              {breakdown.map((row) => (
                <div key={row.key} className="mb-2.5 flex items-baseline justify-between gap-3">
                  <span
                    className={`${row.strong ? 'text-[22px] font-bold' : 'text-[13px] font-medium'} ${
                      row.negative ? 'text-danger-600' : row.strong ? '' : 'text-fg-muted'
                    }`}
                  >
                    {say(row.label, lang)}
                  </span>
                  <span
                    data-num
                    className={`flex-none ${
                      row.strong ? 'font-display text-[22px] font-bold' : 'text-[13px] font-medium'
                    } ${row.negative ? 'text-danger-600' : row.strong ? '' : 'text-fg-muted'}`}
                  >
                    {row.negative ? '− ' : ''}
                    {money(row.amount)}
                  </span>
                </div>
              ))}
            </div>

            <p className="border-divider text-fg-subtle mt-3.5 border-t pt-3.5 text-xs leading-relaxed">
              {t.text.setNote}
            </p>
          </section>

          <div className="grid content-start gap-3">
            <div className="border-border bg-surface rounded-[14px] border px-5 py-4.5">
              <p className="text-fg-subtle tracking-caps text-[11px] font-semibold uppercase">
                {t.text.setBank}
              </p>

              {bankRows.map((row) => (
                <div
                  key={row.value + say(row.label, lang)}
                  className="mt-2.5 flex items-baseline justify-between gap-3"
                >
                  <span className="text-fg-subtle flex-none text-[13px]">
                    {say(row.label, lang)}
                  </span>
                  <span
                    data-num
                    className={`min-w-0 truncate text-right text-[13px] font-medium ${
                      row.mono ? 'font-mono' : ''
                    } ${row.value === '' && payout !== null ? PAYOUT_TONE[payout.state] : ''}`}
                  >
                    {/*
                     * The design's last row has an empty value on purpose: it
                     * is the STATE, and the state is a word rather than a
                     * figure. It says "verified" only when the platform says
                     * so — a merchant reading that over an account still in the
                     * queue waits for a Thursday that will not pay.
                     */}
                    {row.value === ''
                      ? say(payout === null ? BANK_VERIFIED : PAYOUT_STATE[payout.state], lang)
                      : row.value}
                  </span>
                </div>
              ))}
            </div>

            <div className="border-border bg-surface rounded-[14px] border px-5 py-4.5">
              <p className="text-fg-subtle tracking-caps mb-3 text-[11px] font-semibold uppercase">
                {t.text.setActs}
              </p>

              <div className="grid gap-2">
                {SETTLEMENT_ACTIONS.map((action) => {
                  const shape =
                    'grid h-10 w-full place-items-center rounded-[10px] border border-border-strong text-fg text-[13px] font-semibold';

                  if (action.key === 'bank') {
                    return (
                      <button
                        key={action.key}
                        type="button"
                        onClick={() => setBankOpen(true)}
                        className={shape}
                      >
                        {say(action.label, lang)}
                      </button>
                    );
                  }

                  /*
                   * A link, not a download and not a toast.
                   *
                   * These two used to confirm a PDF that was never produced,
                   * because a settlement service did not exist. It does now,
                   * and the honest deliverable is the printable sheet the
                   * documents surface already renders every other document on:
                   * `?d=settlement&id=…` opens THIS week's statement with its
                   * order lines, its placements and the account it pays into,
                   * and the browser's own print dialogue puts it on A4.
                   *
                   * The PDF pipeline is genuinely absent — a signed archival
                   * file is a different product — but a page that prints is
                   * what a merchant hands to an accountant today.
                   */
                  const which = DOCUMENT_OF[action.key];

                  if (statementId === null || which === undefined) {
                    return (
                      <button
                        key={action.key}
                        type="button"
                        onClick={() => flash.problem(say(NO_STATEMENT, lang))}
                        className={shape}
                      >
                        {say(action.label, lang)}
                      </button>
                    );
                  }

                  return (
                    <a
                      key={action.key}
                      href={`/documents?d=settlement&id=${statementId}&sheet=${which}`}
                      target="_blank"
                      rel="noreferrer"
                      className={shape}
                    >
                      {say(action.label, lang)}
                    </a>
                  );
                })}
              </div>
            </div>
          </div>
        </div>

        {/* ------------------------------------------------------- history */}
        <p className="text-fg-subtle tracking-caps mt-6 mb-2.5 text-xs font-semibold uppercase">
          {t.text.setHistory}
        </p>

        <div className="border-border bg-surface overflow-x-auto rounded-[14px] border">
          <div className="min-w-[860px]">
            <div className="bg-bg-muted border-border text-fg-subtle text-2xs tracking-caps grid grid-cols-[140px_minmax(0,1fr)_120px_120px_120px_110px] gap-3 border-b px-4.5 py-3 font-semibold uppercase">
              {SETTLEMENT_COLUMNS.map((column, index) => (
                <span key={column.key} className={index >= 2 ? 'text-right' : ''}>
                  {say(column.label, lang)}
                </span>
              ))}
            </div>

            {rows.length === 0 ? (
              <p className="text-fg-subtle px-4.5 py-9 text-center text-[13px]">
                {say(MERCHANT_EMPTY.settlements, lang)}
              </p>
            ) : null}

            {rows.map((row) => (
              <div
                key={row.invoice}
                className="border-divider grid grid-cols-[140px_minmax(0,1fr)_120px_120px_120px_110px] items-center gap-3 border-b px-4.5 py-3 last:border-0"
              >
                <span data-num className="text-[13px] font-medium">
                  {row.period}
                </span>
                <span data-num className="text-fg-muted truncate font-mono text-xs">
                  {row.invoice}
                </span>
                <span data-num className="text-fg-muted text-right text-[13px]">
                  {money(row.gross)}
                </span>
                <span data-num className="text-danger-600 text-right text-[13px]">
                  − {money(row.fee)}
                </span>
                <span data-num className="text-right text-[13px] font-semibold">
                  {money(row.gross - row.fee)}
                </span>
                <span className="flex justify-end">
                  <span
                    className={`rounded-pill px-2.5 py-[3px] text-[11px] font-bold ${
                      row.state === 'due'
                        ? 'bg-brand-50 text-brand-700'
                        : 'bg-success-50 text-success-700'
                    }`}
                  >
                    {say(SETTLEMENT_STATE[row.state], lang)}
                  </span>
                </span>
              </div>
            ))}
          </div>
        </div>

        {bankOpen ? (
          <BankSheet lang={lang} payout={payout} onClose={() => setBankOpen(false)} />
        ) : null}
      </div>
    </>
  );
}
