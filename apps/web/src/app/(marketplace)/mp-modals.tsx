'use client';

import { useState, type ReactNode } from 'react';

import { flash } from '@restaurant/ui';

import { post } from '@/lib/console-post';
import { chooseAddress } from './mp-address';

import { t } from '@restaurant/surfaces/mp/copy';
import {
  CANCEL_ROWS,
  PLUS_ROWS,
  PROBLEM_REASONS,
  SAVED_ADDRESSES,
  say,
  STORE_INFO_ROWS,
  type Lang,
} from '@restaurant/surfaces/mp/data';

/**
 * The marketplace's five sheets — `Sayt.dc.html:724-866`.
 *
 * The design carries exactly five and none of them is a confirmation dialogue
 * in the usual sense: each one exists because the guest is about to make a
 * decision the screen behind it cannot state fully. The address book has to be
 * able to refuse an address; the Plus sheet has to do the arithmetic that says
 * whether the subscription is worth it *for this guest*; the cancel sheet has
 * to name the refund before it offers the button.
 *
 * They are here in one file rather than beside their screens because the frame
 * — scrim, panel, close, the 20px display title over a 13px muted line — is the
 * same five times, and five copies of a dialogue frame is how two of them end
 * up with a different radius.
 *
 * All five write through a Node handler on this origin, because the consumer's
 * token is in an httpOnly cookie the page cannot read: Plus through
 * `/api/mp/plus`, the four notification switches through `/api/mp/me`, the
 * address book through `/api/mp/addresses` (which re-reads the stored list
 * before replacing it — the sheet's own rows are a fixture and would overwrite
 * a real address book), and cancel and complain through
 * `/api/mp/orders/{number}`.
 *
 * None of them confirms optimistically any more. A sheet that flashed "your
 * order is cancelled" while the kitchen kept cooking is the defect this whole
 * file was carrying: the guest is told what happened only once the API says it
 * did, and told the API's own refusal when it did not.
 *
 * No integration marker is left in this file. The one that was here — on the
 * Plus sheet — was right at the time and is not now: `POST
 * /api/v1/mp/plus/subscribe` exists, the platform raises one invoice a month,
 * and the sheet says so in those words rather than pretending a recurring card
 * mandate is standing behind it.
 */

/* --------------------------------------------------------------- the frame */

function CloseGlyph() {
  return (
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
  );
}

export function MpSheet({
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
      {/* The scrim is a button so the design's tap-outside-to-close works for a
          pointer and for a keyboard, which a bare `<div onClick>` does not. */}
      <button
        type="button"
        data-scrim
        aria-label={t('close', lang)}
        onClick={onClose}
        className="fixed inset-0 z-[140] cursor-default bg-[rgba(15,19,32,.44)]"
      />

      <div
        data-sheet
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="bg-surface border-border fixed top-1/2 left-1/2 z-[141] max-h-[86vh] w-[min(94vw,470px)] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-[20px] border px-7 pt-[26px] pb-6 shadow-xl"
      >
        <div className="flex items-start justify-between gap-3.5">
          <div className="min-w-0">
            <p className="font-display text-xl leading-tight font-bold tracking-tight">{title}</p>
            <p className="text-fg-muted mt-1.5 text-[13px] leading-normal">{sub}</p>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label={t('close', lang)}
            className="border-border bg-surface text-fg-muted grid size-8 flex-none place-items-center rounded-[9px] border"
          >
            <CloseGlyph />
          </button>
        </div>

        {children}
      </div>
    </>
  );
}

/** The design's radio mark: a 19px ring that fills and grows a tick. */
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

/* ------------------------------------------------------------ address book */

export function AddressSheet({ lang, onClose }: { lang: Lang; onClose: () => void }) {
  const [picked, setPicked] = useState('home');
  const [draft, setDraft] = useState('');
  const [saving, setSaving] = useState(false);

  return (
    <MpSheet lang={lang} title={t('addrTitle', lang)} sub={t('addrSub', lang)} onClose={onClose}>
      <div className="mt-5 grid gap-2">
        {SAVED_ADDRESSES.map((entry) => {
          const on = picked === entry.key;

          return (
            <button
              key={entry.key}
              type="button"
              onClick={() => {
                if (!entry.deliverable) {
                  /* The design refuses here rather than at checkout: an
                     out-of-zone address that is selectable is a guest who
                     builds a basket and is turned away holding it. */
                  flash.problem(t('addrOutside', lang));
                  return;
                }

                setPicked(entry.key);
                // The choice is what the header shows from now on — see
                // mp-address.ts. The book itself is the API's.
                chooseAddress(say(entry.address, lang));
                onClose();
                flash(`${say(entry.label, lang)} · ${say(entry.address, lang)}`);
              }}
              className={`flex w-full items-start gap-3 rounded-xl border px-3.5 py-3.5 text-left ${
                on ? 'border-brand-500 bg-brand-50' : 'border-border'
              } ${entry.deliverable ? '' : 'bg-bg-muted'}`}
            >
              <Mark on={on} />

              <span className="min-w-0">
                <span className="block text-sm font-semibold">{say(entry.label, lang)}</span>
                <span className="text-fg-muted mt-0.5 block text-[13px] leading-normal">
                  {say(entry.address, lang)}
                </span>
                <span
                  data-num
                  className={`mt-1 block text-xs ${
                    entry.deliverable ? 'text-fg-subtle' : 'text-danger-600'
                  }`}
                >
                  {say(entry.note, lang)}
                </span>
              </span>
            </button>
          );
        })}
      </div>

      <div className="border-border mt-4.5 border-t pt-4">
        <label htmlFor="mp-addr-new" className="block text-[13px] font-semibold">
          {t('addrNewL', lang)}
        </label>

        <input
          id="mp-addr-new"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder={t('addrPh', lang)}
          className="border-border-strong bg-surface mt-2 h-11 w-full rounded-[11px] border px-3.5 text-[15px]"
        />

        <button
          type="button"
          disabled={saving}
          onClick={() => {
            if (draft.trim() === '') {
              flash.problem(t('addrTypeIt', lang));
              return;
            }

            setSaving(true);

            void post('/api/mp/addresses', { address: draft.trim() }, lang).then((answer) => {
              setSaving(false);

              if (!answer.ok) {
                flash.problem(answer.message ?? t('addrFailed', lang));
                return;
              }

              chooseAddress(draft.trim());
              setDraft('');
              onClose();
              flash(t('addrAdded', lang));
            });
          }}
          className="border-border-strong bg-surface mt-2.5 h-11 w-full rounded-[11px] border text-sm font-semibold disabled:opacity-50"
        >
          {t('addrAdd', lang)}
        </button>
      </div>
    </MpSheet>
  );
}

/* -------------------------------------------------------------- MyPOS Plus */

/**
 * The renewal sentence, and why it is worded exactly like this.
 *
 * There is no standing order behind MyPOS Plus and there is not going to be one
 * soon: a recurring card mandate is a contract with Payme or Click, and
 * `App\Contracts\Finance\PaymentGateway` describes one-off invoices. What the
 * platform does instead is raise ONE invoice a month, which is a real and
 * perfectly ordinary way to sell a subscription — but it is not a card being
 * charged automatically, and a sheet that implied otherwise would have a guest
 * discover the difference by losing free delivery in the middle of an order.
 */
const PLUS_RENEWAL = {
  uz: 'Har oy yangilanadi · har oy uchun alohida hisob keladi, avtomatik yechib olinmaydi.',
  ru: 'Продлевается ежемесячно · счёт выставляется каждый месяц, автосписания нет.',
  en: 'Renewed monthly · one invoice a month, nothing is charged automatically.',
} as const;

/** Said when the platform refuses and has no sentence of its own. */
const PLUS_FAILED = {
  uz: 'Bajarilmadi · qayta urining',
  ru: 'Не выполнено · повторите',
  en: 'It did not go through · try again',
} as const;

export function PlusSheet({
  lang,
  active,
  onToggle,
  onClose,
}: {
  lang: Lang;
  active: boolean;
  /** Called only after the platform has agreed — see the button below. */
  onToggle: (next: boolean) => void;
  onClose: () => void;
}) {
  const [sending, setSending] = useState(false);

  /**
   * Buy it, or give it back.
   *
   * **Not optimistic, and this is the one sheet on the surface where that is
   * the right call.** Everything else here moves the screen first because the
   * cost of being wrong is a toast; this one takes money. A card that flipped
   * to "active" before the invoice was raised would have a guest add a basket
   * expecting free delivery that the checkout then charges for — and the
   * refusals are real ones: `marketplace.plus_already_active` on a double tap,
   * `marketplace.plus_payment_unavailable` when the provider is down.
   */
  async function toggle() {
    setSending(true);

    const sent = await post('/api/mp/plus', { action: active ? 'cancel' : 'subscribe' }, lang);

    setSending(false);

    if (!sent.ok) {
      flash.problem(sent.message ?? say(PLUS_FAILED, lang));

      return;
    }

    onToggle(!active);
    onClose();
    flash(active ? t('plusOffFlash', lang) : t('plusOnFlash', lang));
  }

  return (
    <MpSheet lang={lang} title={t('plusH', lang)} sub={t('plusSub', lang)} onClose={onClose}>
      <div className="border-border mt-5 overflow-hidden rounded-[14px] border">
        {PLUS_ROWS.map((row) => (
          <div
            key={say(row.label, lang)}
            className="border-divider flex items-baseline justify-between gap-3 border-b px-4 py-3.5 last:border-0"
          >
            <span className="text-fg-muted text-[13px]">{say(row.label, lang)}</span>
            <span data-num className="flex-none text-right text-[13px] font-semibold">
              {say(row.value, lang)}
            </span>
          </div>
        ))}
      </div>

      {/* The arithmetic, and it changes with the subscription: off, it argues
          the break-even; on, it counts what this month already saved. */}
      <div className="border-border bg-bg-muted mt-4 flex items-start gap-2.5 rounded-xl border px-3.5 py-3.5">
        <span aria-hidden className="bg-brand-500 mt-1.5 size-1.5 flex-none rounded-full" />
        <span className="text-fg-muted text-xs leading-relaxed">
          {active ? t('plusMathOn', lang) : t('plusMathOff', lang)}
        </span>
      </div>

      {/* Said before the button, not after it: a guest agreeing to a monthly
          charge has to know it is monthly while they are still agreeing. */}
      <p className="text-fg-subtle mt-3 text-xs leading-relaxed">{say(PLUS_RENEWAL, lang)}</p>

      <button
        type="button"
        disabled={sending}
        onClick={() => void toggle()}
        className={`mt-3 h-[46px] w-full rounded-xl text-sm font-semibold ${
          active ? 'border-border-strong bg-surface text-fg border' : 'bg-brand-500 text-white'
        } ${sending ? 'opacity-60' : ''}`}
      >
        {active ? t('plusStop', lang) : t('plusStart', lang)}
      </button>
    </MpSheet>
  );
}

/* ------------------------------------------------------- notifications */

/**
 * Four switches, and each one is a different promise.
 *
 * The profile row used to open nothing, and the note beside it said why:
 * `marketplace.consumers` had no column for a preference, so the switch would
 * have been a switch over nothing. `PATCH /api/v1/mp/me` now takes all four.
 *
 * **Four rather than one.** "Notifications: on/off" is the design that has a
 * guest switch off the message telling them their food is downstairs in order
 * to stop being sold pizza. Orders and delivery are about a thing they are
 * waiting for; promos and the newsletter are about things somebody wants to
 * sell them, and the second pair is what a person actually reaches for.
 *
 * Optimistic, because the cost of being wrong here is one toast and one switch
 * that flips back — and the sheet stays open on a refusal so the guest can see
 * which row went back.
 */
const NOTIFY = {
  title: { uz: 'Bildirishnomalar', ru: 'Уведомления', en: 'Notifications' },
  sub: {
    uz: 'Nimani yuborishimiz mumkin — istalgan vaqtda o‘zgartirasiz',
    ru: 'Что мы можем присылать — меняется в любой момент',
    en: 'What we may send you — change it any time',
  },
  orders: { uz: 'Buyurtma holati', ru: 'Статус заказа', en: 'Order updates' },
  ordersNote: {
    uz: 'Qabul qilindi, tayyor, kuryer yo‘lda',
    ru: 'Принят, готов, курьер в пути',
    en: 'Accepted, ready, the courier is on the way',
  },
  delivery: { uz: 'Yetkazish', ru: 'Доставка', en: 'Delivery' },
  deliveryNote: {
    uz: 'Kuryer eshik oldida · manzilni aniqlashtirish',
    ru: 'Курьер у двери · уточнение адреса',
    en: 'The courier is at the door · confirming an address',
  },
  promos: { uz: 'Aksiyalar', ru: 'Акции', en: 'Offers' },
  promosNote: {
    uz: 'Siz buyurtma bergan do‘konlardan',
    ru: 'От магазинов, где вы уже заказывали',
    en: 'From shops you have ordered from',
  },
  newsletter: { uz: 'Yangiliklar', ru: 'Новости', en: 'Newsletter' },
  newsletterNote: {
    uz: 'Yangi do‘konlar, oyiga bir marta',
    ru: 'Новые магазины, раз в месяц',
    en: 'New shops, once a month',
  },
  saved: {
    uz: 'Saqlandi',
    ru: 'Сохранено',
    en: 'Saved',
  },
  failed: {
    uz: 'Saqlanmadi · qayta urining',
    ru: 'Не сохранено · повторите',
    en: 'Not saved · try again',
  },
} as const;

export type NotifyPrefs = {
  orders: boolean;
  promos: boolean;
  delivery: boolean;
  newsletter: boolean;
};

/** The four in the order they are read, with the words for each. */
const NOTIFY_ROWS: readonly {
  key: keyof NotifyPrefs;
  label: keyof typeof NOTIFY;
  note: keyof typeof NOTIFY;
}[] = [
  { key: 'orders', label: 'orders', note: 'ordersNote' },
  { key: 'delivery', label: 'delivery', note: 'deliveryNote' },
  { key: 'promos', label: 'promos', note: 'promosNote' },
  { key: 'newsletter', label: 'newsletter', note: 'newsletterNote' },
];

export function NotificationsSheet({
  lang,
  prefs,
  onSaved,
  onClose,
}: {
  lang: Lang;
  prefs: NotifyPrefs;
  /** The sheet reports what the platform accepted, never what was pressed. */
  onSaved: (next: NotifyPrefs) => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState<NotifyPrefs>(prefs);

  async function flip(key: keyof NotifyPrefs) {
    const next = { ...draft, [key]: !draft[key] };

    setDraft(next);

    /* All four every time. A partial object would mean "unchanged" here and
       "false" on some future server, and the difference is somebody's order
       updates going quiet without them having touched that row. */
    const sent = await post('/api/mp/me', { notificationPrefs: next }, lang);

    if (sent.ok) {
      onSaved(next);
      flash(say(NOTIFY.saved, lang));

      return;
    }

    setDraft(draft);
    flash.problem(sent.message ?? say(NOTIFY.failed, lang));
  }

  return (
    <MpSheet
      lang={lang}
      title={say(NOTIFY.title, lang)}
      sub={say(NOTIFY.sub, lang)}
      onClose={onClose}
    >
      <div className="border-border mt-5 overflow-hidden rounded-[14px] border">
        {NOTIFY_ROWS.map((row) => {
          const on = draft[row.key];

          return (
            <div
              key={row.key}
              className="border-divider flex items-start justify-between gap-3.5 border-b px-4 py-3.5 last:border-0"
            >
              <span className="min-w-0">
                <span className="block text-sm font-semibold">{say(NOTIFY[row.label], lang)}</span>
                <span className="text-fg-subtle mt-0.5 block text-xs leading-normal">
                  {say(NOTIFY[row.note], lang)}
                </span>
              </span>

              <button
                type="button"
                role="switch"
                aria-checked={on}
                aria-label={say(NOTIFY[row.label], lang)}
                onClick={() => void flip(row.key)}
                className={`rounded-pill mt-0.5 flex h-[26px] w-11 flex-none items-center p-[3px] transition-colors ${
                  on ? 'bg-brand-500 justify-end' : 'bg-border-strong justify-start'
                }`}
              >
                <span className="size-5 rounded-full bg-white shadow-sm" />
              </button>
            </div>
          );
        })}
      </div>
    </MpSheet>
  );
}

/* --------------------------------------------------------------- the store */

export function StoreInfoSheet({
  lang,
  storeName,
  onClose,
}: {
  lang: Lang;
  storeName: string;
  onClose: () => void;
}) {
  return (
    <MpSheet lang={lang} title={storeName} sub={t('infoSub', lang)} onClose={onClose}>
      <div className="border-border mt-5 overflow-hidden rounded-[14px] border">
        {STORE_INFO_ROWS.map((row) => (
          <div
            key={say(row.label, lang)}
            className="border-divider flex items-baseline justify-between gap-3.5 border-b px-4 py-3 last:border-0"
          >
            <span className="text-fg-subtle flex-none text-[13px]">{say(row.label, lang)}</span>
            <span className="text-right text-[13px] leading-normal">{say(row.value, lang)}</span>
          </div>
        ))}
      </div>

      <p className="text-fg-subtle mt-3.5 text-xs leading-relaxed">{t('infoNote', lang)}</p>
    </MpSheet>
  );
}

/* ------------------------------------------------------- a problem, a cancel */

export function ProblemSheet({
  lang,
  onClose,
  orderNumber,
  totalTiyin,
}: {
  lang: Lang;
  onClose: () => void;
  /**
   * Which order this is about, or null when the screen behind is the fixture.
   *
   * Null disables the send outright rather than posting against a made-up
   * number: the sample journey on `/mp/track` is what a signed-out guest sees,
   * and a complaint raised from it would 404 after telling them it was filed.
   */
  orderNumber: string | null;
  /** The amount in dispute, in tiyin. The API clamps it to the order total. */
  totalTiyin: number;
}) {
  const [sending, setSending] = useState(false);
  const [why, setWhy] = useState<string | null>(null);

  return (
    <MpSheet lang={lang} title={t('probTitle', lang)} sub={t('probSub', lang)} onClose={onClose}>
      <div className="mt-5 grid gap-2">
        {PROBLEM_REASONS.map((reason) => {
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
                {/* What pressing send will do, stated on the option. */}
                <span className="text-fg-muted mt-1 block text-xs leading-normal">
                  {say(reason.outcome, lang)}
                </span>
              </span>
            </button>
          );
        })}
      </div>

      <button
        type="button"
        disabled={sending || orderNumber === null}
        onClick={() => {
          if (why === null) {
            flash.problem(t('probPick', lang));
            return;
          }

          if (orderNumber === null) return;

          const automatic = PROBLEM_REASONS.find((row) => row.key === why)?.automatic === true;

          setSending(true);

          /*
           * `POST /api/v1/mp/orders/{number}/dispute` through the Node handler,
           * because the consumer token is httpOnly. The four keys the sheet
           * offers are `Dispute::KINDS` exactly; the amount is what is in
           * dispute and the API clamps it to the order total and applies its
           * own automatic ceiling — this side decides nothing about money.
           *
           * The confirmation waits for the answer. It used to flash "your
           * refund is approved" and create no dispute row at all, so nobody
           * had anything to answer and the guest believed it was settled.
           */
          void post(
            `/api/mp/orders/${encodeURIComponent(orderNumber)}`,
            { action: 'dispute', kind: why, amountTiyin: totalTiyin },
            lang,
          ).then((answer) => {
            setSending(false);

            if (!answer.ok) {
              flash.problem(answer.message ?? t('orderActionFailed', lang));
              return;
            }

            onClose();
            flash(automatic ? t('probAuto', lang) : t('probManual', lang));
          });
        }}
        className={`mt-4 h-[46px] w-full rounded-xl text-sm font-semibold text-white disabled:opacity-50 ${
          why === null ? 'bg-border-strong' : 'bg-brand-500'
        }`}
      >
        {t('probGo', lang)}
      </button>

      <p className="text-fg-subtle mt-3 text-xs leading-relaxed">{t('probNote', lang)}</p>
    </MpSheet>
  );
}

export function CancelSheet({
  lang,
  onClose,
  orderNumber,
}: {
  lang: Lang;
  onClose: () => void;
  /** Null on the fixture journey — see `ProblemSheet` for why that disables it. */
  orderNumber: string | null;
}) {
  const [sending, setSending] = useState(false);

  const TONE: Readonly<Record<'fg' | 'danger' | 'warning', string>> = {
    fg: 'text-fg',
    danger: 'text-danger-600',
    warning: 'text-warning-700',
  };

  return (
    <MpSheet lang={lang} title={t('cxTitle', lang)} sub={t('cxSub', lang)} onClose={onClose}>
      <div className="border-border mt-5 overflow-hidden rounded-[14px] border">
        {CANCEL_ROWS.map((row) => (
          <div
            key={say(row.label, lang)}
            className="border-divider flex items-baseline justify-between gap-3.5 border-b px-4 py-3 last:border-0"
          >
            <span className="text-fg-muted text-[13px]">{say(row.label, lang)}</span>
            <span
              data-num
              className={`flex-none text-right text-[13px] font-semibold ${TONE[row.tone]}`}
            >
              {say(row.value, lang)}
            </span>
          </div>
        ))}
      </div>

      <div className="mt-4.5 flex gap-2.5">
        <button
          type="button"
          disabled={sending || orderNumber === null}
          onClick={() => {
            if (orderNumber === null) return;

            setSending(true);

            /*
             * `POST /api/v1/mp/orders/{number}/cancel`, and the ladder decides
             * rather than this screen: it is allowed while the order is
             * `placed` or `accepted` and refused once a pan is hot. The refusal
             * is shown in the guest's own language — the whole reason this
             * waits for the answer instead of closing on the press.
             */
            void post(
              `/api/mp/orders/${encodeURIComponent(orderNumber)}`,
              { action: 'cancel' },
              lang,
            ).then((answer) => {
              setSending(false);

              if (!answer.ok) {
                flash.problem(answer.message ?? t('orderActionFailed', lang));
                return;
              }

              onClose();
              flash(t('cxSent', lang));
            });
          }}
          className="bg-danger-500 h-[46px] flex-1 rounded-xl text-sm font-semibold text-white disabled:opacity-50"
        >
          {t('cxGo', lang)}
        </button>

        <button
          type="button"
          onClick={onClose}
          className="border-border-strong bg-surface h-[46px] flex-1 rounded-xl border text-sm font-semibold"
        >
          {t('cxKeep', lang)}
        </button>
      </div>
    </MpSheet>
  );
}
