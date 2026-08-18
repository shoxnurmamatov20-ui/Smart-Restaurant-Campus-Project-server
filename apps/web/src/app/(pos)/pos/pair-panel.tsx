'use client';

import { useRef, useState } from 'react';
import { useMessages } from 'next-intl';

import type { Messages } from '@/i18n';

/**
 * The one screen a till shows before it is a till.
 *
 * A manager creates the terminal in the back office, reads eight characters off
 * their screen, and somebody types them in here. Everything about this panel
 * follows from that being said out loud across a dining room:
 *
 *  - the boxes are eight, separate and huge, because a person reading aloud
 *    counts them out and the typist needs to see where they are;
 *  - the alphabet has no I, O, 0 or 1, so a typed one is corrected rather than
 *    refused — somebody saying "oh" means O and somebody hearing it types 0;
 *  - it submits itself on the eighth character, because the person holding the
 *    tablet is standing up and has nowhere to put it down.
 *
 * The code goes to this app's own route handler, never straight to Laravel: the
 * device token has to come back in an httpOnly cookie the room cannot read.
 */

/** How many characters a pairing code has. Mirrors config('pos.pairing'). */
const LENGTH = 8;

/**
 * What the eye reads as one character and the alphabet does not contain.
 *
 * The API's alphabet drops I, O, 0 and 1 precisely so a code read aloud is
 * unambiguous — which means a typed 0 can only ever have been meant as O, and
 * a typed 1 as L (nobody says "one" for I). Correcting is right here and would
 * be wrong on the server: the server must not guess what a client meant.
 */
const HEARD_AS: Record<string, string> = { '0': 'O', '1': 'L', I: 'J' };

function normalise(raw: string): string {
  return raw
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .split('')
    .map((character) => HEARD_AS[character] ?? character)
    .join('')
    .slice(0, LENGTH);
}

type Status =
  | { kind: 'idle' }
  | { kind: 'working' }
  | { kind: 'paired'; code: string; branch: string | null }
  | { kind: 'failed'; message: string };

export function PairPanel() {
  const messages = useMessages() as Messages;
  const m = messages.console.pos;

  const [code, setCode] = useState('');
  const [status, setStatus] = useState<Status>({ kind: 'idle' });
  const inputRef = useRef<HTMLInputElement>(null);

  const working = status.kind === 'working';

  async function submit(value: string) {
    if (value.length !== LENGTH || working) return;

    setStatus({ kind: 'working' });

    try {
      const response = await fetch('/api/pos/pair', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: value }),
      });

      const body = (await response.json().catch(() => null)) as {
        terminal?: { code: string; branch: string | null };
        message?: string;
      } | null;

      if (!response.ok) {
        setCode('');
        setStatus({ kind: 'failed', message: body?.message ?? m.pairHelp });
        inputRef.current?.focus();

        return;
      }

      setStatus({
        kind: 'paired',
        code: body?.terminal?.code ?? value,
        branch: body?.terminal?.branch ?? null,
      });

      // A full reload rather than a router refresh: the idle screen is a server
      // component that reads the cookie this request just set, and the cookie
      // only exists for the *next* request.
      window.location.reload();
    } catch {
      setCode('');
      setStatus({ kind: 'failed', message: m.pairHelp });
    }
  }

  function change(raw: string) {
    const next = normalise(raw);
    setCode(next);

    if (status.kind === 'failed') setStatus({ kind: 'idle' });
    if (next.length === LENGTH) void submit(next);
  }

  const characters = Array.from({ length: LENGTH }, (_, index) => code[index] ?? '');

  return (
    <div className="bg-bg-subtle flex min-h-screen items-center justify-center p-6">
      <div className="border-border bg-surface w-full max-w-[560px] rounded-[20px] border p-8 sm:p-10">
        <h1 className="font-display tracking-snug text-2xl leading-tight font-bold">
          {m.pairTitle}
        </h1>
        <p className="text-fg-muted mt-2.5 text-sm leading-normal">{m.pairSub}</p>

        {/*
         * One real input behind eight painted boxes.
         *
         * Eight separate inputs is the usual approach and it is worse on a
         * tablet: focus has to be moved by hand on every keystroke, paste fills
         * only the first box, and a backspace at a boundary does nothing. One
         * field keeps the browser's own text handling — paste, autofill,
         * selection — and the boxes are just how it is drawn.
         */}
        <label className="mt-8 block">
          <span className="text-fg-subtle text-2xs font-semibold tracking-[0.07em] uppercase">
            {m.pairLabel}
          </span>

          <div className="relative mt-3">
            <input
              ref={inputRef}
              value={code}
              onChange={(event) => change(event.target.value)}
              disabled={working}
              autoFocus
              autoComplete="one-time-code"
              inputMode="text"
              autoCapitalize="characters"
              spellCheck={false}
              aria-label={m.pairLabel}
              className="absolute inset-0 h-full w-full cursor-pointer font-mono text-transparent caret-transparent opacity-0"
            />

            <div aria-hidden className="flex gap-2">
              {characters.map((character, index) => (
                <span
                  key={index}
                  className={`font-display flex h-[68px] flex-1 items-center justify-center rounded-[12px] border-2 text-2xl font-bold tabular-nums ${
                    character !== ''
                      ? 'border-brand-500 bg-brand-50 text-brand-700'
                      : index === code.length && !working
                        ? 'border-brand-400 bg-surface'
                        : 'border-border bg-bg-subtle'
                  }`}
                >
                  {character}
                </span>
              ))}
            </div>
          </div>

          <span className="text-fg-subtle mt-2.5 block text-xs">{m.pairHint}</span>
        </label>

        {status.kind === 'failed' ? (
          <p
            role="alert"
            className="bg-danger-50 text-danger-700 mt-6 rounded-[12px] px-4 py-3 text-sm leading-normal font-medium"
          >
            {status.message}
          </p>
        ) : null}

        {status.kind === 'paired' ? (
          <p className="bg-success-50 text-success-700 mt-6 rounded-[12px] px-4 py-3 text-sm font-medium">
            {m.pairPaired.replace('{code}', status.code).replace('{branch}', status.branch ?? '—')}
          </p>
        ) : null}

        <button
          type="button"
          onClick={() => void submit(code)}
          disabled={code.length !== LENGTH || working}
          className="bg-brand-500 rounded-pill mt-8 flex h-[56px] w-full items-center justify-center text-lg font-semibold text-white disabled:opacity-40"
        >
          {working ? m.pairWorking : m.pairSubmit}
        </button>

        <p className="text-fg-subtle mt-6 text-xs leading-normal">{m.pairHelp}</p>
      </div>
    </div>
  );
}
