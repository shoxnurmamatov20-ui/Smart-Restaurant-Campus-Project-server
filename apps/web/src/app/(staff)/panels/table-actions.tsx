'use client';

import { flash } from '@restaurant/ui';
import Link from 'next/link';

import { useState } from 'react';

import { copy, FLASH, SHARED, TABLES_COPY } from '@restaurant/surfaces/crew/copy';
import type { Lang } from '@restaurant/surfaces/crew/data';
import { Note, NotWired } from './bits';

/**
 * The five things a waiter does at a table.
 *
 * The design puts all five under the table detail and the screen carried one
 * line of prose saying none of them existed. That is the wrong shape of
 * honesty: a waiter standing at table 12 needs to know *what the app can do*,
 * and a sentence listing five absent features tells them to go and find a
 * tablet without saying which of the five they could have done there either.
 *
 * So the buttons are drawn and they record locally, and the disclosure above
 * them says exactly that. `SHARED.notWired` sits above rather than below, for
 * the reason `bits.tsx` gives: it has to be read before the button.
 *
 * The order is the design's, and it is a hierarchy rather than a list. *Bring
 * the bill* is the errand a guest has actually asked for and it is the one a
 * thumb finds first; *transfer* is the rarest and the most disruptive, so it is
 * last and is not filled.
 */
export function TableActions({
  lang,
  tableLabel,
  orderHref,
  orderId,
  live = false,
}: {
  lang: Lang;
  tableLabel: string;
  /** Where *Add items* goes — the one action that has a screen of its own. */
  orderHref: string;
  /**
   * The open bill on this table, when the floor is live and there is one.
   *
   * The bill rather than the table, because `POST /kitchen/receipts` names an
   * order: a table carries up to four at once, so a printer asked for "table
   * 12" would have to choose, and the one it chose would sometimes be the party
   * that already left.
   */
  orderId?: number;
  live?: boolean;
}) {
  const t = copy(TABLES_COPY, lang);
  const shared = copy(SHARED, lang);
  const f = copy(FLASH, lang);

  const [done, setDone] = useState<ReadonlySet<string>>(new Set());
  const [busy, setBusy] = useState(false);

  /*
   * Each of the five says what it did, in the design's own words — and the
   * words are not interchangeable. "Bill printed · the cashier has been
   * notified" and "sent to the manager · awaiting approval" tell a waiter two
   * different things about whether they can walk away from the table. A generic
   * "done" would throw that away, which is the whole reason the design writes
   * five sentences rather than one.
   *
   * ---------------------------------------------------------------------------
   * Only one of them reaches the server, and the other two say why
   *
   * **Bring the bill** does: `POST /crew/print` puts a receipt on the spooler
   * through `kitchen/receipts`, which is a `pos.sell` document a waiter is
   * entitled to and a cook is not. That is the sentence about the cashier being
   * notified, and it is now true.
   *
   * **Ask for a discount** does not, and this is a boundary rather than a gap.
   * `POST /pos/approvals` sits inside the till's `pos.session` group and is
   * raised against a terminal and the shift standing at it; a phone holds a
   * PIN-opened staff session and no terminal. Approvals are anchored to a till
   * on purpose — the amount, the ceiling and the audit trail all hang off that
   * shift — so the request is made where the bill is, and the manager answers
   * it here, which is what the approvals tab is for.
   *
   * **Transfer** is the odd one out and is not recorded even locally, because
   * the honest answer is where it happens. It flashes and stays pressable.
   */
  const mark = (key: string, message: string) => {
    if (key !== 'transfer') setDone((current) => new Set(current).add(key));

    flash(message);
  };

  /** The one control here that leaves the phone. */
  const printBill = async () => {
    if (busy) return;

    /*
     * No live bill to name. The floor is fixtures, or the table is free —
     * either way the strip above has already said the screen is a sample, and
     * posting an id that names nothing would turn that into a server error
     * about a request that should never have been made.
     */
    if (orderId === undefined) {
      mark('bill', f.billPrinted);

      return;
    }

    setBusy(true);

    let printed = false;

    try {
      const response = await fetch('/crew/print', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId }),
      });

      // Not `ok` alone: a POST with no shift cookie is redirected to the
      // keypad and followed, which answers 200 with the pad's HTML.
      printed = response.ok && !response.redirected;
    } catch {
      printed = false;
    }

    setBusy(false);

    if (!printed) {
      // A reprint that did not happen has to be said out loud: a waiter who
      // walks to the till expecting a cheque and finds none has left a guest
      // waiting twice.
      flash.problem(t.actionsPending);

      return;
    }

    mark('bill', f.billPrinted);
  };

  const ACTIONS: readonly {
    key: string;
    label: string;
    /** What is said when it is pressed. Never composed — see above. */
    said: string;
    primary?: boolean;
    href?: string;
  }[] = [
    /*
     * Adding items is first and it is a link, because it is the only one of
     * the five with somewhere to go — the order flow. The other four record
     * locally and say so; a link into nothing would be worse than a button
     * that admits what it did.
     */
    { key: 'add', label: t.actAdd, said: '', primary: true, href: orderHref },
    { key: 'bill', label: t.actBill, said: f.billPrinted },
    { key: 'bills', label: t.actBills, said: t.actDone },
    { key: 'discount', label: t.actDiscount, said: f.discountAsked },
    { key: 'transfer', label: t.actTransfer, said: f.transferElsewhere },
  ];

  return (
    <section className="mt-5">
      {/* On a live table the bill really prints, so the blanket disclosure would
          be wrong about the one control that matters most. The other two say
          what they are in the block comment above and in the note below. */}
      {live && orderId !== undefined ? null : <NotWired>{shared.notWired}</NotWired>}

      <div className="flex flex-col gap-2">
        {ACTIONS.map((action) => {
          const isDone = done.has(action.key);

          if (action.href !== undefined) {
            return (
              <Link
                key={action.key}
                href={action.href}
                data-press
                className="bg-acc flex h-13 items-center justify-between rounded-[11px] px-4 py-3.5 text-sm font-semibold text-white"
              >
                <span>{action.label}</span>
                <span aria-hidden>→</span>
              </Link>
            );
          }

          return (
            <button
              key={action.key}
              type="button"
              data-press
              onClick={() =>
                action.key === 'bill' ? void printBill() : mark(action.key, action.said)
              }
              aria-label={`${action.label} — ${tableLabel}`}
              disabled={isDone || (busy && action.key === 'bill')}
              className={`flex h-13 items-center justify-between rounded-[11px] px-4 py-3.5 text-sm font-semibold ${
                isDone
                  ? 'bg-bg-muted text-fg-subtle'
                  : action.primary
                    ? 'bg-acc text-white'
                    : 'border-border bg-surface border'
              }`}
            >
              <span>{action.label}</span>
              {isDone ? <span className="text-2xs">{t.actDone}</span> : <span aria-hidden>→</span>}
            </button>
          );
        })}
      </div>

      <Note>{t.actionsPending}</Note>
    </section>
  );
}
