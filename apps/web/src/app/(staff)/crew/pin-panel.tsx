'use client';

import { flash } from '@restaurant/ui';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { copy, fill, FLASH, PIN } from '@restaurant/surfaces/crew/copy';
import { crewSurfaceFor, type Lang } from '@restaurant/surfaces/crew/data';

/** How many wrong tries before a manager has to be found. */
const MAX_ATTEMPTS = 3;

type Status =
  'idle' | 'sending' | 'rejected' | 'locked' | 'not_enrolled' | 'no_surface' | 'unreachable';

/**
 * The keypad, and the only door into this app.
 *
 * It is a real form: four digits, a real POST, real states, and — since
 * `POST /api/v1/staff/auth/pin` landed — a real session at the end of it. Two
 * credentials get somebody in: the device token this handset was enrolled with,
 * and the PIN typed here. Neither is readable from script.
 *
 * Three refusals are told apart because a person does three different things
 * about them. A wrong PIN is retried; a locked PIN means waiting or finding a
 * manager; an unenrolled handset means finding a manager *first*, and must not
 * cost one of the three attempts — burning them on a phone that was never
 * enrolled would lock somebody out of a shift over a problem they did not
 * cause.
 *
 * **The demo affordances are gone.** The design file lists the five demo PINs
 * under the keypad (1111 owner, 2222 manager, and so on) and puts four
 * one-tap role cards above it. Shipping a list of working PINs on a sign-in
 * screen is not a design decision, it is a security incident with a stylesheet.
 * The role comes from the PIN, and the PIN comes from a person.
 *
 * A client component because a keypad is state per keystroke; nothing about the
 * screen around it needs to be.
 */
export function PinPanel({ lang }: { lang: Lang }) {
  const t = copy(PIN, lang);
  const f = copy(FLASH, lang);

  const router = useRouter();

  const [pin, setPin] = useState('');
  const [code, setCode] = useState('');
  const [enrolling, setEnrolling] = useState(false);
  const [enrolFailed, setEnrolFailed] = useState(false);
  const [lockMinutes, setLockMinutes] = useState(15);
  const [status, setStatus] = useState<Status>('idle');
  const [attempts, setAttempts] = useState(0);

  const lockedOut = attempts >= MAX_ATTEMPTS;
  const busy = status === 'sending';
  const failed = status !== 'idle' && status !== 'sending';

  async function submit(code: string) {
    setStatus('sending');

    try {
      const response = await fetch('/crew/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin: code }),
      });

      const body = (await response.json().catch(() => null)) as {
        person?: { name?: string; roles?: string[] };
        code?: string;
        retry_after_minutes?: number;
      } | null;

      if (response.ok) {
        /*
         * Which workspace this person gets.
         *
         * From the server's roles, mapped by `crewSurfaceFor`. Null is a real
         * answer rather than a fallback: a cashier has no staff-app surface —
         * theirs is the till — and dropping them onto the waiter's screen would
         * show them somebody else's tables.
         */
        const surface = crewSurfaceFor(body?.person?.roles ?? []);

        if (surface === null) {
          setStatus('no_surface');
          setPin('');

          return;
        }

        /*
         * Named, not just admitted.
         *
         * The design opens a shift with "Shift started · Waiter · Jasur
         * Toshev", and the name is the point on a handset two people share:
         * the whole failure this app has to prevent is a second person picking
         * the phone up and recording an hour of work against the first one.
         * Saying whose session just opened, on the way in, is the cheapest
         * check there is.
         */
        flash(f.shiftStarted + (body?.person?.name ?? ''));

        router.push(`/crew/${surface}`);
        router.refresh();

        return;
      }

      /*
       * Only "that PIN did not match" advances this screen's counter.
       *
       * An unenrolled handset is a problem with the phone, not the person, and
       * costing them an attempt for it would lock them out of a shift over
       * something only a manager can fix. The server's own lockout is separate
       * and stricter — it counts across the till too — which is why it is shown
       * rather than folded into the three.
       */
      if (response.status === 409) {
        setStatus('not_enrolled');
      } else if (body?.code === 'staff.pin_locked') {
        setLockMinutes(body.retry_after_minutes ?? 15);
        setStatus('locked');
      } else if (response.status === 422 || response.status === 401 || response.status === 403) {
        setAttempts((count) => count + 1);
        setStatus('rejected');
      } else {
        setStatus('unreachable');
      }
    } catch {
      setStatus('unreachable');
    }

    setPin('');
  }

  /** Exchange a manager's eight characters for this handset's device token. */
  async function enrol() {
    if (enrolling) return;

    setEnrolling(true);

    try {
      const response = await fetch('/crew/enrol', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code }),
      });

      if (response.ok) {
        // The phone is enrolled; the person still has to type their PIN. Back
        // to the keypad with the counter untouched — enrolling is not an
        // attempt at anything.
        setStatus('idle');
        setCode('');
      } else {
        setStatus('not_enrolled');
        setEnrolFailed(true);
      }
    } catch {
      setStatus('unreachable');
    } finally {
      setEnrolling(false);
    }
  }

  function press(key: string) {
    if (busy || lockedOut) return;

    if (key === 'clear') {
      setPin('');
      setStatus('idle');
      return;
    }

    if (key === 'back') {
      setPin((current) => current.slice(0, -1));
      setStatus('idle');
      return;
    }

    const next = (pin + key).slice(0, 4);
    setPin(next);
    setStatus('idle');

    // Four digits is the whole entry, so there is no separate submit button to
    // reach for. A waiter typing one-handed while carrying plates should not
    // have to find a fifth target after the fourth.
    if (next.length === 4) void submit(next);
  }

  return (
    <div className="flex flex-1 flex-col">
      {/*
       * The four cells are one field, not four. A screen reader announcing
       * "edit text, blank" four times says nothing useful; one group with a
       * name and a live value says what has been typed so far.
       */}
      <div
        role="group"
        aria-label={t.fieldLabel}
        className="mt-5 flex justify-center gap-3"
        data-num
      >
        {[0, 1, 2, 3].map((index) => {
          const filled = pin.length > index;
          const active = pin.length === index && !failed && !lockedOut;

          return (
            <span
              key={index}
              aria-hidden
              className={`font-display grid h-14 w-[46px] place-items-center rounded-[13px] border-[1.5px] text-2xl font-bold ${
                failed || lockedOut
                  ? 'border-danger-500 bg-danger-50 text-danger-700'
                  : active
                    ? 'border-brand-500 bg-bg-subtle text-fg'
                    : 'border-border-strong bg-bg-subtle text-fg'
              }`}
            >
              {filled ? '•' : ''}
            </span>
          );
        })}
      </div>
      <span className="sr-only" aria-live="polite">
        {pin.length}/4
      </span>

      {/*
       * A fixed-height slot for the message, so the keypad does not jump down
       * the screen when a failure appears. On a phone that shift is enough to
       * put a thumb on 8 instead of 5.
       */}
      <div className="mt-2 min-h-9 px-1 text-center">
        {lockedOut ? (
          <p className="text-danger-700 text-2xs font-semibold">{t.lockedOut}</p>
        ) : busy ? (
          <p className="text-fg-subtle text-2xs font-semibold">{t.submitting}</p>
        ) : status === 'rejected' ? (
          <p className="text-danger-600 text-2xs font-semibold">{t.rejected}</p>
        ) : status === 'unreachable' ? (
          <p className="text-danger-600 text-2xs font-semibold">{t.unreachable}</p>
        ) : status === 'locked' ? (
          <p className="text-danger-700 text-2xs font-semibold">
            {fill(t.lockedServer, { minutes: lockMinutes })}
          </p>
        ) : status === 'no_surface' ? (
          <p className="text-danger-700 text-2xs font-semibold">{t.noSurface}</p>
        ) : status === 'not_enrolled' ? (
          <p className="text-danger-700 text-2xs font-semibold">{t.notEnrolledTitle}</p>
        ) : null}
      </div>

      <div className="grid grid-cols-3 gap-2.5">
        {['1', '2', '3', '4', '5', '6', '7', '8', '9', 'clear', '0', 'back'].map((key) => {
          const digit = /^\d$/.test(key);

          return (
            <button
              key={key}
              type="button"
              data-press
              disabled={busy || lockedOut}
              onClick={() => press(key)}
              aria-label={key === 'clear' ? t.clear : key === 'back' ? t.backspace : key}
              /*
               * 58px, from the design, and well over the 44px floor. This is
               * pressed with a thumb by someone standing up, and the keypad is
               * the one place in the app where a mis-tap costs an attempt.
               */
              className={`font-display grid h-[58px] place-items-center rounded-[14px] text-[21px] font-semibold disabled:opacity-45 ${
                digit ? 'border-border bg-surface text-fg border' : 'text-fg-muted border-0'
              }`}
            >
              {key === 'clear' ? 'C' : key === 'back' ? '⌫' : key}
            </button>
          );
        })}
      </div>

      {/*
       * Where the demo PIN list used to be: the one thing a person can actually
       * do about a handset nobody has enrolled.
       *
       * Shown only in that state. A pairing field on every sign-in would invite
       * somebody to type a code they were given weeks ago and wonder why it no
       * longer works — a code lives ten minutes.
       */}
      {status === 'not_enrolled' ? (
        <div className="border-danger-500/40 bg-danger-50 mt-5 rounded-[12px] border p-3.5">
          <p className="text-danger-700 text-sm leading-snug font-semibold">{t.notEnrolledTitle}</p>
          <p className="text-fg-muted mt-1.5 text-xs leading-normal">{t.notEnrolledBody}</p>

          <label className="mt-3 block">
            <span className="text-fg-subtle text-2xs font-semibold">{t.enrolLabel}</span>
            <input
              value={code}
              onChange={(event) => {
                // Upper-cased and stripped as it is typed. The alphabet has no
                // I, O, 0 or 1 precisely because the code is read out loud, and
                // a field that accepted them would collect the mishearing.
                setCode(
                  event.target.value
                    .toUpperCase()
                    .replace(/[^A-Z2-9]/g, '')
                    .slice(0, 8),
                );
                setEnrolFailed(false);
              }}
              inputMode="text"
              autoCapitalize="characters"
              autoCorrect="off"
              spellCheck={false}
              aria-label={t.enrolLabel}
              className="border-border bg-surface mt-1 h-12 w-full rounded-[12px] border px-3 text-center font-mono text-lg tracking-[0.3em]"
            />
          </label>

          <button
            type="button"
            disabled={enrolling || code.length !== 8}
            onClick={enrol}
            className="bg-brand-500 mt-2.5 grid h-12 w-full place-items-center rounded-[12px] text-sm font-semibold text-white disabled:opacity-50"
          >
            {enrolling ? t.enrolWorking : t.enrolSubmit}
          </button>

          {enrolFailed ? (
            <p className="text-danger-700 mt-2 text-xs leading-normal">{t.enrolFailed}</p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
