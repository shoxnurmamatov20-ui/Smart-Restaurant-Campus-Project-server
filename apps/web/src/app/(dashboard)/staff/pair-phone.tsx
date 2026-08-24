'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { flash } from '@restaurant/ui';

import { post } from '@/lib/console-post';

/**
 * The crew app's door, per person, from the row that names them.
 *
 * Three presses cover the whole life of a login and every one of them shows
 * its secret exactly once, because the server keeps only hashes:
 *
 *   - **Open a login** — for somebody hired before logins came with hiring.
 *     `POST /staff/members/{member}/login` creates the account, gives it the
 *     role its position works as, and answers with a PIN.
 *   - **Pair a phone** — `POST /staff/devices/code`, the eight characters the
 *     employee types into the app. Issuing again is also the reset: a phone
 *     that was lost, or paired to the wrong person, is replaced by the next
 *     code, which deletes the old device's tokens.
 *   - **New PIN** — the same endpoint as opening, on an account that exists.
 *     A forgotten PIN is rotated, not looked up.
 *   - **Issue a password** — desk positions only (manager, accountant,
 *     operator): `POST /staff/members/{member}/password` answers with a
 *     console password and the login to type it after, which is the phone
 *     number when the person has one. A waiter never sees this link, and the
 *     server refuses it for them regardless.
 *
 * `POST /api/v1/staff/devices/code` had existed since the crew app did, and
 * nothing in this console called it: the endpoint issued eight characters a
 * manager could read out loud, and there was no screen to read them from. A
 * restaurant could install the staff app and never get past its first field —
 * which is what happened, the first time somebody tried.
 *
 * **Secrets are shown large, grouped, and copyable.** Eight characters at
 * `text-xl` with tabular figures, four and four, is what makes "is that a zero
 * or an O" not a question across a kitchen. Pressing the code copies it, for
 * the manager who would rather send it than say it; what goes to the clipboard
 * is the code itself, since the phone's field wants exactly eight
 * (`PairDeviceRequest`: `size:8`) and the gap is only ever on this screen.
 */
export function PairPhone({
  memberId,
  userId,
  name,
  desk,
  labels,
}: {
  memberId: string;
  /** The login behind the person, or undefined when there is none yet. */
  userId: number | undefined;
  name: string;
  /** Whether this position works at the console — `CrewLogin::DESK_POSITIONS`. */
  desk: boolean;
  /** `console.staff`, the `pair_*` keys. */
  labels: Record<string, string>;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [shown, setShown] = useState<
    | { kind: 'code'; value: string; until: string | null }
    | { kind: 'pin'; value: string }
    | { kind: 'password'; value: string; login: string }
    | null
  >(null);

  const issueCode = async (): Promise<void> => {
    if (userId === undefined) return;

    setBusy(true);

    const answer = await post<{ code: string; expires_at: string | null }>(
      '/api/staff/device-code',
      { userId, label: name },
    );

    setBusy(false);

    if (!answer.ok) {
      flash.problem(answer.message ?? labels.pair_failed);
      return;
    }

    setShown({ kind: 'code', value: answer.data.code, until: answer.data.expires_at });
  };

  const openLogin = async (): Promise<void> => {
    setBusy(true);

    const answer = await post<{ pin: string; created: boolean }>('/api/staff/member-login', {
      memberId,
    });

    setBusy(false);

    if (!answer.ok) {
      flash.problem(answer.message ?? labels.pair_loginFailed);
      return;
    }

    setShown({ kind: 'pin', value: answer.data.pin });

    /*
     * Only when an account was created: the row's `userId` lives in the server
     * render, and the pairing button appears once the page has re-read it. A
     * rotated PIN changes nothing the table shows, and a refresh mid-read
     * would blank the one number the manager is reading out.
     */
    if (answer.data.created) router.refresh();
  };

  const issuePassword = async (): Promise<void> => {
    setBusy(true);

    const answer = await post<{ password: string; login: string; created: boolean }>(
      '/api/staff/member-password',
      { memberId },
    );

    setBusy(false);

    if (!answer.ok) {
      flash.problem(answer.message ?? labels.pair_passwordFailed);
      return;
    }

    setShown({ kind: 'password', value: answer.data.password, login: answer.data.login });

    if (answer.data.created) router.refresh();
  };

  const copy = async (value: string): Promise<void> => {
    try {
      await navigator.clipboard.writeText(value);
      flash(labels.pair_copied);
    } catch {
      // No clipboard — an http origin or a locked-down browser. The secret is
      // on the screen; there is nothing to apologise for.
    }
  };

  /*
   * Quiet links, not buttons: this sits under a name in a list of eight, and
   * eight bordered buttons would be the loudest thing on the screen. The
   * secret, when there is one, is the opposite — large, tinted, and above the
   * links, because it is the one thing here a manager is reading aloud.
   */
  const LINK =
    'text-fg-muted hover:text-fg text-2xs font-semibold whitespace-nowrap underline-offset-2 hover:underline disabled:opacity-50';

  /*
   * `flex-col` with the default `stretch`, and not `items-start`: in a column,
   * `items-start` sizes each child to its own content and lets it run past the
   * cell — the note below was drawn straight across the next column. Stretched,
   * the child is the cell's width and its words wrap inside it.
   */
  return (
    <span className="mt-0.5 flex min-w-0 flex-col gap-1">
      {shown === null ? null : (
        <span className="flex max-w-full min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5">
          <button
            type="button"
            data-num
            data-press
            onClick={() => void copy(shown.value)}
            title={labels.pair_copy}
            className="bg-brand-50 text-brand-700 font-display rounded-md px-2.5 py-1 text-xl font-bold tracking-[0.08em] whitespace-nowrap"
          >
            {shown.kind === 'pin'
              ? `PIN ${shown.value}`
              : shown.kind === 'password'
                ? shown.value
                : `${shown.value.slice(0, 4)} ${shown.value.slice(4)}`}
          </button>

          <span className="text-fg-subtle text-2xs leading-snug">
            {shown.kind === 'pin'
              ? labels.pair_pinOnce
              : shown.kind === 'password'
                ? /* The login beside the password, because the account's own
                     address may be the `.invalid` placeholder — the phone
                     number is what this person signs in with. */
                  `${shown.login} · ${labels.pair_passwordOnce}`
                : shown.until === null
                  ? labels.pair_once
                  : `${labels.pair_once} · ${labels.pair_until} ${clock(shown.until)}`}
          </span>
        </span>
      )}

      <span className="flex min-w-0 flex-wrap items-center gap-x-2.5 self-start">
        {userId === undefined ? (
          <>
            <button
              type="button"
              data-press
              disabled={busy}
              onClick={() => void openLogin()}
              className={LINK}
            >
              {labels.pair_openLogin}
            </button>
            {/* A desk hire's first press can be the password: the server
                opens the account on the way, so one press rather than two. */}
            {desk ? (
              <button
                type="button"
                data-press
                disabled={busy}
                onClick={() => void issuePassword()}
                className={LINK}
              >
                {labels.pair_password}
              </button>
            ) : null}
          </>
        ) : (
          <>
            <button
              type="button"
              data-press
              disabled={busy}
              onClick={() => void issueCode()}
              className={LINK}
            >
              {shown?.kind === 'code' ? labels.pair_again : labels.pair_button}
            </button>
            <button
              type="button"
              data-press
              disabled={busy}
              onClick={() => void openLogin()}
              className={LINK}
            >
              {labels.pair_newPin}
            </button>
            {desk ? (
              <button
                type="button"
                data-press
                disabled={busy}
                onClick={() => void issuePassword()}
                className={LINK}
              >
                {labels.pair_password}
              </button>
            ) : null}
          </>
        )}
      </span>
    </span>
  );
}

/** "14:32" in the reader's locale — a code lives fifteen minutes, so the hour matters. */
function clock(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}
