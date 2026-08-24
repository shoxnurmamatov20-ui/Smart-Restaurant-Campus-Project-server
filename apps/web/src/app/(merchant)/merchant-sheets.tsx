'use client';

import { useState, type ReactNode } from 'react';

import { flash } from '@restaurant/ui';

import { post } from '@/lib/console-post';

import { som } from '../(guest)/guest-session';
import { merchantCopy } from './merchant-copy';
import {
  BANK_TEXT,
  CLOSE,
  NOT_SAVED,
  PROMO_BUDGET,
  PROMO_TEXT,
  REJECT_REASONS,
  REJECT_TITLE,
  RECEIPT_STAMP,
  RECEIPT_TITLE,
  say,
  SETTLEMENT_ACTION_FLASH,
  type Lang,
  type MerchantQueueOrder,
  type Trilingual,
  feeOf,
} from './merchant-data';

/**
 * The merchant panel's sheets — `Do'kon paneli.dc.html:626-820`.
 *
 * Five of them, and every one exists because the merchant is about to commit to
 * something the screen behind it cannot state fully: a rejection carries a
 * penalty, a receipt is the evidence in a dispute, a budget buys a number of
 * orders, cancelling a promotion returns money.
 *
 * Two of these — reject and receipt — had their copy sitting in
 * `merchant-copy.ts` since the panel was built and were called from nowhere.
 * The reject one is the more serious: the queue's "Rad etish" button set the
 * order to declined with no reason and no warning, so a merchant could push
 * their rejection rate past the 3% that drops them in search without ever being
 * told there was a rate.
 */

/* --------------------------------------------------------------- the frame */

export function MerchantSheet({
  lang,
  title,
  sub,
  onClose,
  children,
}: {
  lang: Lang;
  title: string;
  sub: string;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <>
      <button
        type="button"
        data-scrim
        aria-label={say(CLOSE, lang)}
        onClick={onClose}
        className="fixed inset-0 z-[120] cursor-default bg-[rgba(15,19,32,.42)]"
      />

      <div
        data-sheet
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="bg-surface border-border fixed top-1/2 left-1/2 z-[121] max-h-[86vh] w-[min(94vw,460px)] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-[20px] border px-7 pt-[26px] pb-6 shadow-xl"
      >
        <div className="flex items-start justify-between gap-3.5">
          <div className="min-w-0">
            <p className="font-display text-xl leading-tight font-bold tracking-tight">{title}</p>
            <p className="text-fg-muted mt-1.5 text-[13px] leading-normal">{sub}</p>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label={say(CLOSE, lang)}
            className="border-border bg-surface text-fg-muted grid size-8 flex-none place-items-center rounded-[9px] border"
          >
            <svg
              width="15"
              height="15"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              aria-hidden
            >
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        {children}
      </div>
    </>
  );
}

function Mark({ on }: { on: boolean }) {
  return (
    <span
      aria-hidden
      className={`mt-px grid size-[19px] flex-none place-items-center rounded-full border-[1.5px] text-[10px] font-bold text-white ${
        on ? 'border-brand-500 bg-brand-500' : 'border-border-strong'
      }`}
    >
      {on ? '✓' : ''}
    </span>
  );
}

/* -------------------------------------------------------------- rejection */

/** `rejSend` refuses without a reason — `Do'kon paneli.dc.html:1240`. */
const REJECT_PICK = {
  uz: 'Avval sababni tanlang',
  ru: 'Сначала выберите причину',
  en: 'Pick a reason first',
} as const;

export function RejectSheet({
  lang,
  order,
  onReject,
  onClose,
}: {
  lang: Lang;
  /*
   * The order itself, not its id. This looked the id up in `MERCHANT_ORDERS`,
   * which finds nothing once the queue is a real restaurant's — so the sheet
   * that carries the 3% penalty warning was printing it over a blank line where
   * the order number and the amount belong.
   */
  order: MerchantQueueOrder;
  /** The chosen reason's key, for `reject_reason` — see the queue board. */
  onReject: (why: string) => void;
  onClose: () => void;
}) {
  const t = merchantCopy(lang);
  const [why, setWhy] = useState<string | null>(null);

  const sub = `${order.number} · ${som(order.gross, lang)}`;

  return (
    <MerchantSheet lang={lang} title={say(REJECT_TITLE, lang)} sub={sub} onClose={onClose}>
      <div className="mt-5 grid gap-2">
        {REJECT_REASONS.map((reason) => {
          const on = why === reason.key;

          return (
            <button
              key={reason.key}
              type="button"
              onClick={() => setWhy(reason.key)}
              className={`flex w-full items-start gap-3 rounded-xl border px-3.5 py-3.5 text-left ${
                on ? 'border-brand-500 bg-brand-50' : 'border-border'
              }`}
            >
              <Mark on={on} />
              <span className="min-w-0">
                <span className="block text-sm font-semibold">{say(reason.label, lang)}</span>
                {/* What the reason does to the catalogue, the store or the
                    guest. A reason list without consequences is a form. */}
                <span className="text-fg-muted mt-0.5 block text-xs leading-normal">
                  {say(reason.note, lang)}
                </span>
              </span>
            </button>
          );
        })}
      </div>

      {/* The 3% rate, said before the rejection rather than after it. */}
      <div className="border-warning-500/30 bg-warning-50 mt-4 flex items-start gap-2.5 rounded-xl border px-3.5 py-3">
        <span aria-hidden className="bg-warning-500 mt-1.5 size-1.5 flex-none rounded-full" />
        <span className="text-warning-700 text-xs leading-normal font-medium">
          {t.text.rejWarn}
        </span>
      </div>

      <button
        type="button"
        onClick={() => {
          if (why === null) {
            flash.problem(say(REJECT_PICK, lang));
            return;
          }

          onReject(why);
          onClose();
        }}
        className={`mt-4 h-[46px] w-full rounded-xl text-sm font-semibold text-white ${
          why === null ? 'bg-border-strong' : 'bg-danger-500'
        }`}
      >
        {t.text.rejSend}
      </button>
    </MerchantSheet>
  );
}

/* ---------------------------------------------------------------- receipt */

export function ReceiptSheet({
  lang,
  order,
  onClose,
}: {
  lang: Lang;
  /*
   * As above, and here the fixture lookup was worse than a blank line: an id it
   * could not find returned `null`, so "Chekni ko'rish" opened nothing at all
   * on every order this restaurant actually took.
   */
  order: MerchantQueueOrder;
  onClose: () => void;
}) {
  const t = merchantCopy(lang);

  const cut = feeOf(order);

  return (
    <MerchantSheet
      lang={lang}
      title={say(RECEIPT_TITLE, lang)}
      sub={`${order.number} · ${say(RECEIPT_STAMP, lang)}`}
      onClose={onClose}
    >
      <div className="border-border bg-bg-muted mt-5 rounded-[14px] border px-4 py-4.5">
        {order.lines.map((line) => (
          <div
            key={say(line.name, lang)}
            className="flex items-baseline justify-between gap-3 py-1.5"
          >
            <span className="min-w-0 text-[13px]">
              <span data-num>{line.quantity} ×</span> {say(line.name, lang)}
            </span>
            <span data-num className="text-fg-muted flex-none font-mono text-[13px]">
              {som(line.amount, lang)}
            </span>
          </div>
        ))}

        <div className="border-border-strong my-2.5 border-t border-dashed" />

        {[
          { label: t.text.colGross, value: som(order.gross, lang), strong: false, tone: '' },
          {
            label: `${t.text.colFee} ${cut.percent}%`,
            value: `− ${som(cut.fee, lang)}`,
            strong: false,
            tone: 'text-danger-600',
          },
          {
            label: t.text.colNet,
            value: som(cut.net, lang),
            strong: true,
            tone: '',
          },
        ].map((row) => (
          <div key={row.label} className="flex items-baseline justify-between gap-3 py-1">
            <span
              className={`${row.strong ? 'text-[17px] font-bold' : 'text-fg-muted text-[13px]'} ${row.tone}`}
            >
              {row.label}
            </span>
            <span
              data-num
              className={`flex-none font-mono ${row.strong ? 'text-[17px] font-bold' : 'text-[13px]'} ${row.tone}`}
            >
              {row.value}
            </span>
          </div>
        ))}
      </div>

      <p className="text-fg-subtle mt-3.5 text-xs leading-relaxed">{t.text.rcpNote}</p>
    </MerchantSheet>
  );
}

/* ----------------------------------------------------------------- budget */

export function BudgetSheet({
  lang,
  budget,
  sub,
  onSave,
  onClose,
}: {
  lang: Lang;
  budget: number;
  /**
   * Which offer is being re-budgeted, in its own words.
   *
   * The design's line names one specific promotion — "free delivery over
   * 120 000 · 22–24 August" — because a sheet that spends money has to say what
   * it is spending it on. That is right for the specimen and wrong for every
   * real campaign, so the caller passes the offer it opened this for.
   */
  sub?: string;
  /** The new ceiling. The caller sends it and reports what the API said. */
  onSave: (next: number) => void;
  onClose: () => void;
}) {
  /* Edited in so‘m because that is what a merchant types; stored in tiyin. */
  const [draft, setDraft] = useState(String(Math.round(budget / 100)));

  const tiyin = (Number.parseInt(draft || '0', 10) || 0) * 100;
  const covers = Math.floor(tiyin / PROMO_BUDGET.sharePerOrder);

  return (
    <MerchantSheet
      lang={lang}
      title={say(PROMO_TEXT.budgetTitle, lang)}
      sub={sub ?? say(PROMO_TEXT.budgetSub, lang)}
      onClose={onClose}
    >
      <label htmlFor="mp-budget" className="mt-5 block text-[13px] font-semibold">
        {say(PROMO_TEXT.budgetLabel, lang)}
      </label>

      <input
        id="mp-budget"
        inputMode="numeric"
        value={draft}
        onChange={(event) => setDraft(event.target.value.replace(/\D/g, ''))}
        data-num
        className="border-border-strong bg-surface mt-2 h-11 w-full rounded-[11px] border px-3.5 text-[15px] font-semibold"
      />

      <div className="mt-2.5 flex gap-2">
        {[420_000, 840_000, 1_260_000].map((preset) => (
          <button
            key={preset}
            type="button"
            onClick={() => setDraft(String(preset))}
            data-num
            className="border-border bg-surface flex-1 rounded-[10px] border py-2 text-[13px] font-semibold"
          >
            {som(preset * 100, lang)}
          </button>
        ))}
      </div>

      {/* What the budget buys, recalculated as it is typed. The design's own
          arithmetic: budget ÷ 6 000 orders, each worth about 96 000. */}
      <div className="border-border mt-4 overflow-hidden rounded-[14px] border">
        {[
          {
            label: say(PROMO_TEXT.budgetShare, lang),
            value: som(PROMO_BUDGET.sharePerOrder, lang),
            tone: 'text-fg-muted',
          },
          { label: say(PROMO_TEXT.budgetCovers, lang), value: String(covers), tone: 'text-fg' },
          {
            label: say(PROMO_TEXT.budgetExtra, lang),
            value: som(covers * 96_000 * 100, lang),
            tone: 'text-success-700',
          },
        ].map((row) => (
          <div
            key={row.label}
            className="border-divider flex items-baseline justify-between gap-3 border-b px-4 py-3 last:border-0"
          >
            <span className="text-fg-muted text-[13px]">{row.label}</span>
            <span data-num className={`flex-none text-[13px] font-semibold ${row.tone}`}>
              {row.value}
            </span>
          </div>
        ))}
      </div>

      <button
        type="button"
        onClick={() => {
          if (tiyin < PROMO_BUDGET.minimum) {
            flash.problem(say(PROMO_TEXT.budgetTooSmall, lang));
            return;
          }

          /*
           * The sheet closes and the caller reports.
           *
           * It used to confirm here, which was the only thing it could do: the
           * module published `GET` and `POST` and neither can re-budget an
           * offer that already exists. `PATCH /api/v1/marketplace/promotions/
           * {promotion}` now can, and only the caller knows whether the
           * platform accepted the new ceiling — `marketplace.budget_below_spend`
           * refuses one under what the campaign has already paid out. A toast
           * fired from in here would say "saved" over a refusal.
           */
          onSave(tiyin);
          onClose();
        }}
        className="bg-brand-500 mt-4 h-[46px] w-full rounded-xl text-sm font-semibold text-white"
      >
        {say(PROMO_TEXT.budgetSave, lang)}
      </button>
    </MerchantSheet>
  );
}

/* -------------------------------------------------- cancelling a promotion */

export function CancelPromoSheet({
  lang,
  budget,
  spent = 0,
  sub,
  onCancel,
  onClose,
}: {
  lang: Lang;
  /** Tiyin the merchant gets back — the ceiling minus what it has paid out. */
  budget: number;
  /**
   * Tiyin already spent, which the design's specimen draws as zero.
   *
   * Zero is true of an offer that has not started and false of every other
   * one, and this sheet is the last screen before the money stops moving: a
   * merchant told they will be refunded a budget that has half gone cancels a
   * campaign expecting a number that will not arrive.
   */
  spent?: number;
  /** Which offer, in its own words — see `BudgetSheet`. */
  sub?: string;
  onCancel: () => void;
  onClose: () => void;
}) {
  return (
    <MerchantSheet
      lang={lang}
      title={say(PROMO_TEXT.cancelTitle, lang)}
      sub={sub ?? say(PROMO_TEXT.cancelSub, lang)}
      onClose={onClose}
    >
      <div className="border-border mt-5 overflow-hidden rounded-[14px] border">
        {[
          { label: say(PROMO_TEXT.spent, lang), value: som(spent, lang), tone: 'text-fg' },
          {
            label: say(PROMO_TEXT.returned, lang),
            value: som(budget, lang),
            tone: 'text-success-700',
          },
          {
            label: say(PROMO_TEXT.ratingEffect, lang),
            value: say(PROMO_TEXT.ratingNone, lang),
            tone: 'text-fg-muted',
          },
        ].map((row) => (
          <div
            key={row.label}
            className="border-divider flex items-baseline justify-between gap-3 border-b px-4 py-3 last:border-0"
          >
            <span className="text-fg-muted text-[13px]">{row.label}</span>
            <span data-num className={`flex-none text-[13px] font-semibold ${row.tone}`}>
              {row.value}
            </span>
          </div>
        ))}
      </div>

      <div className="mt-4.5 flex gap-2.5">
        <button
          type="button"
          onClick={() => {
            // As above: the caller sends the transition and reports what came
            // back. `marketplace.promotion_transition` refuses a cancel on an
            // offer that has already started, and this sheet cannot know.
            onCancel();
            onClose();
          }}
          className="bg-danger-500 h-[46px] flex-1 rounded-xl text-sm font-semibold text-white"
        >
          {say(PROMO_TEXT.cancelGo, lang)}
        </button>

        <button
          type="button"
          onClick={onClose}
          className="border-border-strong bg-surface h-[46px] flex-1 rounded-xl border text-sm font-semibold"
        >
          {say(PROMO_TEXT.cancelKeep, lang)}
        </button>
      </div>
    </MerchantSheet>
  );
}

/* ------------------------------------------------------------ bank details */

/**
 * The five fields the platform actually pays into — and the one it refuses to
 * hold.
 *
 * The design's sheet collected two, a bank and an account, which is not enough
 * to send a transfer in Uzbekistan: a payment order needs the bank's MFO, the
 * twenty-digit account, the business's INN and the holder's name as the bank
 * spells it. Two fields would have produced a form that saves and a Thursday
 * that does not arrive.
 *
 * **There is deliberately no card number.** A settlement is a bank transfer to
 * a business account — the invoice and the act both describe one — and a card
 * field would invite a merchant to type a pan into a form that stores it, which
 * is the exact thing PCI exists to forbid. Where a card genuinely belongs, on
 * the consumer side, the number lives in the provider's vault and never here.
 *
 * The digit counts are checked in the browser, in the route handler and
 * upstream. This copy is not the enforcement — a browser enforces nothing — it
 * is so the sentence lands beside the field while the merchant is still looking
 * at it, instead of after a round trip.
 */
const PAYOUT_FIELDS = {
  mfo: { uz: 'MFO', ru: 'МФО', en: 'MFO' } as Trilingual,
  inn: { uz: 'INN', ru: 'ИНН', en: 'INN' } as Trilingual,
  holder: {
    uz: 'Hisob egasi',
    ru: 'Владелец счёта',
    en: 'Account holder',
  } as Trilingual,
  badMfo: {
    uz: 'MFO — 5 raqam',
    ru: 'МФО — 5 цифр',
    en: 'MFO is five digits',
  } as Trilingual,
  badAccount: {
    uz: 'Hisob raqami — 20 raqam',
    ru: 'Номер счёта — 20 цифр',
    en: 'The account number is twenty digits',
  } as Trilingual,
  badInn: {
    uz: 'INN — 9 raqam',
    ru: 'ИНН — 9 цифр',
    en: 'The INN is nine digits',
  } as Trilingual,
  noCard: {
    uz: "Karta raqami so'ralmaydi — to'lov bank hisobiga o'tkaziladi.",
    ru: 'Номер карты не запрашивается — выплата идёт на банковский счёт.',
    en: 'No card number is asked for — the payout goes to a bank account.',
  } as Trilingual,
};

/** Only digits, and only as many as the field holds. */
const onlyDigits = (value: string, length: number) => value.replace(/\D/g, '').slice(0, length);

export function BankSheet({
  lang,
  payout,
  onClose,
}: {
  lang: Lang;
  /**
   * What the platform holds today, when it holds anything.
   *
   * The account is never sent back down in full — only its last four — so the
   * field starts empty and a merchant re-types it. That is the right trade: an
   * account number a screen can display is one a screen can leak, and this form
   * is opened to CHANGE the account rather than to admire it.
   */
  payout?: { bankName: string; mfo: string; inn: string; holder: string } | null;
  onClose: () => void;
}) {
  const t = merchantCopy(lang);
  const [bank, setBank] = useState(payout?.bankName ?? '');
  const [mfo, setMfo] = useState(payout?.mfo ?? '');
  const [account, setAccount] = useState('');
  const [inn, setInn] = useState(payout?.inn ?? '');
  const [holder, setHolder] = useState(payout?.holder ?? '');
  const [sending, setSending] = useState(false);

  const ready = bank.trim() !== '' && holder.trim() !== '' && account !== '' && mfo !== '';

  async function save() {
    if (!ready) {
      flash.problem(say(BANK_TEXT.incomplete, lang));

      return;
    }

    /* One sentence per field, and the field it is about — "check your details"
       over five inputs is a form somebody submits four more times. */
    if (mfo.length !== 5) {
      flash.problem(say(PAYOUT_FIELDS.badMfo, lang));

      return;
    }

    if (account.length !== 20) {
      flash.problem(say(PAYOUT_FIELDS.badAccount, lang));

      return;
    }

    if (inn.length !== 9) {
      flash.problem(say(PAYOUT_FIELDS.badInn, lang));

      return;
    }

    setSending(true);

    const sent = await post(
      '/api/marketplace/settings/payout',
      { bankName: bank.trim(), mfo, account, inn, holder: holder.trim() },
      lang,
    );

    setSending(false);

    if (!sent.ok) {
      flash.problem(sent.message ?? say(NOT_SAVED, lang));

      return;
    }

    onClose();
    /* Any write resets the state to `pending_review` upstream, which is exactly
       what this sentence promises: payouts pause until a person confirms the
       account belongs to this business. */
    flash(say(SETTLEMENT_ACTION_FLASH.bank!, lang));
  }

  return (
    <MerchantSheet
      lang={lang}
      title={say(BANK_TEXT.title, lang)}
      sub={say(BANK_TEXT.sub, lang)}
      onClose={onClose}
    >
      <label htmlFor="mp-bank-name" className="mt-5 block text-[13px] font-semibold">
        {t.text.bankName}
      </label>
      <input
        id="mp-bank-name"
        value={bank}
        onChange={(event) => setBank(event.target.value)}
        className="border-border-strong bg-surface mt-2 h-11 w-full rounded-[11px] border px-3.5 text-[15px]"
      />

      <label htmlFor="mp-bank-mfo" className="mt-3.5 block text-[13px] font-semibold">
        {say(PAYOUT_FIELDS.mfo, lang)}
      </label>
      <input
        id="mp-bank-mfo"
        inputMode="numeric"
        value={mfo}
        onChange={(event) => setMfo(onlyDigits(event.target.value, 5))}
        data-num
        className="border-border-strong bg-surface mt-2 h-11 w-full rounded-[11px] border px-3.5 font-mono text-[15px]"
      />

      <label htmlFor="mp-bank-acc" className="mt-3.5 block text-[13px] font-semibold">
        {t.text.bankAcc}
      </label>
      <input
        id="mp-bank-acc"
        inputMode="numeric"
        value={account}
        onChange={(event) => setAccount(onlyDigits(event.target.value, 20))}
        data-num
        className="border-border-strong bg-surface mt-2 h-11 w-full rounded-[11px] border px-3.5 font-mono text-[15px]"
      />

      <label htmlFor="mp-bank-inn" className="mt-3.5 block text-[13px] font-semibold">
        {say(PAYOUT_FIELDS.inn, lang)}
      </label>
      <input
        id="mp-bank-inn"
        inputMode="numeric"
        value={inn}
        onChange={(event) => setInn(onlyDigits(event.target.value, 9))}
        data-num
        className="border-border-strong bg-surface mt-2 h-11 w-full rounded-[11px] border px-3.5 font-mono text-[15px]"
      />

      <label htmlFor="mp-bank-holder" className="mt-3.5 block text-[13px] font-semibold">
        {say(PAYOUT_FIELDS.holder, lang)}
      </label>
      <input
        id="mp-bank-holder"
        value={holder}
        onChange={(event) => setHolder(event.target.value)}
        className="border-border-strong bg-surface mt-2 h-11 w-full rounded-[11px] border px-3.5 text-[15px]"
      />

      <p className="text-fg-subtle mt-2.5 text-xs leading-normal">
        {say(PAYOUT_FIELDS.noCard, lang)}
      </p>

      {/* Payouts stop until the change is verified — said here rather than
          discovered on the Thursday that does not arrive. */}
      <div className="border-warning-500/30 bg-warning-50 mt-4 flex items-start gap-2.5 rounded-xl border px-3.5 py-3">
        <span aria-hidden className="bg-warning-500 mt-1.5 size-1.5 flex-none rounded-full" />
        <span className="text-warning-700 text-xs leading-normal font-medium">
          {t.text.bankWarn}
        </span>
      </div>

      <button
        type="button"
        disabled={sending}
        onClick={() => void save()}
        className={`mt-4 h-[46px] w-full rounded-xl text-sm font-semibold text-white ${
          ready && !sending ? 'bg-brand-500' : 'bg-border-strong'
        }`}
      >
        {t.text.bankSave}
      </button>
    </MerchantSheet>
  );
}
