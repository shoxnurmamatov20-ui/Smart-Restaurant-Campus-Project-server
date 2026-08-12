'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useMessages } from 'next-intl';

import type { Messages } from '@/i18n';

/**
 * The platform door, as the handoff draws it (§3.12, third tab).
 *
 * What it replaced was the page `create-next-app` leaves behind: a 🔐 emoji, a
 * `bg-card` box owing nothing to the design, three hardcoded Uzbek strings in
 * an app whose every other screen is trilingual, and a comment describing the
 * two-factor flow instead of a two-factor flow.
 *
 * The design gives this door three things the restaurant doors do not have, and
 * each is here: a six-digit code beside the password, a submit in the neutral
 * scale rather than the brand — an operator is not a customer — and an amber
 * notice saying the sign-in is visible to the restaurant owner. That notice is
 * the whole trust model of a platform that can read every tenant's data, so it
 * sits above the fields where it is read before signing in, not below them.
 *
 * Measurements are the prototype's: 46px submit on an 11px radius, 44px field,
 * 12px radius on the notice.
 *
 * It posts to this app's own `/api/auth/session`, which forwards to
 * `POST /api/v1/admin/login` from Node and puts the token in an httpOnly
 * cookie. The endpoint checks all three factors, that the account holds
 * `super-admin`, and that it belongs to no restaurant; it caps the token at
 * thirty minutes, and it answers every kind of refusal with the same message
 * so that "wrong code" cannot confirm a right password. This form does not try
 * to be more specific than that.
 */
const LABEL = 'block text-sm font-semibold';
const FIELD =
  'border-border-strong bg-surface text-fg mt-[7px] h-11 w-full rounded-md border px-[13px] font-sans text-md';

export function SignInForm() {
  const m = (useMessages() as Messages).platform.signin;
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();

    if (submitting) return;

    setSubmitting(true);
    setError(null);

    try {
      const response = await fetch('/api/auth/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, code }),
      });

      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as { error?: string };

        // An API that did not answer is worth telling apart from a refusal;
        // beyond that the endpoint deliberately says nothing more specific.
        setError(body.error === 'api_unreachable' ? m.unreachable : m.failed);
        setSubmitting(false);

        return;
      }

      const body = (await response.json()) as { redirect?: string };

      router.replace(body.redirect ?? '/dashboard');
      // The shell renders on the server and the cookie is new, so the tree has
      // to be re-fetched.
      router.refresh();
    } catch {
      setError(m.unreachable);
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={submit} noValidate className="bg-surface rounded-xl border p-7 shadow-lg">
      <h1 className="font-display text-[21px] font-bold tracking-[-.02em]">{m.title}</h1>
      <p className="text-fg-subtle mt-[5px] text-sm">{m.sub}</p>

      <div className="bg-warning-50 mt-5 flex items-start gap-[11px] rounded-[12px] border border-[rgba(247,144,9,.24)] p-3.5">
        <span className="bg-warning-500 rounded-pill mt-1.5 size-[7px] flex-none" />
        <span className="text-warning-600 text-sm leading-[1.5] font-medium">{m.warn}</span>
      </div>

      <label className={`${LABEL} mt-[18px]`} htmlFor="admin-email">
        {m.fieldMail}
      </label>
      <input
        id="admin-email"
        type="email"
        required
        autoComplete="email"
        placeholder="admin@smartrestaurant.uz"
        className={FIELD}
        value={email}
        disabled={submitting}
        onChange={(event) => setEmail(event.target.value)}
      />

      <label className={`${LABEL} mt-4`} htmlFor="admin-password">
        {m.fieldPass}
      </label>
      <input
        id="admin-password"
        type="password"
        required
        autoComplete="current-password"
        placeholder="••••••••"
        className={FIELD}
        value={password}
        disabled={submitting}
        onChange={(event) => setPassword(event.target.value)}
      />

      <label className={`${LABEL} mt-4`} htmlFor="admin-totp">
        {m.fieldCode}
      </label>
      <input
        id="admin-totp"
        inputMode="numeric"
        pattern="[0-9]{6}"
        maxLength={6}
        required
        autoComplete="one-time-code"
        placeholder="000 000"
        className={`${FIELD} font-mono text-[16px] tracking-[.14em]`}
        value={code}
        disabled={submitting}
        onChange={(event) => setCode(event.target.value.replace(/[^0-9]/g, ''))}
      />

      {error ? (
        <p role="alert" className="text-danger-600 mt-4 text-sm font-medium">
          {error}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={submitting}
        className="text-md mt-5 h-[46px] w-full cursor-pointer rounded-[11px] border-0 bg-[var(--n-900)] font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
      >
        {submitting ? m.signingIn : m.enter}
      </button>

      <p className="text-fg-subtle mt-3.5 text-xs leading-[1.5]">{m.note}</p>
    </form>
  );
}
