'use client';

import { useLocale } from 'next-intl';
import { useState } from 'react';
import { flash, StatusChip } from '@restaurant/ui';

import { apiId, post, type Lang } from '@/lib/console-post';

import { ApprovalPin } from '../approval-pin';

/**
 * The manager's approval queue, with the keypad behind it.
 *
 * A client leaf because approving is an interaction and the modal has state.
 * Everything it renders arrives already translated and already formatted — the
 * house pattern for client leaves in this console, so the message catalogue and
 * the money formatter stay on the server.
 *
 * Both answers are here. The queue shipped with an approve button and no
 * decline, which quietly makes refusal the thing you do by walking away — and
 * a request nobody answered looks identical to a request nobody saw. Declining
 * is a decision and it gets a button and an audit row like the other one.
 *
 * Decided rows stay in the list, greyed, with what was decided. They vanish on
 * the next load, which is the server's business; removing them here would make
 * a manager who mis-tapped unable to see what they had just done.
 *
 * ---------------------------------------------------------------------------
 * Where the answer goes, and what the keypad is for
 *
 * `POST /api/approvals` → `POST /api/v1/pos/approvals/{id}/decide`, on the
 * manager's own session token. The API refuses an approval decided by the
 * person who raised it and records who answered, so the decision has to travel
 * on the credential of whoever is sitting at this console — never the
 * terminal's, which is the other route.
 *
 * The keypad stays and does **not** authenticate. There is no console PIN door
 * (`auth/pin` mints a till session), so the four digits are a deliberate pause
 * with the reason on screen rather than a second credential; the server decides
 * on the bearer token. Removing the modal would make an approval a single tap
 * on a shared desktop, which is the failure §4.3 is written against.
 *
 * The row settles the moment it is answered and stays settled whatever comes
 * back. A queue whose rows jump back while a request is in flight is a queue a
 * manager double-taps; a refusal says so in the toast, which is where they are
 * already looking. Fixture rows (`ap-1`) never leave the browser — both call
 * sites still feed sample approvals, because `dashboard-map.ts` refuses to poll
 * this queue at all: it belongs on `notification.*`, not on a minute's cache.
 */
export type QueueItem = {
  id: string;
  /** Who asked. Already a person's name. */
  who: string;
  /** What they asked for, already worded — the permission-matrix label. */
  action: string;
  /** Formatted, or null where the action is not about money. */
  amount: string | null;
  minutesAgo: number;
};

export function ApprovalQueue({
  items,
  labels,
}: {
  items: readonly QueueItem[];
  labels: {
    approve: string;
    decline: string;
    approved: string;
    declined: string;
    /** `{who}` and `{what}` — the one line above the keypad. */
    reason: string;
    pinTitle: string;
    pinSub: string;
    cancel: string;
    digitsEntered: string;
  };
}) {
  const lang = useLocale() as Lang;
  const [asking, setAsking] = useState<QueueItem | null>(null);
  const [decided, setDecided] = useState<Record<string, 'approved' | 'declined'>>({});

  const reasonFor = (item: QueueItem) =>
    labels.reason
      .replace('{who}', item.who)
      .replace('{what}', item.amount ? `${item.action} · ${item.amount}` : item.action);

  /**
   * Settle the row, then tell the server.
   *
   * In that order on purpose — see the note above. The toast is the label the
   * row already shows, so a manager who looked away still reads the same word
   * twice; a refusal replaces it with the API's own sentence, which arrives in
   * the reader's language on the error envelope.
   */
  function decide(item: QueueItem, approved: boolean) {
    setDecided((current) => ({ ...current, [item.id]: approved ? 'approved' : 'declined' }));

    const told = approved ? labels.approved : labels.declined;
    const id = apiId(item.id);

    // A sample row. The toast is the whole feature on a console with no
    // session behind it, and sending `ap-1` upstream would earn a 404 the
    // screen would have to show as a real refusal.
    if (id === null) {
      flash(told);

      return;
    }

    void post('/api/approvals', { approvalId: id, approved }, lang).then((answer) => {
      if (answer.ok) {
        flash(told);

        return;
      }

      flash.problem(answer.message ?? told);
    });
  }

  return (
    <>
      <div className="flex flex-col gap-3">
        {items.map((item) => {
          const outcome = decided[item.id];

          return (
            <div
              key={item.id}
              className={`flex items-start gap-3 rounded-md border p-3.5 ${
                outcome ? 'bg-bg-muted' : 'bg-warning-50'
              }`}
            >
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke={outcome ? 'var(--fg-subtle)' : 'var(--warning-600)'}
                strokeWidth="2"
                strokeLinecap="round"
                className="mt-px flex-none"
                aria-hidden
              >
                <circle cx="12" cy="12" r="9" />
                <path d="M12 7.5v5l3 2" />
              </svg>

              <div className="min-w-0 flex-1">
                <div
                  className={`text-sm font-semibold ${outcome ? 'text-fg-muted' : 'text-warning-700'}`}
                >
                  {item.action}
                </div>
                <p
                  className={`mt-1 text-xs leading-normal ${
                    outcome ? 'text-fg-subtle' : 'text-warning-700 opacity-85'
                  }`}
                >
                  {item.who}
                  {item.amount === null ? null : (
                    <>
                      {' · '}
                      <span data-num>{item.amount}</span>
                    </>
                  )}
                </p>

                {outcome ? (
                  <p
                    className={`mt-2 text-xs font-semibold ${
                      outcome === 'approved' ? 'text-success-700' : 'text-danger-700'
                    }`}
                  >
                    {outcome === 'approved' ? labels.approved : labels.declined}
                  </p>
                ) : (
                  <div className="mt-2.5 flex gap-2">
                    {/*
                     * Approving opens the keypad; declining does not.
                     *
                     * The pause is there to stop a discount being waved through
                     * by somebody who did not read what it was for. Refusing is
                     * the conservative answer — nothing is given away — and
                     * putting a keypad in front of it would only make walking
                     * away cheaper than saying no, which is the habit the
                     * decline button exists to break.
                     */}
                    <button
                      type="button"
                      onClick={() => setAsking(item)}
                      className="bg-warning-500 h-8 rounded-md px-3 text-xs font-semibold text-white"
                    >
                      {labels.approve}
                    </button>
                    <button
                      type="button"
                      onClick={() => decide(item, false)}
                      className="text-fg-muted hover:bg-bg-muted h-8 rounded-md px-3 text-xs font-semibold"
                    >
                      {labels.decline}
                    </button>
                  </div>
                )}
              </div>

              <StatusChip tone={outcome ? 'neutral' : 'warning'} className="flex-none">
                {item.minutesAgo}′
              </StatusChip>
            </div>
          );
        })}
      </div>

      {asking ? (
        <ApprovalPin
          reason={reasonFor(asking)}
          labels={{
            title: labels.pinTitle,
            sub: labels.pinSub,
            cancel: labels.cancel,
            digitsEntered: labels.digitsEntered,
          }}
          onCancel={() => setAsking(null)}
          onApprove={() => {
            decide(asking, true);
            setAsking(null);
          }}
        />
      ) : null}
    </>
  );
}
