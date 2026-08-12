'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useMessages } from 'next-intl';

import type { Messages } from '@/i18n';

/**
 * Ask for a reset link.
 *
 * The card the sign-in panel points at, in the panel's own shapes so the two
 * read as one screen: same 11px submit at 46px, same field, same heading scale.
 *
 * It always says the same thing back. Telling an anonymous visitor whether an
 * address is on the system turns this form into a way to enumerate a
 * restaurant's staff, so a known address and an unknown one get the identical
 * sentence — which is why the copy is "if that address is on the system"
 * rather than "sent".
 *
 * The note under it is the design's §3.12 rule stated where it is needed: a
 * waiter has no password to reset, and without this line they would sit here
 * typing an address instead of walking to their manager.
 */
const LABEL = 'block text-sm font-semibold';
const FIELD =
  'border-border-strong bg-surface text-fg mt-[7px] h-11 w-full rounded-md border px-[13px] font-sans text-md';
const SUBMIT =
  'mt-5 h-[46px] w-full cursor-pointer rounded-[11px] border-0 text-md font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60';

export function ResetForm() {
  const marketing = (useMessages() as Messages).marketing;
  const m = marketing.reset;
  // The field is the same field the sign-in card has, so it borrows that
  // label rather than owning a second word for "email address".
  const fieldMail = marketing.signin.fieldMail;
  const [email, setEmail] = useState('');
  const [state, setState] = useState<'idle' | 'sending' | 'sent'>('idle');

  function submit(event: React.FormEvent) {
    event.preventDefault();

    if (state !== 'idle') return;

    setState('sending');

    // TODO(api): POST /api/v1/auth/forgot-password { email } — always 204, for
    // the reason in this file's note. The delay stands in for the round trip so
    // the button's disabled state is visible rather than a flicker.
    window.setTimeout(() => setState('sent'), 420);
  }

  return (
    <div className="bg-surface rounded-xl border p-7 shadow-lg">
      <h1 className="font-display text-[21px] font-bold tracking-[-.02em]">{m.title}</h1>
      <p className="text-fg-subtle mt-[5px] text-sm">{m.sub}</p>

      {state === 'sent' ? (
        <div className="bg-success-50 mt-6 flex items-start gap-[11px] rounded-[12px] border border-[rgba(23,160,101,.24)] p-3.5">
          <span className="bg-success-500 rounded-pill mt-1.5 size-[7px] flex-none" />
          <p role="status" className="text-success-600 text-sm leading-[1.5] font-medium">
            {m.sent}
          </p>
        </div>
      ) : (
        <form onSubmit={submit} noValidate>
          <label className={`${LABEL} mt-5`} htmlFor="reset-email">
            {fieldMail}
          </label>
          <input
            id="reset-email"
            type="email"
            required
            autoComplete="email"
            placeholder="rustam@smartrestaurant.uz"
            className={FIELD}
            value={email}
            disabled={state === 'sending'}
            onChange={(event) => setEmail(event.target.value)}
          />

          <button type="submit" disabled={state === 'sending'} className={`${SUBMIT} bg-brand-500`}>
            {state === 'sending' ? m.sending : m.submit}
          </button>
        </form>
      )}

      <p className="text-fg-subtle mt-3.5 text-xs leading-[1.5]">{m.note}</p>

      <Link href="/login" className="text-brand-600 mt-5 inline-block text-sm font-medium">
        {m.back}
      </Link>
    </div>
  );
}
