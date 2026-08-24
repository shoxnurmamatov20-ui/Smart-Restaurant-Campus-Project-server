'use client';

import { useEffect, useState } from 'react';

import type { Messages } from '@/i18n';
import type { PosStaff } from '@/lib/pos-session';

/**
 * The manager, at the till, signing off what the cashier may not do alone.
 *
 * P9's other half. The approval queue answers the manager who is somewhere else
 * — in the office, in the car park, at the other branch — and that is the case
 * it was designed around. This is the case a restaurant actually does forty
 * times a shift: the waiter calls the manager over and the manager leans in and
 * types four digits on the tablet already in the waiter's hand.
 *
 * Its own file rather than one more sheet in `bill-actions.tsx`, because it is
 * not a bill action. Those four ask *what* to do to a bill; this one asks *who
 * is standing here*, which is why it is shaped like `who/who-panel.tsx` — a
 * name first, then a PIN — and why it carries no reason field. The reason was
 * given when the request was raised; the manager is agreeing to it, not
 * writing it.
 *
 * **A name, then a PIN, in that order.** Typing the PIN first would mean the
 * server has to find whoever it belongs to: a bcrypt per employee on every
 * attempt, and a four-digit space where roughly one guess in three hundred
 * lands on *somebody* — with the lockout counting against a different person
 * each time, so it never trips. The same reasoning as the sign-in keypad, and
 * it matters more here: this door approves money coming off a bill.
 *
 * Everything the sheet says exists in the catalogue already. Nothing here
 * invents a sentence, because a screen that a manager reads while a guest waits
 * is the last place to be improvising words.
 */
type PosCopy = Messages['console']['pos'];

const PIN_LENGTH = 4;

/** The keypad, as the design lays it out: 1-9, clear, 0, backspace. */
const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'C', '0', '⌫'] as const;

export function ApprovalSheet({
  m,
  approvalId,
  onClose,
  onApproved,
}: {
  m: PosCopy;
  /** The request the gate already raised — see `ApprovalGate::request()`. */
  approvalId: number;
  /**
   * Closed without an answer.
   *
   * Not a refusal. The request is already in the manager's queue and their
   * phone has already been told, so backing out here means "they are not in the
   * room" — the till says so and carries on waiting.
   */
  onClose: () => void;
  /** The PIN was accepted. The caller replays what was refused. */
  onApproved: () => void;
}) {
  const [staff, setStaff] = useState<PosStaff[] | null>(null);
  const [chosen, setChosen] = useState<PosStaff | null>(null);
  const [pin, setPin] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [working, setWorking] = useState(false);

  // Read once. The roster changes when a manager enrols somebody, which is not
  // something that happens while a guest is standing at the table.
  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        const response = await fetch('/api/pos/staff', { cache: 'no-store' });

        if (cancelled || !response.ok) return;

        const body = (await response.json()) as { staff: PosStaff[] };

        if (!cancelled) setStaff(body.staff);
      } catch {
        // The list stays null and the sheet says the till has nobody to offer,
        // which is the same thing this failure means to the person reading it.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  /*
   * The code is passed in rather than read from state.
   *
   * The keypad submits itself on the fourth digit, and that digit is the one
   * still on its way into state — a version of this that read `pin` would check
   * three digits and refuse every correct PIN. The same trap `who-panel.tsx`
   * documents, and the same answer.
   */
  function submit(code: string) {
    if (chosen === null || working || code.length !== PIN_LENGTH) return;

    setWorking(true);
    setMessage(null);

    void (async () => {
      try {
        const response = await fetch('/api/pos/approval/pin', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            approvalId,
            userId: chosen.user_id,
            pin: code,
            approved: true,
          }),
        });

        if (!response.ok) {
          const body = (await response.json().catch(() => null)) as { message?: string } | null;

          setMessage(body?.message ?? m.pinWrong);
          setPin('');
          setWorking(false);

          return;
        }

        onApproved();
      } catch {
        setMessage(m.pinWrong);
        setPin('');
        setWorking(false);
      }
    })();
  }

  /*
   * `pin` is read from this render rather than from an updater.
   *
   * Each press re-renders before the next one, so the value in hand is the true
   * one for this tap — and computing `next` here keeps `submit()` out of a
   * state updater, which React is allowed to run twice. Twice would be two PIN
   * attempts for one press, counted against the manager's lockout.
   */
  function press(key: (typeof KEYS)[number]) {
    if (working) return;

    if (key === 'C') {
      setPin('');
      setMessage(null);

      return;
    }

    if (key === '⌫') {
      setPin(pin.slice(0, -1));
      setMessage(null);

      return;
    }

    if (pin.length >= PIN_LENGTH) return;

    const next = pin + key;

    setPin(next);

    if (next.length === PIN_LENGTH) submit(next);
  }

  /* A manager who is locked out cannot approve anything, and the roster says
     which — offering the card would be a keypad that can only refuse. */
  const offered = (staff ?? []).filter((person) => !person.is_locked);

  return (
    <div
      data-fade
      className="fixed inset-0 z-[230] flex items-end justify-center sm:items-center"
      style={{ background: 'rgba(15,19,32,.45)' }}
      onClick={onClose}
      role="presentation"
    >
      <div
        data-sheet
        role="dialog"
        aria-modal="true"
        aria-label={m.needsApproval}
        onClick={(event) => event.stopPropagation()}
        className="bg-surface-raised w-full max-w-[420px] rounded-t-2xl border p-5 shadow-xl sm:rounded-2xl"
      >
        <h3 className="font-display text-lg font-semibold tracking-tight">{m.askManager}</h3>
        <p className="text-fg-muted mt-1.5 text-xs leading-normal">{m.needsApproval}</p>

        {chosen === null ? (
          <div className="mt-4 grid max-h-[46vh] gap-2 overflow-y-auto" data-scroll>
            {offered.length === 0 ? (
              <p className="text-fg-subtle py-6 text-center text-sm">{m.whoEmpty}</p>
            ) : (
              offered.map((person) => (
                <button
                  key={person.user_id}
                  type="button"
                  onClick={() => {
                    setChosen(person);
                    setPin('');
                    setMessage(null);
                  }}
                  className="hover:bg-bg-subtle flex min-h-[52px] items-center justify-between gap-3 rounded-md border px-4 text-left"
                >
                  <span className="text-sm font-semibold">{person.name}</span>
                  <span className="text-fg-subtle text-xs">{person.roles[0] ?? ''}</span>
                </button>
              ))
            )}
          </div>
        ) : (
          <>
            <div className="bg-bg-subtle mt-3.5 flex items-baseline justify-between rounded-md px-3.5 py-3">
              <span className="text-sm font-medium">{chosen.name}</span>
              <span className="text-fg-subtle text-xs">{m.pinTitle}</span>
            </div>

            {/* Four dots rather than the digits. The tablet is held between two
                people and a PIN drawn in full is a PIN the waiter now knows. */}
            <div className="mt-4 flex justify-center gap-3" aria-hidden>
              {Array.from({ length: PIN_LENGTH }, (_, index) => (
                <span
                  key={index}
                  className={`size-3 rounded-full ${
                    index < pin.length ? 'bg-brand-500' : 'bg-border'
                  }`}
                />
              ))}
            </div>

            {message === null ? null : (
              <p className="text-danger-600 mt-3 text-center text-xs font-semibold">{message}</p>
            )}

            {working ? (
              <p className="text-fg-subtle mt-3 text-center text-xs">{m.pinWorking}</p>
            ) : null}

            {/* 64px keys — the size somebody hits without looking. */}
            <div className="mt-4 grid grid-cols-3 gap-2">
              {KEYS.map((key) => (
                <button
                  key={key}
                  type="button"
                  disabled={working}
                  onClick={() => press(key)}
                  aria-label={key === 'C' ? m.pinClear : key === '⌫' ? m.pinDelete : key}
                  className="bg-bg-subtle h-16 rounded-md border text-lg font-semibold disabled:opacity-45"
                >
                  {key}
                </button>
              ))}
            </div>
          </>
        )}

        <button
          type="button"
          onClick={onClose}
          className="mt-4 h-12 w-full rounded-md border text-sm font-semibold"
        >
          {m.pinCancel}
        </button>
      </div>
    </div>
  );
}
