'use client';

import { useEffect, useState } from 'react';
import { useLocale, useMessages } from 'next-intl';
import { useRouter } from 'next/navigation';
import { flash } from '@restaurant/ui';

import type { Messages } from '@/i18n';
import { fill, POS_COPY, say } from '../pos-copy';
import type { PosStaff } from '@/lib/pos-session';

/**
 * Who is standing at the till.
 *
 * A name is tapped, then a PIN proves it — that order and not the other way
 * round. Typing a PIN first would mean the till has to find whoever it belongs
 * to, which is both slower and weaker: a four-digit secret shared across a
 * staff room collides, and a screen that accepts any PIN is a screen anybody
 * can walk up to and guess at.
 *
 * Everything here is sized for a hand, not a pointer. The cards are 44px and
 * more; the keypad keys are 64px, which is the size somebody hits without
 * looking while carrying three plates. No hover state carries meaning — a
 * tablet has no pointer, and a selection that only appears under a cursor is a
 * selection a waiter never sees.
 *
 * The PIN never reaches Laravel from the browser. It goes to this app's own
 * handler, which adds the device token the page cannot read.
 */

const PIN_LENGTH = 4;

/** The keypad, as the design lays it out: 1-9, clear, 0, backspace. */
const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'C', '0', '⌫'] as const;

type Chosen = { userId: number; name: string; role: string };

export function WhoPanel() {
  const messages = useMessages() as Messages;
  const m = messages.console.pos;
  const locale = useLocale();
  const router = useRouter();

  const [staff, setStaff] = useState<PosStaff[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [chosen, setChosen] = useState<Chosen | null>(null);
  const [role, setRole] = useState('all');
  const [pin, setPin] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [working, setWorking] = useState(false);

  /* The roles this branch actually has, in the order the names arrived. */
  const roles = (staff ?? []).reduce<{ id: string; label: string }[]>((list, person) => {
    const first = person.roles[0];

    if (first !== undefined && !list.some((entry) => entry.id === first)) {
      list.push({ id: first, label: first });
    }

    return list;
  }, []);

  const shown =
    role === 'all' ? (staff ?? []) : (staff ?? []).filter((person) => person.roles[0] === role);

  // Read once on mount. The list changes when a manager enrols somebody, which
  // is not something that happens while a waiter is looking at this screen.
  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        const response = await fetch('/api/pos/staff', { cache: 'no-store' });

        if (cancelled) return;

        if (!response.ok) {
          setFailed(true);

          return;
        }

        const body = (await response.json()) as { staff: PosStaff[] };
        setStaff(body.staff);
      } catch {
        if (!cancelled) setFailed(true);
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
   * still on its way into state — so a version of this that read `pin` would
   * check three digits and refuse every correct PIN. Everything else it needs
   * (`chosen`, `working`) is from the render the tap happened in, which is the
   * render whose values are true for that tap.
   */
  function submit(code: string) {
    if (chosen === null || working || code.length !== PIN_LENGTH) return;

    setWorking(true);
    setMessage(null);

    void (async () => {
      try {
        const response = await fetch('/api/pos/pin', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ user_id: chosen.userId, pin: code }),
        });

        if (!response.ok) {
          const body = (await response.json().catch(() => null)) as { message?: string } | null;

          // The API's own sentence — it tells a wrong PIN apart from a locked
          // one and from somebody who is not on shift, and those are three
          // different things to do next.
          setMessage(body?.message ?? m.pinWrong);
          flash.problem(body?.message ?? m.pinWrong);
          setPin('');
          setWorking(false);

          return;
        }

        /*
         * `Jasur Toshev · smena ochildi` — `dc.html:11817`.
         *
         * Said here rather than on the screen that follows, because the screen
         * that follows is the floor and it has nothing on it about who is
         * standing at the till. Two people sharing a terminal on a change-over
         * is the case this exists for: the second one needs to see their own
         * name, not assume it.
         */
        flash(fill(say(locale, POS_COPY.shiftStarted), { name: chosen.name }));

        // A navigation, not a state change: what comes next is a server
        // component that reads the shift cookie this response just set.
        router.push('/pos');
        router.refresh();
      } catch {
        setMessage(m.pinWrong);
        flash.problem(m.pinWrong);
        setPin('');
        setWorking(false);
      }
    })();
  }

  function press(key: string) {
    if (working) return;

    if (key === 'C') {
      setPin('');
      setMessage(null);

      return;
    }

    if (key === '⌫') {
      setPin((current) => current.slice(0, -1));
      setMessage(null);

      return;
    }

    setPin((current) => {
      const next = (current + key).slice(0, PIN_LENGTH);

      if (next.length === PIN_LENGTH) {
        // After this render, so the fourth digit is visible for the instant it
        // takes to check it.
        setTimeout(() => submit(next), 120);
      }

      return next;
    });
    setMessage(null);
  }

  function close() {
    setChosen(null);
    setPin('');
    setMessage(null);
  }

  const initials = (name: string) =>
    name
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part[0] ?? '')
      .join('')
      .toUpperCase();

  return (
    <div className="bg-bg-subtle flex h-dvh flex-col">
      <header className="border-border bg-surface flex h-16 flex-none items-center gap-3.5 border-b px-5">
        <a
          href="/pos"
          aria-label={m.whoBack}
          title={m.whoBack}
          className="border-border flex h-11 w-11 items-center justify-center rounded-[12px] border"
        >
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
          >
            <path d="M19 12H6" />
            <path d="m12 19-7-7 7-7" />
          </svg>
        </a>

        <div className="min-w-0">
          <div className="font-display tracking-snug text-lg leading-tight font-semibold">
            {m.whoTitle}
          </div>
          {staff !== null ? (
            <div data-num className="text-fg-subtle text-xs">
              {shown.length}
            </div>
          ) : null}
        </div>
      </header>

      <div data-scroll className="min-h-0 flex-1 p-5">
        {/*
         * Filter by role — `specs/01-os.md §5.6`.
         *
         * A branch has twenty or thirty people with a PIN and a waiter starting
         * a shift is looking for one of five names. The roles come out of the
         * payload rather than out of a fixed list, so a restaurant that invents
         * a role gets a chip for it without anybody deploying.
         *
         * **The "on shift" filter the design also draws is not here**, and it
         * is not an oversight: `GET /pos/auth/staff` returns `user_id`, `name`,
         * `roles` and `is_locked` and nothing about who is currently clocked
         * in. A chip that guessed would sort the list into two groups that mean
         * nothing — worse than no chip, on the screen somebody uses to find
         * their own name in a hurry.
         */}
        {roles.length > 1 ? (
          <div className="mb-4 flex flex-wrap gap-2">
            {[{ id: 'all', label: m.whoAllRoles }, ...roles].map((entry) => (
              <button
                key={entry.id}
                type="button"
                aria-pressed={role === entry.id}
                onClick={() => setRole(entry.id)}
                className={`h-11 rounded-full border px-4 text-sm font-semibold ${
                  role === entry.id
                    ? 'border-brand-500 bg-brand-50 text-brand-700'
                    : 'border-border bg-surface text-fg-muted'
                }`}
              >
                {entry.label}
              </button>
            ))}
          </div>
        ) : null}

        {failed ? (
          <p className="bg-danger-50 text-danger-700 rounded-[12px] px-4 py-3 text-sm font-medium">
            {m.whoUnavailable}
          </p>
        ) : staff === null ? (
          <p className="text-fg-subtle text-sm">{m.whoLoading}</p>
        ) : staff.length === 0 ? (
          <p className="text-fg-subtle text-sm">{m.whoEmpty}</p>
        ) : (
          <div className="grid [grid-template-columns:repeat(auto-fill,minmax(min(220px,100%),1fr))] gap-3">
            {shown.map((person) => (
              <button
                key={person.user_id}
                type="button"
                disabled={person.is_locked}
                onClick={() =>
                  setChosen({
                    userId: person.user_id,
                    name: person.name,
                    role: person.roles[0] ?? '',
                  })
                }
                className="border-border bg-surface flex min-h-[88px] items-center gap-3.5 rounded-[14px] border p-4 text-left disabled:opacity-45"
              >
                <span className="bg-brand-100 text-brand-700 font-display text-md flex h-12 w-12 flex-none items-center justify-center rounded-full font-bold">
                  {initials(person.name)}
                </span>

                <span className="min-w-0 flex-1">
                  <span className="text-md block truncate leading-snug font-semibold">
                    {person.name}
                  </span>

                  {/*
                   * The role as a pill and the state as a line, not one line
                   * doing both. A card that printed "Qulflangan" *instead* of
                   * the role left a waiter unable to tell whose card they were
                   * looking at — which is the one thing this screen is for.
                   */}
                  <span className="mt-1 flex flex-wrap items-center gap-1.5">
                    {person.roles[0] === undefined ? null : (
                      <span className="bg-bg-muted text-fg-muted text-2xs rounded-full px-2 py-0.5 font-semibold">
                        {person.roles[0]}
                      </span>
                    )}

                    <span
                      className={`text-2xs font-semibold ${
                        person.is_locked ? 'text-danger-700' : 'text-fg-subtle'
                      }`}
                    >
                      {person.is_locked ? m.whoLocked : m.whoAvailable}
                    </span>
                  </span>
                </span>
              </button>
            ))}
          </div>
        )}

        <p className="text-fg-subtle mt-5 max-w-[640px] text-xs leading-normal">{m.whoNote}</p>
      </div>

      {/* ---- the PIN pad, over whichever card was tapped ---- */}
      {chosen !== null ? (
        <div
          data-fade
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-5"
          role="dialog"
          aria-modal="true"
          aria-label={m.pinTitle}
        >
          <div data-sheet className="bg-surface w-full max-w-[380px] rounded-[20px] p-6">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="text-md leading-snug font-semibold">{chosen.name}</div>
                <div className="text-fg-subtle text-xs">{chosen.role}</div>
              </div>

              <button
                type="button"
                onClick={close}
                aria-label={m.pinCancel}
                className="text-fg-subtle h-9 w-9 flex-none text-xl leading-none"
              >
                ×
              </button>
            </div>

            <div aria-hidden className="mt-6 flex justify-center gap-3">
              {Array.from({ length: PIN_LENGTH }, (_, index) => (
                <span
                  key={index}
                  className={`h-4 w-4 rounded-full ${
                    index < pin.length ? 'bg-brand-500' : 'bg-border'
                  }`}
                />
              ))}
            </div>

            <p
              role={message === null ? undefined : 'alert'}
              className={`mt-3 text-center text-sm ${message === null ? 'text-fg-subtle' : 'text-danger-700 font-medium'}`}
            >
              {working ? m.pinWorking : (message ?? m.pinTitle)}
            </p>

            <div className="mt-5 grid grid-cols-3 gap-2.5">
              {KEYS.map((key) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => press(key)}
                  disabled={working}
                  aria-label={key === 'C' ? m.pinClear : key === '⌫' ? m.pinDelete : key}
                  className="border-border font-display h-16 rounded-[12px] border text-xl font-semibold disabled:opacity-40"
                >
                  {key}
                </button>
              ))}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
