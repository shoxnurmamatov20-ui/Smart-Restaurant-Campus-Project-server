'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useMessages } from 'next-intl';

import type { Messages } from '@/i18n';

/**
 * The three doors into the product, as the design draws them (§3.12).
 *
 * One component, two callers. The marketing site renders it to make the point
 * its section is arguing — an owner types a password on a desktop, a waiter taps
 * four digits on a tablet, a platform operator gets a second factor and a
 * warning that the restaurant can see every one of their sessions. /login
 * renders the same card as the real front door.
 *
 * Shared rather than copied because the two would drift, and the one screen
 * every role passes through is the worst place for a design to go stale.
 *
 * `live` decides how far the card goes, and only the email tab can currently go
 * all the way: `POST /login` exists behind Sanctum, so that door signs a person
 * in for real. The PIN and TOTP endpoints are not built, so both tabs keep their
 * demonstration behaviour in either mode and carry the TODO naming what they
 * will call. A keypad that claimed to open a shift against nothing would be a
 * worse lie than one that plainly demonstrates.
 *
 * Measurements are the prototype's: a 46px submit on an 11px radius, a 44×52
 * PIN cell on 12, a 56px key. Written as arbitrary values where the design's
 * radius scale has no token for them.
 */
type Tab = 'email' | 'pin' | 'admin';

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'C', '0', '←'] as const;

/** The panel's repeated shapes, named once so the three tabs stay identical. */
const LABEL = 'block text-sm font-semibold';
const FIELD =
  'border-border-strong bg-surface text-fg mt-[7px] h-11 w-full rounded-md border px-[13px] font-sans text-md';
const SUBMIT =
  'mt-5 h-[46px] w-full cursor-pointer rounded-[11px] border-0 text-md font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60';
const NOTE = 'text-fg-subtle mt-3.5 text-xs leading-[1.5]';
const HEADING = 'font-display text-[21px] font-bold tracking-[-.02em]';
const SUBHEADING = 'text-fg-subtle mt-[5px] text-sm';

export function SignInPanel({ live = false }: { live?: boolean }) {
  const m = (useMessages() as Messages).marketing.signin;
  const router = useRouter();
  const [tab, setTab] = useState<Tab>('email');
  const [pin, setPin] = useState('');
  const [toast, setToast] = useState<string | null>(null);

  // Email door state. Only read when `live`; the marketing card leaves the
  // fields uncontrolled so it stays a picture of a form rather than a form.
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const tabs = [
    ['email', m.tabEmail],
    ['pin', m.tabPin],
    ['admin', m.tabAdmin],
  ] as const;

  function press(key: (typeof KEYS)[number]) {
    if (key === 'C') return setPin('');
    if (key === '←') return setPin((value) => value.slice(0, -1));

    setPin((value) => {
      const next = (value + key).slice(0, 4);

      if (next.length === 4) {
        // TODO(api): POST /api/v1/pos/auth/pin — opens the shift and returns a
        // session token. Demonstration until that endpoint exists.
        window.setTimeout(() => {
          setToast(m.pinToast);
          setPin('');
          window.setTimeout(() => setToast(null), 2600);
        }, 220);
      }

      return next;
    });
  }

  async function submitEmail(event: React.FormEvent) {
    event.preventDefault();

    if (!live || submitting) return;

    setSubmitting(true);
    setError(null);

    try {
      /*
       * This app's own origin, not Laravel's.
       *
       * The handler at app/api/auth/session forwards the credentials from Node
       * and puts the token in an httpOnly cookie the server can read and this
       * component cannot. Calling Laravel from here instead would leave the
       * token in JavaScript, invisible to every server-rendered screen, and
       * would need a CSRF round trip first — see lib/server-session.ts.
       */
      const response = await fetch('/api/auth/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      const body = (await response.json().catch(() => ({}))) as {
        error?: string;
        message?: string;
        redirect?: string;
      };

      if (!response.ok) {
        // Three refusals worth telling apart: an account with no console drawn
        // for it, an API that did not answer, and a password that is wrong.
        // Collapsing them all into "wrong password" is how someone spends an
        // afternoon retyping a password that was right the first time.
        if (body.error === 'no_surface') setError(m.noSurface);
        else if (body.error === 'api_unreachable') setError(m.unreachable);
        else setError(body.message ?? m.failed);

        setSubmitting(false);

        return;
      }

      // A chef lands on the board, an operator on the platform, everyone else
      // on their dashboard. The handler worked it out from the role the API
      // returned; see landingPath() in lib/roles.ts.
      router.replace(body.redirect ?? '/dashboard');
      // The shell is a server component and the cookie is new, so the tree has
      // to be re-fetched or the console renders for whoever was here before.
      router.refresh();
    } catch {
      setError(m.unreachable);
      setSubmitting(false);
    }
  }

  return (
    <div className="bg-surface rounded-xl border p-7 shadow-lg">
      <div
        role="tablist"
        aria-label={m.eyebrow}
        className="bg-bg-muted flex gap-[3px] rounded-[11px] p-[3px]"
      >
        {tabs.map(([key, text]) => {
          const active = tab === key;

          return (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => {
                setTab(key);
                setPin('');
                setError(null);
              }}
              className={`h-[34px] flex-1 cursor-pointer rounded-[8px] border-0 text-sm font-semibold ${
                active ? 'bg-surface text-fg shadow-xs' : 'text-fg-muted bg-transparent'
              }`}
            >
              {text}
            </button>
          );
        })}
      </div>

      {tab === 'email' ? (
        <form className="mt-6" onSubmit={submitEmail} noValidate>
          <div className={HEADING}>{m.emailTitle}</div>
          <p className={SUBHEADING}>{m.emailSub}</p>

          <label className={`${LABEL} mt-5`} htmlFor="signin-email">
            {m.fieldMail}
          </label>
          <input
            id="signin-email"
            type="email"
            autoComplete="email"
            placeholder="rustam@smartrestaurant.uz"
            className={FIELD}
            {...(live
              ? {
                  required: true,
                  value: email,
                  disabled: submitting,
                  onChange: (event: React.ChangeEvent<HTMLInputElement>) =>
                    setEmail(event.target.value),
                }
              : {})}
          />

          <div className="mt-4 flex items-baseline justify-between gap-3">
            <label className={LABEL} htmlFor="signin-password">
              {m.fieldPass}
            </label>
            <Link href="/forgot-password" className="text-brand-600 text-sm font-medium">
              {m.forgot}
            </Link>
          </div>
          <input
            id="signin-password"
            type="password"
            autoComplete="current-password"
            placeholder="••••••••"
            className={FIELD}
            {...(live
              ? {
                  required: true,
                  value: password,
                  disabled: submitting,
                  onChange: (event: React.ChangeEvent<HTMLInputElement>) =>
                    setPassword(event.target.value),
                }
              : {})}
          />

          <label
            htmlFor="signin-remember"
            className="text-fg-muted mt-4 flex cursor-pointer items-center gap-[9px] text-sm"
          >
            <input
              id="signin-remember"
              name="remember"
              type="checkbox"
              className="size-4 accent-[var(--brand-500)]"
            />
            {m.remember}
          </label>

          {error ? (
            <p role="alert" className="text-danger-600 mt-4 text-sm font-medium">
              {error}
            </p>
          ) : null}

          {/* TODO(api): POST /login (Sanctum SPA) — see apps/web/src/lib/auth.ts */}
          <button
            type={live ? 'submit' : 'button'}
            disabled={submitting}
            className={`${SUBMIT} bg-brand-500`}
          >
            {submitting ? m.signingIn : m.enter}
          </button>

          <p className={NOTE}>{m.emailNote}</p>
        </form>
      ) : null}

      {tab === 'pin' ? (
        <div className="mt-6">
          <div className={HEADING}>{m.pinTitle}</div>
          <p className={SUBHEADING}>{m.pinSub}</p>

          <div className="mt-[22px] flex justify-center gap-3">
            {[0, 1, 2, 3].map((slot) => (
              <span
                key={slot}
                aria-hidden
                className="border-border-strong bg-bg-subtle text-fg font-display grid h-[52px] w-[44px] place-items-center rounded-[12px] border text-2xl font-bold"
              >
                {pin.length > slot ? '•' : ''}
              </span>
            ))}
          </div>

          <div className="mt-5 grid grid-cols-3 gap-2.5">
            {KEYS.map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => press(key)}
                className="bg-surface text-fg font-display hover:bg-bg-muted h-14 cursor-pointer rounded-[12px] border text-xl font-semibold active:scale-[.97]"
              >
                {key}
              </button>
            ))}
          </div>

          <p className={`${NOTE} text-center`}>{m.pinNote}</p>
        </div>
      ) : null}

      {tab === 'admin' ? (
        <div className="mt-6">
          <div className={HEADING}>{m.adminTitle}</div>
          <p className={SUBHEADING}>{m.adminSub}</p>

          <div className="bg-warning-50 mt-5 flex items-start gap-[11px] rounded-[12px] border border-[rgba(247,144,9,.24)] p-3.5">
            <span className="bg-warning-500 rounded-pill mt-1.5 size-[7px] flex-none" />
            <span className="text-warning-600 text-sm leading-[1.5] font-medium">
              {m.adminWarn}
            </span>
          </div>

          <label className={`${LABEL} mt-[18px]`} htmlFor="signin-admin-email">
            {m.fieldMail}
          </label>
          <input
            id="signin-admin-email"
            type="email"
            autoComplete="email"
            placeholder="admin@smartrestaurant.uz"
            className={FIELD}
          />

          <label className={`${LABEL} mt-4`} htmlFor="signin-totp">
            {m.fieldCode}
          </label>
          <input
            id="signin-totp"
            inputMode="numeric"
            pattern="[0-9]{6}"
            maxLength={6}
            autoComplete="one-time-code"
            placeholder="000 000"
            className={`${FIELD} font-mono text-[16px] tracking-[.14em]`}
          />

          {/* TODO(api): POST /api/v1/admin/login — email + TOTP, super-admin only. */}
          <button type="button" className={`${SUBMIT} bg-[var(--n-900)]`}>
            {m.enter}
          </button>

          <p className={NOTE}>{m.adminNote}</p>
        </div>
      ) : null}

      {/* Fixed to the viewport, as the prototype has it — a shift opening is a
          confirmation about the whole page, not about this card. */}
      {toast ? (
        <div
          role="status"
          className="fixed bottom-8 left-1/2 z-[200] flex -translate-x-1/2 items-center gap-2.5 rounded-[12px] bg-[var(--n-900)] px-5 py-[13px] text-[14px] font-medium whitespace-nowrap text-white shadow-xl"
        >
          <svg
            width="15"
            height="15"
            viewBox="0 0 24 24"
            fill="none"
            stroke="var(--success-500)"
            strokeWidth="3.2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
          >
            <path d="M20 6 9 17l-5-5" />
          </svg>
          {toast}
        </div>
      ) : null}
    </div>
  );
}
