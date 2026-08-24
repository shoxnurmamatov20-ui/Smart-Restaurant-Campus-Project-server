'use client';

import { flash } from '@restaurant/ui';
import Link from 'next/link';
import { useState } from 'react';

import { copy, fill, FLASH, SHARED, STORE_COPY } from '@restaurant/surfaces/crew/copy';
import {
  COUNT_ITEMS,
  CURRENCY_WORD,
  DELIVERIES,
  say,
  SCAN_POOL,
  STOCK,
  STORE_TODAY,
  type Lang,
  type ScannedLine,
} from '@restaurant/surfaces/crew/data';
import { realId, type CrewDelivery, type ShelfRow } from '@restaurant/surfaces/crew/live';
import { Som } from '../crew-money';
import { drain, enqueue } from '../crew-queue';
import { EmptyState, Note, NotWired, SectionLabel } from './bits';

/**
 * The storekeeper's three tabs and the scanner behind the first of them.
 *
 * All three used to render the dashed "not built yet" card, and the reason
 * given was a barcode scanner. It was the wrong reason. A scanner makes
 * receiving *faster*; it is not what makes it possible — a storekeeper with a
 * paper invoice in one hand and a phone in the other types the quantity, and
 * has been doing exactly that since before phones had cameras. Withholding the
 * whole screen until the camera works left the one person whose entire job is
 * on this app with nothing to open.
 *
 * The count screen keeps the console's rule, and keeps it for the same reason:
 * **the system quantity is not shown**. `COUNT_ITEMS` carries no `system` field
 * at all, so it cannot leak by accident — somebody counting a shelf while
 * looking at what the computer expects counts to it.
 */

/**
 * The design's `mfMini` — the one card that answers "why did you open this".
 *
 * Every figure is the sum of the list under it rather than a number of its own,
 * which is what keeps it true when the list comes from
 * `suppliers/purchase-orders` instead of the fixture. A hero card that
 * announced three vans while five were drawn beneath it would be the first
 * thing on this screen a storekeeper stopped believing.
 */
function TodayCard({ lang, rows }: { lang: Lang; rows: readonly CrewDelivery[] }) {
  const t = copy(STORE_COPY, lang);

  const value = rows.reduce((sum, row) => sum + row.amount, 0);
  const lines = rows.reduce((sum, row) => sum + row.lines, 0);
  const arrived = rows.filter((row) => row.status === 'arrived').length;

  /* The third figure belongs to the shelf rather than to the vans, and the
     stock tab is where it is read. Kept from the design's card so the row keeps
     its shape; it is the one number here the receiving list cannot derive. */
  const stats = [String(lines), String(arrived), STORE_TODAY.stats[2]?.value ?? ''];

  return (
    <div className="rounded-[20px] bg-[var(--crew-hero-bg)] px-5 py-4">
      <p className="text-xs text-[var(--crew-hero-dim)]">{fill(t.todayCard, { n: rows.length })}</p>
      <p className="font-display mt-1.5 flex items-baseline gap-2 text-[30px] leading-none font-bold tracking-tight text-[var(--crew-hero-fg)]">
        <Som tiyin={value} lang={lang} unit={false} />
        {/* The unit in the hero's own dim: `--fg-subtle` is picked against
            white and disappears on this card. */}
        <span className="text-2xs font-normal text-[var(--crew-hero-dim)]">
          {say(CURRENCY_WORD, lang)}
        </span>
      </p>
      <dl
        className="mt-3.5 flex gap-6 border-t pt-3"
        style={{ borderColor: 'var(--crew-hero-line)' }}
      >
        {STORE_TODAY.stats.map((stat, index) => (
          /* `flex-col-reverse` so the figure sits above its label the way the
             design draws it while the DOM keeps `<dt>` before `<dd>`. */
          <div key={stat.label.en} className="flex flex-col-reverse gap-0.5">
            <dt className="text-[10px] whitespace-nowrap text-[var(--crew-hero-dim)]">
              {say(stat.label, lang)}
            </dt>
            <dd data-num className="font-display text-[15px] font-bold text-[var(--crew-hero-fg)]">
              {stats[index] ?? stat.value}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

export function ReceivingPanel({
  lang,
  role,
  rows = DELIVERIES,
  live = false,
}: {
  lang: Lang;
  role: string;
  /**
   * Today's vans, from `GET /api/v1/suppliers/purchase-orders`.
   *
   * Defaulted to the fixtures rather than required: this is a client component
   * and cannot fetch, so the page above it either hands over a live list or
   * does not.
   */
  rows?: readonly CrewDelivery[];
  /**
   * Whether that list came from the server.
   *
   * It decides more than a strip. `receive_confirm` is keyed on
   * `purchase_order_id`, so a fixture row has nothing to send and the button
   * has to be honest about recording rather than reporting.
   */
  live?: boolean;
}) {
  const t = copy(STORE_COPY, lang);
  const shared = copy(SHARED, lang);
  const f = copy(FLASH, lang);

  const [started, setStarted] = useState<ReadonlySet<string>>(new Set());

  const TONE: Record<string, string> = {
    'en-route': 'bg-warning-50 text-warning-700',
    arrived: 'bg-success-50 text-success-700',
    tomorrow: 'bg-bg-muted text-fg-muted',
  };

  return (
    <>
      <TodayCard lang={lang} rows={rows} />

      {/*
       * The scanner, above the list rather than inside a card.
       *
       * The design puts it here because it is what a storekeeper reaches for
       * first when the van is at the door: the phone comes out, the code is
       * read, and the paperwork is checked afterwards. Buried on a delivery
       * card it would be four taps behind the moment it is needed.
       */}
      <Link
        href={`/crew/${role}/more/scan`}
        data-press
        className="border-border bg-surface text-fg mt-3.5 flex h-12 w-full items-center justify-center gap-2.5 rounded-[12px] border text-sm font-semibold"
      >
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.9"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          <path d="M3 8V5.5A2.5 2.5 0 0 1 5.5 3H8" />
          <path d="M16 3h2.5A2.5 2.5 0 0 1 21 5.5V8" />
          <path d="M21 16v2.5a2.5 2.5 0 0 1-2.5 2.5H16" />
          <path d="M8 21H5.5A2.5 2.5 0 0 1 3 18.5V16" />
          <path d="M3 12h18" />
        </svg>
        {t.scan}
      </Link>

      {/*
        Two different sentences, because they promise opposite things. On a
        fixture list nothing leaves the phone; on a live one the confirmation
        goes into the queue and sends itself. A storekeeper at a service
        entrance is the person most likely to have no signal, so which of the
        two is on screen is the thing they act on.
      */}
      <NotWired>{live ? shared.queued : shared.notWired}</NotWired>

      <SectionLabel>{t.today}</SectionLabel>

      {rows.length === 0 ? (
        <EmptyState>{t.noDeliveries}</EmptyState>
      ) : (
        <ul className="flex flex-col gap-2.5">
          {rows.map((delivery) => (
            <li
              key={delivery.id}
              className="border-border bg-surface rounded-[14px] border px-4 py-3.5"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-semibold">{delivery.supplier}</p>
                  <p className="text-fg-subtle mt-0.5 text-xs">{say(delivery.note, lang)}</p>
                </div>

                <span
                  className={`rounded-pill text-2xs flex-none px-2.5 py-1 font-semibold ${TONE[delivery.status]}`}
                >
                  {t[delivery.status === 'en-route' ? 'enRoute' : delivery.status]}
                </span>
              </div>

              <div className="border-divider mt-3 flex items-center justify-between border-t pt-3">
                <span className="text-fg-subtle text-xs">
                  {t.lines.replace('{n}', String(delivery.lines))}
                </span>
                <Som tiyin={delivery.amount} lang={lang} />
              </div>

              {/*
               * Tomorrow's van is the only one without a button — booking stock
               * nobody has seen is the one mistake this screen can make that
               * costs money rather than time. Everything else can be started,
               * including the load still on the road: a storekeeper opens the
               * document before the driver is through the door, which is the
               * design's own rule (`d.id !== "v3"`).
               */}
              {delivery.status === 'tomorrow' ? null : started.has(delivery.id) ? (
                <p className="text-success-700 mt-3 text-xs font-semibold">{t.receiveStarted}</p>
              ) : (
                <button
                  type="button"
                  data-press
                  onClick={() => {
                    setStarted((current) => new Set(current).add(delivery.id));

                    const purchaseOrderId = realId(delivery.id);

                    /*
                     * The heaviest entry in the queue: confirming a delivery
                     * raises stock on every line and grows the supplier's debt.
                     * It goes through `staff/actions` rather than straight at
                     * `suppliers/purchase-orders/{id}/receive` for the reason
                     * this whole app queues — a storekeeper at a service
                     * entrance is the person most likely to have no signal, and
                     * `Receiving::confirm` answers `already_received` rather
                     * than doubling a delivery when a queue drains twice.
                     */
                    if (purchaseOrderId !== null) {
                      enqueue(t.receiveStarted, delivery.supplier, {
                        kind: 'receive_confirm',
                        payload: { purchase_order_id: purchaseOrderId },
                      });

                      // Sent now when there is a network, kept in order when
                      // there is not. Nothing here waits on the answer: the
                      // van is at the door.
                      void drain();
                    }

                    flash(f.receivingStarted);
                  }}
                  className="bg-acc mt-3 h-12 w-full rounded-[11px] text-sm font-semibold text-white"
                >
                  {t.receive}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      <Note>{t.receivingNote}</Note>
    </>
  );
}

/**
 * The barcode screen — the design's `mfSub.scan`, reached from the tab above.
 *
 * **The demo button says it is a demo.** A web page cannot read a barcode: the
 * camera needs a permission prompt this app has no reason to ask for on a page
 * load, and `BarcodeDetector` is missing on most of the handsets a restaurant
 * actually buys. So the control is labelled in the design's own words —
 * "Demo: read the next code" — and cycles four real EAN-13s. A button labelled
 * "Scan" that produced a fixture would teach a storekeeper the reader works,
 * and the first real delivery would be booked from lines nobody scanned.
 *
 * The codes are printed under each line because that is what the job is: the
 * digits on the screen get checked against the digits on the box, and a
 * mismatch is the whole reason to scan rather than tick.
 *
 * **The lookup behind it is real.** Every code read here is put to
 * `GET /api/v1/inventory/items?barcode=` through `crew/barcode/route.ts`, so a
 * line shows the restaurant's own ingredient and its own quantity whenever the
 * store has registered that box — and shows the digits with "not in the store"
 * when it has not, which is the answer a storekeeper acts on. What is still
 * missing is the reader itself, and that is a device capability rather than an
 * endpoint; `SCAN_POOL` in `crew/data.ts` carries the reasoning.
 */
export function ScanScreen({
  lang,
  rows = [],
  live = false,
}: {
  lang: Lang;
  /**
   * Today's vans — the same `deliveries()` read the receiving tab uses.
   *
   * This is what the Save button was missing. `receive_confirm` is keyed on
   * `purchase_order_id` and the scanner holds barcodes, so the control was
   * removed rather than left reporting "{n} lines received" while raising stock
   * nowhere. Naming the delivery is the smallest honest way to give it one: the
   * storekeeper says which van they are standing at, and the codes they read
   * become the journal's record of what was in it.
   */
  rows?: readonly CrewDelivery[];
  live?: boolean;
}) {
  const t = copy(STORE_COPY, lang);
  const f = copy(FLASH, lang);
  const shared = copy(SHARED, lang);

  const [scanned, setScanned] = useState<readonly ScannedLine[]>([]);
  const [confirmed, setConfirmed] = useState(false);

  /*
   * Only the vans that can still be received.
   *
   * Tomorrow's is the one row the receiving tab refuses a button on, for the
   * one mistake this screen can make that costs money rather than time: booking
   * in stock nobody has seen.
   */
  const vans = rows.filter((row) => row.status !== 'tomorrow');
  const [van, setVan] = useState<string | null>(null);

  const sendable = live && vans.length > 0;

  /**
   * One code, put to the store.
   *
   * Answers the line to draw: the restaurant's own row when the code is
   * registered, and the demo pool's label with an explicit "not in the store"
   * when it is not. A failed request falls back to the pool's own label rather
   * than dropping the scan — the digits were read, and losing them would make
   * the storekeeper scan the same box twice.
   */
  const look = async (line: ScannedLine): Promise<ScannedLine> => {
    try {
      const response = await fetch(`/crew/barcode?code=${encodeURIComponent(line.code)}`);

      // `redirected` too: with no shift cookie the read is bounced to the
      // keypad and followed, and parsing that HTML would throw below.
      if (!response.ok || response.redirected) return line;

      const payload = (await response.json()) as {
        data?: readonly { name?: Record<string, string> | string; unit?: string }[];
      };

      const found = payload.data?.[0];

      if (found === undefined) {
        // `copy()` has already resolved the catalogue for this reader, so the
        // one sentence goes into all three slots — the line is drawn in one
        // language and translating it again here would answer nothing.
        return {
          ...line,
          name: { uz: t.scanUnknown, ru: t.scanUnknown, en: t.scanUnknown },
        };
      }

      const name = typeof found.name === 'string' ? found.name : (found.name?.[lang] ?? '');

      // One language repeated: the API already resolved the column against this
      // request's `X-Locale`, and re-reading it here would answer a different
      // question. An empty name means the row has none, so the pool's label is
      // the better of the two things to show.
      return name === '' ? line : { ...line, name: { uz: name, ru: name, en: name } };
    } catch {
      return line;
    }
  };

  return (
    <section>
      {/* See `ReceivingPanel` — a live sheet queues, a fixture one does not. */}
      <NotWired>{sendable ? shared.queued : shared.notWired}</NotWired>

      {/*
       * Which van, chosen before anything is read.
       *
       * Above the frame rather than beside the Save button on purpose: a
       * storekeeper who scans nine boxes and is then asked which delivery they
       * belong to has to remember; one who is asked first is answering about
       * the lorry in front of them.
       */}
      {vans.length > 0 ? (
        <div className="mb-3.5 flex flex-wrap gap-2">
          {vans.map((row) => (
            <button
              key={row.id}
              type="button"
              aria-pressed={van === row.id}
              onClick={() => setVan(row.id)}
              className={`rounded-pill h-8.5 border px-3.5 text-xs font-semibold ${
                van === row.id
                  ? 'border-brand-500 bg-brand-50 text-brand-700'
                  : 'border-border bg-surface text-fg-muted'
              }`}
            >
              {row.supplier}
            </button>
          ))}
        </div>
      ) : null}

      {/*
       * The frame, and it is honest about being empty: no fake viewfinder image
       * and no simulated laser line. What it draws is the shape a reader aims
       * with, at the size the design draws it, over the app's own surface.
       */}
      <div
        aria-hidden
        className="border-border-strong bg-bg-subtle grid h-[190px] w-full place-items-center rounded-[18px] border-2 border-dashed"
      >
        <svg
          width="52"
          height="52"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.4"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="text-fg-disabled"
        >
          <path d="M3 8V5.5A2.5 2.5 0 0 1 5.5 3H8" />
          <path d="M16 3h2.5A2.5 2.5 0 0 1 21 5.5V8" />
          <path d="M21 16v2.5a2.5 2.5 0 0 1-2.5 2.5H16" />
          <path d="M8 21H5.5A2.5 2.5 0 0 1 3 18.5V16" />
          <path d="M3 12h18" />
        </svg>
      </div>

      <p className="text-fg-subtle mt-2.5 text-center text-xs leading-normal">{t.scanHint}</p>

      <button
        type="button"
        data-press
        onClick={() => {
          const next = SCAN_POOL[scanned.length % SCAN_POOL.length];

          if (next === undefined) return;

          // Where this line will sit, captured now. By the time the store
          // answers there may be three more scans on the list, and correcting
          // "the last one" would rewrite somebody else's box.
          const at = scanned.length;

          // Drawn at once and corrected when the store answers. A scanner that
          // waited for a round trip before showing anything is a scanner
          // somebody presses twice.
          setScanned((current) => [...current, next]);
          flash(f.scanFound + say(next.name, lang));

          void look(next).then((resolved) => {
            setScanned((current) => current.map((line, index) => (index === at ? resolved : line)));
          });
        }}
        className="border-border-strong bg-surface text-fg mt-3.5 h-12 w-full rounded-[12px] border text-sm font-semibold"
      >
        {t.scanSim}
      </button>

      {scanned.length > 0 ? (
        <>
          <SectionLabel>{t.scanFound}</SectionLabel>

          <ul>
            {scanned.map((line, index) => (
              <li
                /* The same product can be scanned twice — a second case off the
                   same pallet is a second line, not a duplicate key. */
                key={`${line.code}-${index}`}
                className="border-divider flex items-center gap-3 border-b py-3 last:border-0"
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold">
                    {say(line.name, lang)}
                  </span>
                  <span data-num className="text-fg-subtle text-2xs mt-px block font-mono">
                    {line.code}
                  </span>
                </span>
                <span data-num className="flex-none text-sm font-semibold">
                  {say(line.quantity, lang)}
                </span>
              </li>
            ))}
          </ul>

          {/*
           * "Finish receiving", and it names the van it is finishing.
           *
           * It used to report "{n} lines received" and raise no stock anywhere,
           * so it was removed; what it was missing was never the scanner, it
           * was which delivery this is. With one picked the press is the same
           * `receive_confirm` the receiving tab sends — queued, keyed on
           * `local_id`, and answered `already_received` rather than doubling a
           * delivery when a queue drains twice.
           *
           * The scanned codes ride along in the payload. They raise no stock on
           * their own — a per-line received quantity is a column
           * `suppliers.purchase_order_items` does not have — but they are what
           * a storekeeper can be asked about when the invoice and the shelf
           * disagree, and the journal is where that question gets answered.
           */}
          <button
            type="button"
            data-press
            disabled={confirmed}
            onClick={() => {
              if (!sendable) {
                flash.problem(shared.notWired);

                return;
              }

              const purchaseOrderId = realId(van ?? '');

              if (purchaseOrderId === null) {
                flash.problem(t.scanPickVan);

                return;
              }

              enqueue(t.scanSave, t.scanTitle, {
                kind: 'receive_confirm',
                payload: {
                  purchase_order_id: purchaseOrderId,
                  codes: scanned.map((line) => line.code),
                },
              });

              void drain();
              setConfirmed(true);
              flash(f.receivingStarted);
            }}
            className="bg-acc mt-4 h-13 w-full rounded-[11px] py-3.5 text-sm font-semibold text-white disabled:opacity-45"
          >
            {t.scanSave}
          </button>
        </>
      ) : null}

      <Note>{t.scanNote}</Note>
    </section>
  );
}

export function CountPanel({
  lang,
  rows = COUNT_ITEMS,
  live = false,
}: {
  lang: Lang;
  /**
   * The shelf, from `GET /api/v1/inventory/ingredients`.
   *
   * The rows carry what is on hand and this screen never draws it — the design's
   * rule and the console's, for the same reason: somebody counting a shelf while
   * looking at what the computer expects counts to it. What the live list adds
   * is the **id**, and without one a count has nothing to post.
   */
  rows?: readonly { id: string; name: ShelfRow['name']; unit: ShelfRow['unit'] }[];
  live?: boolean;
}) {
  const t = copy(STORE_COPY, lang);
  const shared = copy(SHARED, lang);
  const f = copy(FLASH, lang);

  const [counted, setCounted] = useState<Record<string, string>>({});
  const [saved, setSaved] = useState(false);

  const done = rows.filter((item) => (counted[item.id] ?? '').trim() !== '').length;

  return (
    <>
      {/* See `ReceivingPanel` — a live sheet queues, a fixture one does not. */}
      <NotWired>{live ? shared.queued : shared.notWired}</NotWired>

      {/*
       * The rule, said out loud where somebody is about to count. Without the
       * sentence the missing column reads as a screen that failed to load.
       */}
      <p className="border-border bg-bg-subtle text-2xs mb-3.5 rounded-[10px] border px-3 py-2.5 leading-normal">
        {t.hidden}
      </p>

      <SectionLabel>
        {t.progress.replace('{done}', String(done)).replace('{total}', String(rows.length))}
      </SectionLabel>

      <ul className="flex flex-col gap-2">
        {rows.map((item) => (
          <li
            key={item.id}
            className="border-border bg-surface flex items-center gap-3 rounded-[14px] border px-4 py-3"
          >
            <span className="min-w-0 flex-1 text-sm font-semibold">{say(item.name, lang)}</span>

            <input
              inputMode="decimal"
              value={counted[item.id] ?? ''}
              onChange={(event) => {
                setCounted((current) => ({ ...current, [item.id]: event.target.value }));
                setSaved(false);
              }}
              aria-label={say(item.name, lang)}
              data-num
              className="border-border bg-bg-subtle h-12 w-24 rounded-[11px] border px-3 text-right text-base font-semibold"
            />
            <span className="text-fg-subtle w-10 flex-none text-xs">{say(item.unit, lang)}</span>
          </li>
        ))}
      </ul>

      <button
        type="button"
        data-press
        disabled={done < rows.length || saved}
        onClick={() => {
          /*
           * One entry per line, not one document.
           *
           * `POST /inventory/counts` takes the whole sheet at once and is what
           * the console's operations tab uses; the phone posts through
           * `staff/actions` instead, and the difference is the store room. A
           * count typed on a handset with no signal has to survive the walk to
           * the office, and a phone that dies at row nineteen must have
           * recorded the eighteen that were counted — which one document,
           * assembled and sent at the end, cannot do.
           *
           * The variance is still the server's. `StockLedger::recordCount`
           * takes what was counted, absolute and in base units, and works out
           * the gap itself: the quantity on screen is never compared to a
           * system figure on the phone, because the phone must not hold one.
           */
          for (const item of rows) {
            const typed = Number((counted[item.id] ?? '').replace(',', '.').trim());
            const ingredientId = realId(item.id);

            if (ingredientId === null || !Number.isFinite(typed) || typed < 0) continue;

            enqueue(t.countSaved, say(item.name, lang), {
              kind: 'count_submit',
              // Base units, as the column holds them — the input is in the
              // shelf's own unit and `onHandLabel` is the only place that
              // conversion is decided. Rounded because a count is a count.
              payload: { ingredient_id: ingredientId, counted: Math.round(typed) },
            });
          }

          void drain();
          setSaved(true);
          flash(f.countSaved);
        }}
        className="bg-acc mt-4 h-13 w-full rounded-[11px] py-3.5 text-sm font-semibold text-white disabled:opacity-45"
      >
        {saved ? t.countSaved : t.finish}
      </button>

      <Note>{t.countNote}</Note>
    </>
  );
}

export function StockPanel({
  lang,
  rows = STOCK,
}: {
  lang: Lang;
  /** The same read the count sheet uses — see `crew-server.ts`'s `shelf()`. */
  rows?: readonly { id: string; name: ShelfRow['name']; onHand: string; days: number }[];
}) {
  const t = copy(STORE_COPY, lang);

  return (
    <>
      <SectionLabel>{t.cover}</SectionLabel>

      <ul className="flex flex-col gap-2">
        {rows.map((row) => {
          /*
           * Days of cover, not quantity, decides the colour. Twelve kilograms
           * of beef is a crisis and forty-eight of rice is fine; a threshold on
           * the number would colour the wrong row every time.
           */
          const tone =
            row.days < 1.5
              ? 'text-danger-700 bg-danger-50'
              : row.days < 3
                ? 'text-warning-700 bg-warning-50'
                : 'text-fg-muted bg-bg-muted';

          return (
            <li
              key={row.id}
              className="border-border bg-surface flex items-center gap-3 rounded-[14px] border px-4 py-3"
            >
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold">{say(row.name, lang)}</span>
                <span data-num className="text-fg-subtle block text-xs">
                  {row.onHand}
                </span>
              </span>

              <span
                data-num
                className={`rounded-pill flex-none px-2.5 py-1 text-xs font-semibold ${tone}`}
              >
                {t.days.replace('{n}', row.days.toFixed(1))}
              </span>
            </li>
          );
        })}
      </ul>

      <Note>{t.stockNote}</Note>
    </>
  );
}
