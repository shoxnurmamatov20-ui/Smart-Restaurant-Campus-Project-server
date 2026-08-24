'use client';

import { useState, useSyncExternalStore } from 'react';
import { useLocale } from 'next-intl';
import { flash } from '@restaurant/ui';

import { fill, POS_COPY, say } from './pos-copy';

import {
  markConflict,
  resolvePointers,
  serverSnapshot,
  settle,
  snapshot,
  subscribe,
  type ConflictKind,
  type QueuedEntry,
} from './pos-queue';

/**
 * The stranded shift, and the questions it came back with.
 *
 * Two jobs that belong together because a cashier experiences them as one: hand
 * the queue back, and answer whatever the server could not decide alone. Split
 * across two screens, the second would be the one nobody opens — a badge saying
 * "3 unanswered" on a panel a waiter has already closed is a queue that never
 * drains.
 *
 * ---------------------------------------------------------------------------
 * The drain is manual, and that is deliberate
 *
 * It would be easy to fire this on `online` and be done. But a drain can raise
 * six questions with money on both sides of each, and firing it while a waiter
 * is mid-order puts a modal over a bill they are ringing up — so it happens when
 * somebody opens this panel and presses the button. The badge is what makes that
 * reliable: it is on the till's chrome, it counts, and it does not go away.
 *
 * ---------------------------------------------------------------------------
 * What the answers mean is NOT decided here
 *
 * The options come from the server, in the server's order, and the first is the
 * one this defaults to. Three of those orders are deliberately against the
 * reflex — `keep` before `void_line`, `amend_closed` before `post_to_current`,
 * `reopen` before `discard` — and hard-coding a different default here would
 * quietly undo the reasoning in `ConflictKind`. The screen renders what it is
 * given.
 */
type Messages = {
  syncTitle: string;
  syncSub: string;
  syncNone: string;
  syncNoneSub: string;
  syncQueued: string;
  syncResolve: string;
  syncWorking: string;
  syncResolved: string;
  syncFailed: string;
  syncReason: string;
  syncPickFirst: string;
  syncNeedsDish: string;
  syncNeedsTable: string;
  syncNeedsBill: string;
  [key: string]: string;
};

/** Copy key for a kind, and for the sentence under it. */
const KIND_KEY: Readonly<Record<ConflictKind, string>> = {
  bill_settled: 'conflictBillSettled',
  payment_duplicate: 'conflictPaymentDuplicate',
  item_unavailable: 'conflictItemUnavailable',
  price_moved: 'conflictPriceMoved',
  table_taken: 'conflictTableTaken',
  shift_closed: 'conflictShiftClosed',
};

/**
 * Copy key for an option id.
 *
 * A map rather than a camel-caser, so an option the server adds without copy
 * being written for it renders its raw id instead of a blank button — visibly
 * wrong to whoever is testing, rather than invisibly wrong to a cashier.
 */
const OPTION_KEY: Readonly<Record<string, string>> = {
  reopen: 'optReopen',
  new_bill: 'optNewBill',
  discard: 'optDiscard',
  refund_duplicate: 'optRefundDuplicate',
  keep: 'optKeep',
  substitute: 'optSubstitute',
  void_line: 'optVoidLine',
  honour_quoted: 'optHonourQuoted',
  reprice: 'optReprice',
  merge: 'optMerge',
  separate_bill: 'optSeparateBill',
  move_table: 'optMoveTable',
  amend_closed: 'optAmendClosed',
  post_to_current: 'optPostToCurrent',
};

/** What an option cannot be sent without. Mirrors `ConflictResolution::REQUIRES`. */
const NEEDS: Readonly<Record<string, { field: string; label: keyof Messages }>> = {
  substitute: { field: 'substitute_menu_item_id', label: 'syncNeedsDish' },
  move_table: { field: 'table_id', label: 'syncNeedsTable' },
  merge: { field: 'into_bill_id', label: 'syncNeedsBill' },
};

type BatchRow = {
  local_id: string;
  status: 'accepted' | 'duplicate' | 'conflict' | 'refused' | 'failed';
  code?: string;
  conflict_kind?: ConflictKind;
  options?: string[];
  context?: Record<string, unknown>;
  detail?: string;
  result?: { id?: number };
};

export function SyncPanel({
  terminal,
  m,
  open,
  onOpenChange,
  onBillChanged,
}: {
  /** The till's code. The queue is scoped to it — see `pos-queue.ts`. */
  terminal: string;
  m: Messages;
  /**
   * Whether the drawer is showing, held by the till rather than by this panel.
   *
   * It used to be local state, which made the badge the only way in — and the
   * design has two more: the health strip's *Navbatni ko'rish* button
   * (`dc.html:12574`) and the offline banner's *Navbatni ko'rish*
   * (`dc.html:9940`). Both are pressed at the moment the badge is least likely
   * to be on screen, because an empty queue hides it.
   */
  open: boolean;
  onOpenChange: (next: boolean) => void;
  /** A bill this drain touched, so the order screen can reread it. */
  onBillChanged?: (billId: number) => void;
}) {
  const locale = useLocale();
  const [working, setWorking] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  /*
   * Whether this tablet believes it has a network, for the header button's
   * three states. A weak signal used only to choose a label — nothing here is
   * gated on it, and the queue is the same queue either way.
   */
  const online = useSyncExternalStore(
    (onChange: () => void) => {
      window.addEventListener('online', onChange);
      window.addEventListener('offline', onChange);

      return () => {
        window.removeEventListener('online', onChange);
        window.removeEventListener('offline', onChange);
      };
    },
    () => navigator.onLine,
    () => true,
  );

  /*
   * The queue is a store outside React, so React is told about it the way it
   * asks to be.
   *
   * The first version held it in `useState` and filled it from an effect. That
   * works and is wrong twice: it sets state synchronously on mount, which the
   * compiler flags as a cascading render, and it reads `localStorage` in a place
   * that has to agree with a server render where there is no `localStorage` at
   * all. `serverSnapshot` answers the truth — a server cannot know a till's
   * queue — and the client snapshot is cached in the module so it stays
   * referentially stable between writes.
   */
  const entries = useSyncExternalStore(subscribe, () => snapshot(terminal), serverSnapshot);

  const waiting = entries.length;
  const questions = entries.filter((entry) => entry.conflict !== undefined);

  async function drain() {
    if (working || entries.length === 0) return;

    setWorking(true);
    setNote(null);

    try {
      const response = await fetch('/api/pos/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          entries: entries.map((entry) => ({
            local_id: entry.local_id,
            local_seq: entry.local_seq,
            action: entry.action,
            payload: entry.payload,
          })),
        }),
      });

      const body = (await response.json().catch(() => null)) as {
        data?: BatchRow[];
        error?: { conflict_kind?: ConflictKind; options?: string[]; detail?: string };
      } | null;

      if (!response.ok || body?.data === undefined) {
        /*
         * A batch of one answers in the single-write shape — 409 with the
         * conflict on the error, not a row. Handled rather than treated as a
         * failure, because a queue often IS one entry: the cashier resolved
         * three and resent the fourth.
         */
        const single = body?.error;

        if (response.status === 409 && single?.conflict_kind !== undefined && entries[0]) {
          markConflict(terminal, entries[0].local_id, {
            kind: single.conflict_kind,
            options: single.options ?? [],
            context: {},
            detail: single.detail ?? '',
          });

          return;
        }

        setNote(m.syncFailed);

        return;
      }

      applyRows(body.data);
    } catch {
      setNote(m.syncFailed);
    } finally {
      setWorking(false);
    }
  }

  function applyRows(rows: readonly BatchRow[]) {
    const done: string[] = [];

    for (const row of rows) {
      if (row.status === 'accepted' || row.status === 'duplicate') {
        done.push(row.local_id);

        // The bill this entry opened now has a number, and everything queued
        // behind it was pointing at the entry rather than at a bill.
        if (typeof row.result?.id === 'number') {
          resolvePointers(terminal, row.local_id, row.result.id);
          onBillChanged?.(row.result.id);
        }

        continue;
      }

      if (row.status === 'conflict' && row.conflict_kind !== undefined) {
        markConflict(terminal, row.local_id, {
          kind: row.conflict_kind,
          options: row.options ?? [],
          context: row.context ?? {},
          detail: row.detail ?? '',
        });

        continue;
      }

      /*
       * Refused or failed, and deliberately left on the queue.
       *
       * These are the entries a person has to look at — a void the waiter was
       * never allowed, a bill that is simply gone. Dropping them would make the
       * badge reach zero while the writes behind it never happened, which is the
       * one thing this panel exists to make impossible.
       */
      setNote(row.detail ?? m.syncFailed);
    }

    // No `setState`: `settle()` writes through the store and every subscriber —
    // this panel included — is told. One source of truth for what is still owed.
    if (done.length > 0) settle(terminal, done);
  }

  async function answer(entry: QueuedEntry, option: string, extra: Record<string, unknown>) {
    if (working || entry.conflict === undefined) return;

    setWorking(true);
    setNote(null);

    try {
      const response = await fetch('/api/pos/sync?resolve=1', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          local_id: entry.local_id,
          local_seq: entry.local_seq,
          action: entry.action,
          payload: entry.payload,
          conflict_kind: entry.conflict.kind,
          option,
          with: extra,
        }),
      });

      const body = (await response.json().catch(() => null)) as {
        data?: { result?: { id?: number } };
        error?: { detail?: string };
      } | null;

      if (!response.ok || body?.data === undefined) {
        setNote(body?.error?.detail ?? m.syncFailed);
        flash.problem(body?.error?.detail ?? m.syncFailed);

        return;
      }

      if (typeof body.data.result?.id === 'number') {
        resolvePointers(terminal, entry.local_id, body.data.result.id);
        onBillChanged?.(body.data.result.id);
      }

      settle(terminal, [entry.local_id]);
      setNote(m.syncResolved);

      /*
       * The panel scrolls, and the answered question leaves it.
       *
       * A cashier working through six conflicts is looking at the list, not at
       * the row that just vanished from it — so without a toast the only proof
       * an answer landed is one fewer row on a screen that was already
       * changing. The badge count agrees a moment later.
       */
      flash(m.syncResolved);
    } catch {
      setNote(m.syncFailed);
      flash.problem(m.syncFailed);
    } finally {
      setWorking(false);
    }
  }

  /*
   * The header's network button — `dc.html:6397`, and it is always there.
   *
   * It used to hide itself whenever the queue was empty, which is the wrong way
   * round: the state a cashier most needs on screen is *online, nothing owed*,
   * and a control that only appears when something is wrong cannot say it. The
   * design draws three states in one button and never removes it — so the
   * absence of a warning is itself visible, rather than being indistinguishable
   * from a button that has not been drawn.
   */
  const state =
    questions.length > 0
      ? {
          /* A question beats every other state, including offline: the writes
           drain by themselves, an unanswered conflict never does. */
          label: say(locale, POS_COPY.netConflict),
          sub: fill(say(locale, POS_COPY.netQueued), { n: String(waiting) }),
          skin: 'border-[rgba(240,68,56,.4)] bg-danger-50 text-danger-600',
          live: undefined,
        }
      : !online
        ? {
            label: say(locale, POS_COPY.netOffline),
            sub: fill(say(locale, POS_COPY.netQueued), { n: String(waiting) }),
            skin: 'border-[rgba(247,144,9,.4)] bg-warning-50 text-warning-700',
            live: undefined,
          }
        : working
          ? {
              label: say(locale, POS_COPY.netSyncing),
              sub: fill(say(locale, POS_COPY.netLeft), { n: String(waiting) }),
              skin: 'border-brand-200 bg-brand-50 text-brand-700',
              live: 'true' as const,
            }
          : waiting > 0
            ? {
                label: m.syncTitle,
                sub: fill(say(locale, POS_COPY.netQueued), { n: String(waiting) }),
                skin: 'border-[rgba(247,144,9,.4)] bg-warning-50 text-warning-700',
                live: undefined,
              }
            : {
                label: say(locale, POS_COPY.netOnline),
                sub: say(locale, POS_COPY.netAllSent),
                skin: 'border-border bg-surface text-success-600',
                live: undefined,
              };

  return (
    <>
      <button
        type="button"
        onClick={() => onOpenChange(true)}
        className={`flex h-11 flex-none items-center gap-[9px] rounded-md border px-3.5 ${state.skin}`}
      >
        {/*
         * `currentColor`, so the dot is the state — one colour decision, not
         * two that can disagree. It breathes only while a drain is actually in
         * flight, which is `motion.css`'s rule for a live indicator: the loop is
         * allowed because it stops when the thing stops.
         */}
        <span
          aria-hidden
          data-live={state.live}
          className="size-2 flex-none rounded-full bg-current"
        />

        <span className="text-left">
          <span className="block text-sm leading-tight font-semibold">{state.label}</span>
          <span data-num className="text-2xs block opacity-80">
            {state.sub}
          </span>
        </span>
      </button>

      {open ? (
        <div
          role="dialog"
          aria-modal
          aria-label={m.syncTitle}
          data-fade
          className="fixed inset-0 z-50 flex items-stretch justify-end bg-black/40"
          onClick={(event) => {
            if (event.target === event.currentTarget) onOpenChange(false);
          }}
        >
          <div
            data-sheet
            className="bg-surface flex h-full w-full max-w-[520px] flex-col overflow-y-auto p-5"
          >
            <header className="flex items-start justify-between gap-3">
              <div>
                <h2 className="font-display text-xl font-semibold">{m.syncTitle}</h2>
                <p className="text-fg-subtle mt-0.5 text-sm leading-normal">{m.syncSub}</p>
              </div>

              <button
                type="button"
                onClick={() => onOpenChange(false)}
                aria-label="×"
                className="text-fg-muted grid h-11 w-11 flex-none place-items-center text-xl"
              >
                ×
              </button>
            </header>

            {entries.length === 0 ? (
              <div className="flex flex-1 flex-col items-center justify-center gap-2 text-center">
                <p className="text-md font-semibold">{m.syncNone}</p>
                <p className="text-fg-subtle text-sm">{m.syncNoneSub}</p>
              </div>
            ) : (
              <>
                <button
                  type="button"
                  onClick={drain}
                  disabled={working}
                  className="bg-acc mt-4 grid h-12 w-full place-items-center rounded-md text-base font-semibold text-white disabled:opacity-60"
                >
                  {working ? m.syncWorking : `${m.syncResolve} · ${waiting}`}
                </button>

                <ul className="mt-4 flex flex-col gap-3">
                  {entries.map((entry) => (
                    <QueueRow
                      key={entry.local_id}
                      entry={entry}
                      m={m}
                      working={working}
                      onAnswer={answer}
                    />
                  ))}
                </ul>
              </>
            )}

            {note !== null ? (
              <p role="status" className="text-fg-subtle mt-4 text-sm leading-normal">
                {note}
              </p>
            ) : null}
          </div>
        </div>
      ) : null}
    </>
  );
}

function QueueRow({
  entry,
  m,
  working,
  onAnswer,
}: {
  entry: QueuedEntry;
  m: Messages;
  working: boolean;
  onAnswer: (entry: QueuedEntry, option: string, extra: Record<string, unknown>) => void;
}) {
  // The server's own order: the first option is the one to default to, and three
  // of those defaults are deliberately against the reflex. See `ConflictKind`.
  const [option, setOption] = useState(entry.conflict?.options[0] ?? '');
  const [reason, setReason] = useState('');
  const [value, setValue] = useState('');

  const conflict = entry.conflict;
  const needs = NEEDS[option];

  if (conflict === undefined) {
    return (
      <li className="border-border rounded-md border px-3.5 py-3">
        <p className="text-sm font-semibold">{entry.action}</p>
        <p data-num className="text-fg-subtle mt-0.5 text-xs">
          #{entry.local_seq} · {m.syncQueued}
        </p>
      </li>
    );
  }

  const ready = option !== '' && (needs === undefined || /^\d+$/.test(value));

  return (
    <li className="border-warning-600 bg-surface rounded-md border px-3.5 py-3">
      <p className="text-sm font-semibold">{m[KIND_KEY[conflict.kind]]}</p>
      <p className="text-fg-subtle mt-0.5 text-xs leading-normal">
        {m[`${KIND_KEY[conflict.kind]}Why`]}
      </p>

      {conflict.detail !== '' ? (
        <p className="text-fg-muted mt-1 text-xs italic">{conflict.detail}</p>
      ) : null}

      <div
        role="radiogroup"
        aria-label={m[KIND_KEY[conflict.kind]] ?? ''}
        className="mt-2.5 flex flex-col gap-1.5"
      >
        {conflict.options.map((id) => (
          <label
            key={id}
            className={`flex cursor-pointer items-start gap-2 rounded-md border px-3 py-2 ${
              id === option ? 'border-acc bg-acc-soft' : 'border-border'
            }`}
          >
            <input
              type="radio"
              name={`opt-${entry.local_id}`}
              checked={id === option}
              onChange={() => setOption(id)}
              className="accent-acc mt-0.5 h-4 w-4 flex-none"
            />
            <span className="min-w-0">
              <span className="block text-sm font-semibold">{m[OPTION_KEY[id] ?? ''] ?? id}</span>
              <span className="text-fg-subtle block text-xs leading-normal">
                {m[`${OPTION_KEY[id] ?? ''}Why`] ?? ''}
              </span>
            </span>
          </label>
        ))}
      </div>

      {needs !== undefined ? (
        <label className="mt-2 block">
          <span className="text-fg-subtle text-xs">{m[needs.label]}</span>
          <input
            value={value}
            onChange={(event) => setValue(event.target.value.replace(/\D/g, ''))}
            inputMode="numeric"
            className="border-border bg-surface mt-1 h-11 w-full rounded-md border px-3 text-base"
          />
        </label>
      ) : null}

      {/*
       * The reason is offered on every answer, not only where it is required.
       *
       * Two of these — reopening a settled bill, amending a sealed shift — write
       * it into an audit trail an accountant reads back months later, and a
       * default sentence saying "offline queue" is what that trail looks like
       * when nobody was asked.
       */}
      <label className="mt-2 block">
        <span className="text-fg-subtle text-xs">{m.syncReason}</span>
        <input
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          maxLength={255}
          className="border-border bg-surface mt-1 h-11 w-full rounded-md border px-3 text-base"
        />
      </label>

      <button
        type="button"
        disabled={working || !ready}
        onClick={() =>
          onAnswer(entry, option, {
            ...(reason.trim() === '' ? {} : { reason: reason.trim() }),
            ...(needs === undefined ? {} : { [needs.field]: Number(value) }),
          })
        }
        className="border-border mt-2.5 h-11 w-full rounded-md border text-sm font-semibold disabled:opacity-50"
      >
        {working ? m.syncWorking : ready ? m.syncResolve : m.syncPickFirst}
      </button>
    </li>
  );
}
