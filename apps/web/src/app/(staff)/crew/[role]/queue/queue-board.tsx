'use client';

import { flash } from '@restaurant/ui';
import Link from 'next/link';
import { useState } from 'react';

import { copy, fill, FLASH, QUEUE_COPY, SHARED } from '@restaurant/surfaces/crew/copy';
import type { Lang } from '@restaurant/surfaces/crew/data';
import { EmptyState, Note, SectionLabel } from '../../../panels/bits';
import { drain, useQueue, type QueueState } from '../../../crew-queue';

/**
 * What has not reached the server yet — flow F13's last screen.
 *
 * The staff app has an offline strip that says the connection is gone and had
 * nowhere to send anybody who wanted to know *what* was waiting. That is the
 * gap this closes: a waiter who cleared four calls down a lift shaft needs to
 * see four rows, in order, and be able to tell "queued" from "failed".
 *
 * **Order is preserved and shown.** First queued is first sent, and the note at
 * the foot says so, because the alternative is not a tidiness preference: a
 * cancellation that overtook the line it cancels would leave the kitchen
 * cooking a dish the guest sent back.
 *
 * **Its own store, not the till's.** The doc here used to say this list came
 * from `(pos)/pos/pos-queue.ts` so that a handset which is both a till and a
 * staff app would show one queue. That was the wrong shape: the two drain to
 * two endpoints under two credentials — `pos/sync/batch` against the terminal's
 * shift token, `staff/actions` against the person's PIN session — and they do
 * not share a vocabulary. Merging their views would mean a waiter pressing
 * retry on a cashier's tender. `crew-queue.ts` is this app's own, and the
 * `local_id` contract is identical so neither can double-write.
 *
 * **Retry sends the whole batch, not one row.** The server applies a batch in
 * the order it arrives and every entry carries the id it was minted with, so
 * resending all of them is safe and resending one of them out of order is not.
 */
export function QueueBoard({ lang, role }: { lang: Lang; role: string }) {
  const t = copy(QUEUE_COPY, lang);
  const shared = copy(SHARED, lang);
  const f = copy(FLASH, lang);

  const entries = useQueue();
  const [busy, setBusy] = useState(false);

  const retry = async () => {
    if (busy) return;

    setBusy(true);

    const result = await drain();

    setBusy(false);

    /*
     * Three different outcomes and three different sentences, because a person
     * does three different things about them. Sent means walk away; refused
     * means read the reason on the row; signed out means find the keypad, and
     * that one is the only failure this screen cannot fix by trying again.
     */
    if (result.signedOut) {
      flash.problem(shared.notWired);

      return;
    }

    if (result.sent > 0) flash(fill(f.queueSent, { n: result.sent }));
    if (result.sent === 0) flash.problem(t.failed);
  };

  const TONE: Record<QueueState, string> = {
    waiting: 'bg-bg-muted text-fg-muted',
    sending: 'bg-warning-50 text-warning-700',
    failed: 'bg-danger-50 text-danger-700',
  };

  const LABEL: Record<QueueState, string> = {
    waiting: t.waiting,
    sending: t.sending,
    failed: t.failed,
  };

  /*
   * The clock time of the press, in the reader's own locale.
   *
   * Not a relative "3 minutes ago": this list is read while deciding whether
   * something that happened at 21:14 ever reached the kitchen, and a relative
   * label makes two rows a minute apart look identical.
   */
  const clock = (at: number): string =>
    new Date(at).toLocaleTimeString(lang === 'uz' ? 'uz-UZ' : lang === 'ru' ? 'ru-RU' : 'en-GB', {
      hour: '2-digit',
      minute: '2-digit',
    });

  return (
    <section>
      <Link
        href={`/crew/${role}/more`}
        data-press
        className="text-fg-subtle -ml-1 inline-flex min-h-[var(--tap-min)] items-center gap-1.5 text-sm font-semibold"
      >
        ← {shared.back}
      </Link>

      <h1 className="font-display mt-2 text-2xl leading-tight font-semibold tracking-tight">
        {t.title}
      </h1>
      <p className="text-fg-subtle mt-1.5 text-xs leading-normal">{t.sub}</p>

      {entries.length === 0 ? (
        <>
          <SectionLabel>{t.empty}</SectionLabel>
          <EmptyState>{t.emptySub}</EmptyState>
        </>
      ) : (
        <>
          <ul className="mt-4 flex flex-col gap-2">
            {entries.map((entry) => (
              <li
                key={entry.id}
                className="border-border bg-surface flex items-center gap-3 rounded-[14px] border px-4 py-3"
              >
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold">{entry.label}</span>
                  <span data-num className="text-fg-subtle block text-xs">
                    {clock(entry.at)} · {entry.detail}
                  </span>
                  {/*
                    The server's own code for the refusal, shown on the row it
                    belongs to. `already_claimed` and `unknown_ingredient` need
                    two different things done about them, and a person who is
                    only told "failed" does neither.
                  */}
                  {entry.reason === undefined ? null : (
                    <span className="text-danger-700 text-2xs mt-0.5 block font-mono">
                      {entry.reason}
                    </span>
                  )}
                  {/*
                    An entry with no verb is not waiting for a connection — it
                    is waiting for a screen that has a real id to send. Saying
                    so stops a person pressing retry at it all evening.
                  */}
                  {entry.kind === undefined ? (
                    <span className="text-fg-subtle text-2xs mt-0.5 block">{shared.demoRow}</span>
                  ) : null}
                </span>

                <span
                  className={`rounded-pill text-2xs flex-none px-2.5 py-1 font-semibold ${TONE[entry.state]}`}
                >
                  {LABEL[entry.state]}
                </span>
              </li>
            ))}
          </ul>

          {/*
            One control for the list, not one per row — see the note above the
            component. Disabled while a drain is in flight so a second press
            cannot start a second batch over the first one's answer.
          */}
          <button
            type="button"
            data-press
            disabled={busy}
            onClick={() => void retry()}
            className="border-border-strong bg-surface text-fg mt-3.5 h-12 w-full rounded-[12px] border text-sm font-semibold disabled:opacity-45"
          >
            {busy ? t.sending : t.retry}
          </button>

          <Note>{t.order}</Note>
        </>
      )}
    </section>
  );
}
