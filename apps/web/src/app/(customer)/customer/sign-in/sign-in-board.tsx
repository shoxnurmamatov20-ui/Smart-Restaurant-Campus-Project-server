'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

import { flash } from '@restaurant/ui';

import { AUTH } from '@restaurant/surfaces/customer/copy';
import { type Lang } from '@restaurant/surfaces/customer/data';
import { requestCode, verifyCode } from '../../customer-client';

/**
 * Phone number, then the code that comes back —
 * `Smart Restaurant Mijoz ilovasi.dc.html:115-155`.
 *
 * **A phone number and an SMS code, never a password.** That is the design's
 * choice and it is the right one for this market: a customer ordering plov at
 * eight in the evening will not invent, remember or reset a password, and a
 * password on a food-ordering account is a password reused from somewhere that
 * matters more.
 *
 * The number is entered without the country code and the prefix is drawn beside
 * the field rather than typed into it. Every Uzbek mobile is `+998` and nine
 * digits; asking for the prefix produces `+998` typed twice about as often as
 * it produces a correct number.
 *
 * ---------------------------------------------------------------------------
 * Four digits and a keypad, which is not a stylistic choice
 *
 * The build asked for **six** digits in a plain text input. The design draws
 * **four cells and its own twelve-key pad** (`codeCells`, `keys`), and the
 * difference is not cosmetic in either direction:
 *
 *   · a six-digit field rejects the four-digit code the SMS gateway is about to
 *     start sending, so nobody could ever sign in;
 *   · the on-screen pad is what makes a four-cell code enterable one-handed
 *     while the SMS notification is covering the top third of the screen —
 *     which is the exact moment this screen is used.
 *
 * The fourth digit submits on its own. There is no confirm button in the design
 * and there should not be: a code is right or it is not, and asking somebody to
 * press "next" after typing the last digit of a four-digit number is asking
 * them to confirm something they have already finished saying.
 *
 * ---------------------------------------------------------------------------
 * Both halves are real now
 *
 * This screen used to advance on any four digits and hand over to a fixture
 * identity — everybody who typed any number reached the same demo guest. It now
 * asks `POST /api/v1/public/auth/otp` for a code and exchanges it at
 * `.../verify` for a session, through this app's own route handlers so the
 * ninety-day token lands in an httpOnly cookie the page cannot read.
 *
 * The refusals are the server's own sentences. "Kod noto'g'ri", "the code has
 * expired" and "too many attempts, wait fifteen minutes" are three different
 * things for a person to do next, and the error catalogue already tells them
 * apart in three languages — flattening them to one line would leave somebody
 * pressing the same button.
 */
type Step = 'phone' | 'code';

/** "90 123 45 67" — the grouping the design's own `setPhone` produces. */
function groupPhone(digits: string): string {
  return [digits.slice(0, 2), digits.slice(2, 5), digits.slice(5, 7), digits.slice(7, 9)]
    .filter(Boolean)
    .join(' ');
}

export function SignInBoard({ lang }: { lang: Lang }) {
  const router = useRouter();

  const [step, setStep] = useState<Step>('phone');
  const [digits, setDigits] = useState('');
  const [code, setCode] = useState('');

  /*
   * One flag for both requests, and it exists to stop the second tap rather
   * than to draw a spinner. A guest who presses "Kod yuborish" twice spends two
   * paid SMS and is then told by the server to wait a minute — for a message
   * they did in fact receive.
   */
  const [busy, setBusy] = useState(false);

  const complete = digits.length === 9;

  const send = async () => {
    if (!complete) {
      flash.problem(AUTH.incomplete[lang]);

      return;
    }

    if (busy) return;
    setBusy(true);

    const sent = await requestCode(`+998${digits}`, lang);
    setBusy(false);

    if (!sent.ok) {
      // The API's own sentence: it knows whether this is "wait 42 seconds",
      // "that number is not Uzbek" or "the gateway would not take it".
      flash.problem(sent.message ?? AUTH.incomplete[lang]);

      return;
    }

    setStep('code');
    setCode('');
    flash(`+998 ${groupPhone(digits)} · ${AUTH.codeSent[lang]}`);
  };

  const submit = async (typed: string) => {
    if (busy) return;
    setBusy(true);

    const session = await verifyCode(`+998${digits}`, typed, lang);
    setBusy(false);

    if (!session.ok) {
      /*
       * The cells are cleared and the screen stays put. Sending the guest back
       * to the phone step would cost them another SMS — and the code they were
       * typing is still good for the rest of its five minutes.
       */
      setCode('');
      flash.problem(session.message ?? AUTH.incomplete[lang]);

      return;
    }

    const first = (session.data.name ?? '').split(' ')[0];

    router.push('/customer');
    router.refresh();
    flash(first === '' ? AUTH.welcome[lang] : `${AUTH.welcome[lang]}, ${first}`);
  };

  const press = (key: string) => {
    if (key === 'C') {
      setCode('');

      return;
    }

    if (key === '←') {
      setCode((current) => current.slice(0, -1));

      return;
    }

    setCode((current) => {
      const next = (current + key).slice(0, 4);

      if (next.length === 4) {
        /*
         * The design waits 240ms before moving, and the delay is the point: the
         * fourth cell has to be seen to fill, or the screen appears to change
         * for no reason a thumb can account for.
         */
        window.setTimeout(() => void submit(next), 240);
      }

      return next;
    });
  };

  return (
    <main className="flex min-h-dvh flex-col px-6 pt-16 pb-10">
      {/* The mark the design opens on. Two letters, not a logo file: there is no
          per-tenant branding in this system yet and a placeholder image would
          have to be removed later. */}
      <span className="bg-acc font-display grid size-13 place-items-center rounded-[15px] text-xl font-extrabold tracking-tight text-white">
        SR
      </span>

      <h1 className="font-display mt-6.5 text-3xl leading-tight font-semibold tracking-tight">
        {AUTH.heading[lang]}
      </h1>
      <p className="text-fg-muted mt-2.5 text-sm leading-normal">{AUTH.lede[lang]}</p>

      {step === 'phone' ? (
        <>
          <label className="mt-7.5 block">
            <span className="mb-2 block text-sm font-semibold">{AUTH.phoneLabel[lang]}</span>

            <span className="border-border-strong bg-surface flex h-13 items-center gap-2.5 rounded-md border px-3.5">
              <span data-num className="text-fg-subtle flex-none text-base font-semibold">
                +998
              </span>
              <span aria-hidden className="bg-divider h-5.5 w-px" />
              <input
                value={groupPhone(digits)}
                onChange={(event) => setDigits(event.target.value.replace(/\D/g, '').slice(0, 9))}
                inputMode="numeric"
                autoComplete="tel-national"
                aria-label={AUTH.phoneLabel[lang]}
                data-num
                className="min-w-0 flex-1 bg-transparent text-base font-semibold outline-none"
                placeholder="90 123 45 67"
              />
            </span>
          </label>

          {/*
           * Grey until the number is whole — `authBg`. The button is not
           * disabled, because a disabled control cannot explain itself: pressing
           * it is how a customer who typed eight digits finds out they typed
           * eight digits.
           */}
          <button
            type="button"
            onClick={() => void send()}
            className={`mt-4 h-13 w-full rounded-md text-base font-semibold text-white ${
              complete ? 'bg-acc' : 'bg-n-300'
            }`}
          >
            {AUTH.send[lang]}
          </button>

          <p className="text-fg-subtle mt-4 text-xs leading-normal">{AUTH.terms[lang]}</p>
        </>
      ) : (
        <>
          <p className="mt-7.5 mb-2.5 block text-sm font-semibold">{AUTH.codeLabel[lang]}</p>

          <div
            role="group"
            aria-label={AUTH.codeLabel[lang]}
            aria-live="polite"
            className="flex gap-2.5"
          >
            {[0, 1, 2, 3].map((index) => (
              <span
                key={index}
                data-num
                className={`font-display bg-bg-subtle grid h-[62px] flex-1 place-items-center rounded-md border text-2xl font-bold ${
                  code.length === index ? 'border-acc' : 'border-border-strong'
                }`}
              >
                {code[index] ?? ''}
              </span>
            ))}
          </div>

          <div className="mt-5 grid grid-cols-3 gap-2.5">
            {['1', '2', '3', '4', '5', '6', '7', '8', '9', 'C', '0', '←'].map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => press(key)}
                aria-label={key}
                className="border-border bg-surface font-display grid h-13.5 place-items-center rounded-md border text-xl font-semibold"
              >
                {key}
              </button>
            ))}
          </div>

          <div className="mt-4 flex items-center justify-between gap-3">
            {/* The countdown is drawn, not run. A timer that resets on every
                render would say 00:42 forever, which is worse than a static
                line that reads as what it is. */}
            <span data-num className="text-fg-subtle text-xs">
              {AUTH.resend[lang]}
            </span>

            <button
              type="button"
              onClick={() => {
                setStep('phone');
                setCode('');
              }}
              className="border-border text-fg-muted h-[var(--tap-min)] flex-none rounded-md border px-3 text-xs font-semibold"
            >
              {AUTH.changeNumber[lang]}
            </button>
          </div>
        </>
      )}
    </main>
  );
}
