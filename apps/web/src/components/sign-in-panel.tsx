'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { useMessages } from 'next-intl';
import { PasswordEye } from '@restaurant/ui';

import type { Messages } from '@/i18n';
import { SESSION_ENDPOINT } from '@/lib/base-path';

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
 * `live` decides how far the card goes, and two of the three doors go all the
 * way: `POST /login` behind Sanctum signs an owner in, and
 * `POST /api/v1/admin/login` takes the operator's email, password and TOTP.
 *
 * The PIN tab stays a demonstration in both modes, and that is an architecture
 * decision rather than a missing endpoint. `POST /api/v1/pos/auth/pin` exists
 * and is wired — twice, in fact: `api/pos/pin/route.ts` for a till and
 * `(staff)/crew/session/route.ts` for a phone. What both of those have and this
 * card does not is the **first** credential. Four digits are defensible only
 * because a paired device has already named one employee; on a page anyone can
 * open, the same PIN would be matched against everybody on the floor, where
 * roughly one guess in three hundred hits *somebody* and a lockout counted per
 * account never fires. So the keypad here shows the shape of the door and the
 * real one is at `/pos` and `/crew`, behind a device token.
 *
 * Measurements are the prototype's: a 46px submit on an 11px radius, a 44×52
 * PIN cell on 12, a 56px key. Written as arbitrary values where the design's
 * radius scale has no token for them.
 */
type Tab = 'email' | 'pin' | 'admin';

/**
 * How many wrong PINs before the pad locks.
 *
 * Three, which is what this card's own note promises the reader. The server's
 * own ceiling is `config('auth.pin.max_attempts')` and is higher; a pad that
 * locked later than it said would be a promise broken in front of a queue.
 */
const PIN_ATTEMPTS = 3;

/**
 * The PIN the demonstration accepts.
 *
 * `UserSeeder`'s, and only ever right in a demo. A keypad that congratulated
 * every four digits would be a control that lies about the one thing it does —
 * on a card whose own note promises three wrong attempts lock it.
 */
const DEMO_PIN = '1234';

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'C', '0', '←'] as const;

/** The panel's repeated shapes, named once so the three tabs stay identical. */
const LABEL = 'block text-sm font-semibold';
const FIELD =
  'border-border-strong bg-surface text-fg mt-[7px] h-11 w-full rounded-md border px-[13px] font-sans text-md';
/**
 * Centred explicitly because this shape is worn by a `<button>` in live mode
 * and by an `<a>` in demonstration mode, and only the button centres its own
 * text. One declaration so the two cannot drift apart visually.
 */
const SUBMIT =
  'mt-5 flex h-[46px] w-full cursor-pointer items-center justify-center rounded-[11px] border-0 text-md font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60';
const NOTE = 'text-fg-subtle mt-3.5 text-xs leading-[1.5]';
const HEADING = 'font-display text-[21px] font-bold tracking-[-.02em]';
const SUBHEADING = 'text-fg-subtle mt-[5px] text-sm';

/**
 * A `?next=` that cannot leave this site.
 *
 * A sign-in form is the classic place an open redirect is used: a link to
 * `/login?next=https://evil.example/login` shows the real sign-in on the real
 * domain and then hands the visitor to a copy of it. Accepting only a path —
 * and refusing `//host`, which a browser reads as protocol-relative and treats
 * as another origin — is the whole defence.
 *
 * Refusing rather than sanitising: a `next` that is not a plain path is not a
 * typo, and there is nothing to salvage from it.
 */
function safeNext(value: string | null): string | null {
  if (value === null) return null;
  if (!value.startsWith('/') || value.startsWith('//')) return null;

  return value;
}

export function SignInPanel({ live = false }: { live?: boolean }) {
  const m = (useMessages() as Messages).marketing.signin;
  const router = useRouter();
  const searchParams = useSearchParams();
  const [tab, setTab] = useState<Tab>('email');
  const [pin, setPin] = useState('');
  const [toast, setToast] = useState<string | null>(null);

  // Email door state. Only read when `live`; the marketing card leaves the
  // fields uncontrolled so it stays a picture of a form rather than a form.
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);

  /* Whether each password field is readable. Two flags, not one: the owner's
     door and the platform door are separate tabs, and a reader who unmasked one
     has said nothing about the other. Never persisted — a field that came back
     readable after a reload would be readable to whoever walks past next. */
  const [showPass, setShowPass] = useState(false);
  const [showAdminPass, setShowAdminPass] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Platform door state — a separate address, a password and a six-digit code.
  const [adminEmail, setAdminEmail] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  const [code, setCode] = useState('');

  /*
   * How many PINs have been got wrong, and whether the pad is locked.
   *
   * `pos.pin` locks after five attempts and `config('auth.pin.*')` is the
   * single source for that — but the pad has to say so *before* the server
   * does, because a keypad that accepts a sixth wrong PIN and then reports a
   * lock reads as a system that lost the count. Three is what the design's own
   * note promises ("after three wrong attempts the manager resets it"), and
   * this is the screen that promises it.
   */
  const [wrongPins, setWrongPins] = useState(0);
  const pinLocked = wrongPins >= PIN_ATTEMPTS;

  /*
   * Whether each door's fields are usable yet.
   *
   * The design greys its submit until they are. Not `disabled`: a disabled
   * button takes no focus and explains nothing, so a reader who cannot tell
   * what is missing has nowhere to go. It is styled as unavailable and the
   * handler returns early — the fields carry their own messages.
   */
  const emailReady = email.trim().includes('@') && password.length >= 6;
  const adminReady =
    adminEmail.trim().includes('@') && adminPassword.length >= 6 && /^\d{6}$/.test(code);

  /*
   * Two doors on the real sign-in page, three on the marketing card.
   *
   * The PIN tab is a *demonstration* — it compares four digits against a
   * constant and, on a match, congratulates the reader by the name of a person
   * who does not work at their restaurant, while signing nobody in. On the
   * marketing page that is the point: the section is arguing that a waiter taps
   * four digits rather than typing a password. On `/login` it was a working-
   * looking door that a real employee would try on their first day, get a
   * success message from, and end up with no session; three wrong digits
   * "locked" an account that had never been checked.
   *
   * It is not moved to the API instead, and that is an architecture decision
   * rather than a missing endpoint — see the note at the top of this file: four
   * digits are defensible only once a paired device has named one employee. The
   * real PIN door is at `/pos` and `/crew`, behind a device token.
   */
  const tabs = (
    live
      ? ([
          ['email', m.tabEmail],
          ['admin', m.tabAdmin],
        ] as const)
      : ([
          ['email', m.tabEmail],
          ['pin', m.tabPin],
          ['admin', m.tabAdmin],
        ] as const)
  ) satisfies readonly (readonly [Tab, string])[];

  function press(key: (typeof KEYS)[number]) {
    if (pinLocked) return;
    if (key === 'C') return setPin('');
    if (key === '←') return setPin((value) => value.slice(0, -1));

    setPin((value) => {
      const next = (value + key).slice(0, 4);

      if (next.length === 4) {
        /*
         * Which four digits are right is the server's business, and this card
         * is not where it is asked — see the note at the top of the file. A
         * PIN offered without a device token names nobody, so the pad
         * demonstrates the *shape* of the answer: the demo PIN succeeds and
         * anything else is a wrong attempt that counts towards the lock.
         */
        window.setTimeout(() => {
          setPin('');

          if (next === DEMO_PIN) {
            setWrongPins(0);
            setToast(m.pinToast);
            window.setTimeout(() => setToast(null), 2600);

            return;
          }

          setWrongPins((count) => count + 1);
        }, 220);
      }

      return next;
    });
  }

  async function submitAdmin(event: React.FormEvent) {
    event.preventDefault();

    if (!live || submitting || !adminReady) return;

    setSubmitting(true);
    setError(null);

    try {
      const response = await fetch('/api/auth/platform', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: adminEmail, password: adminPassword, code }),
      });

      if (!response.ok) {
        /* One message for a wrong password and a wrong code alike — see the
           route handler for why the two are never distinguished. */
        setError(m.failed);
        setSubmitting(false);

        return;
      }

      const body = (await response.json()) as { redirect?: string };

      router.push(body.redirect ?? '/platform');
      router.refresh();
    } catch {
      setError(m.unreachable);
      setSubmitting(false);
    }
  }

  async function submitEmail(event: React.FormEvent) {
    event.preventDefault();

    if (!live || submitting || !emailReady) return;

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
      const response = await fetch(SESSION_ENDPOINT, {
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

      /*
       * Where they were going, if the guard sent them here, and otherwise the
       * landing page for their role.
       *
       * A chef lands on the board, an operator on the platform, everyone else
       * on their dashboard — the handler worked that out from the role the API
       * returned; see `landingPath()` in lib/roles.ts. But somebody who typed
       * `/finance/till` and was bounced to sign in should arrive at the till,
       * not at a dashboard they now have to navigate away from.
       */
      router.replace(safeNext(searchParams.get('next')) ?? body.redirect ?? '/dashboard');
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
              data-seg
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
            {m.fieldLogin}
          </label>
          {/*
           * `text`, not `email`: the API signs a person in by email *or* phone
           * (`LoginRequest`), and a hire whose account came from the roster has
           * no real address — the phone the manager read out beside their
           * password is their login. `type="email"` would refuse it before the
           * request was ever made. `/api/auth/session` tells the two apart.
           */}
          <input
            id="signin-email"
            type="text"
            inputMode="email"
            autoComplete="username"
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
          <div className="relative">
            <input
              id="signin-password"
              type={showPass ? 'text' : 'password'}
              autoComplete="current-password"
              placeholder="••••••••"
              className={`${FIELD} pr-12`}
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
            <PasswordEye
              shown={showPass}
              onToggle={() => setShowPass(!showPass)}
              showLabel={m.showPass}
              hideLabel={m.hidePass}
            />
          </div>

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

          {live ? (
            <button
              type="submit"
              aria-disabled={!emailReady || submitting}
              disabled={submitting}
              className={`${SUBMIT} ${emailReady ? 'bg-brand-500' : 'bg-fg-disabled'}`}
            >
              {submitting ? m.signingIn : m.enter}
            </button>
          ) : (
            /*
             * The demonstration's one working part.
             *
             * Everything above it here is a picture — the fields are
             * uncontrolled and submitEmail returns on `!live`. This used to be
             * a `type="button"` with no handler, so pressing it did nothing at
             * all: no navigation, no error, no sign that the form was an
             * illustration. Someone who filled it in was simply stuck, and the
             * header's Kirish linked straight to this card.
             *
             * A card that shows what signing in looks like should still let
             * you do it. The button keeps its shape and becomes the way to the
             * door that works.
             */
            <Link href="/login" className={`${SUBMIT} bg-brand-500`}>
              {m.enter}
            </Link>
          )}

          <p className={NOTE}>{m.emailNote}</p>
        </form>
      ) : null}

      {tab === 'pin' && !live ? (
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
                disabled={pinLocked}
                className="bg-surface text-fg font-display hover:bg-bg-muted h-14 cursor-pointer rounded-[12px] border text-xl font-semibold active:scale-[.97] disabled:cursor-not-allowed disabled:opacity-40"
              >
                {key}
              </button>
            ))}
          </div>

          {/*
           * What is left, and what happens at zero. A keypad that says nothing
           * until it stops working is how a waiter concludes the tablet is
           * broken thirty seconds before service.
           */}
          {wrongPins > 0 ? (
            <p
              role="alert"
              className={`mt-3.5 text-center text-sm font-semibold ${
                pinLocked ? 'text-danger-600' : 'text-warning-600'
              }`}
            >
              {pinLocked
                ? m.pinLocked
                : m.pinWrong.replace('{left}', String(PIN_ATTEMPTS - wrongPins))}
            </p>
          ) : null}

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

          <form onSubmit={submitAdmin} noValidate>
            <label className={`${LABEL} mt-[18px]`} htmlFor="signin-admin-email">
              {m.fieldMail}
            </label>
            <input
              id="signin-admin-email"
              type="email"
              autoComplete="email"
              placeholder="admin@smartrestaurant.uz"
              value={live ? adminEmail : undefined}
              onChange={live ? (event) => setAdminEmail(event.target.value) : undefined}
              disabled={submitting}
              className={FIELD}
            />

            <label className={`${LABEL} mt-4`} htmlFor="signin-admin-password">
              {m.fieldPass}
            </label>
            <div className="relative">
              <input
                id="signin-admin-password"
                type={showAdminPass ? 'text' : 'password'}
                autoComplete="current-password"
                placeholder="••••••••"
                value={live ? adminPassword : undefined}
                onChange={live ? (event) => setAdminPassword(event.target.value) : undefined}
                disabled={submitting}
                className={`${FIELD} pr-12`}
              />
              <PasswordEye
                shown={showAdminPass}
                onToggle={() => setShowAdminPass(!showAdminPass)}
                showLabel={m.showPass}
                hideLabel={m.hidePass}
              />
            </div>

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
              value={live ? code : undefined}
              onChange={
                live
                  ? (event) => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))
                  : undefined
              }
              disabled={submitting}
              className={`${FIELD} font-mono text-[16px] tracking-[.14em]`}
            />

            {error !== null && tab === 'admin' ? (
              <p role="alert" className="text-danger-600 mt-3 text-sm leading-normal">
                {error}
              </p>
            ) : null}

            <button
              type="submit"
              aria-disabled={!live || !adminReady || submitting}
              className={`${SUBMIT} ${
                live && adminReady && !submitting ? 'bg-[var(--n-900)]' : 'bg-fg-disabled'
              }`}
            >
              {m.enter}
            </button>

            <p className={NOTE}>{m.adminNote}</p>
          </form>
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
