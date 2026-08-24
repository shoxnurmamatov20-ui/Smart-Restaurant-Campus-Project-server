import { getLocale } from 'next-intl/server';

import { SignInPanel } from '@/components/sign-in-panel';

import { DOORS, SIGN_IN_INTRO, type Lang } from './login-copy';

/**
 * The real sign-in.
 *
 * The same card the marketing site shows, in `live` mode: three tabs, and the
 * email door actually calls Sanctum. See src/components/sign-in-panel.tsx for
 * why one component serves both and why only that door is wired.
 *
 * Around it, what the design puts around it — `Sayt v2.dc.html:797-860`: an
 * eyebrow, the heading *"Uchta eshik, uchta boshqa yo'l"*, one sentence of
 * explanation, and three numbered doors naming who takes which. Only the card
 * had been built, which left three unlabelled tabs and a reader guessing; a
 * waiter choosing "Pochta" has no email to type, and a manager choosing "PIN
 * kod" has no PIN.
 *
 * Two columns above 900px and one below, because the doors are what a reader
 * needs *first* on a phone and the card is what they need *next* — so on a
 * narrow screen the explanation comes above the form rather than under it.
 *
 * A server component: the language is read once, on the server, so the page
 * arrives in the reader's own words rather than switching after hydration. The
 * card itself is the client half and looks after its own state.
 */
export default async function LoginPage() {
  const lang = ((await getLocale()) as Lang) ?? 'uz';

  return (
    <div className="grid w-full max-w-[880px] items-start gap-9 min-[900px]:grid-cols-[1fr_400px]">
      <section>
        <p className="text-fg-subtle text-2xs tracking-caps font-semibold uppercase">
          {SIGN_IN_INTRO.eyebrow[lang]}
        </p>

        <h1 className="font-display mt-2.5 text-[32px] leading-[1.12] font-bold tracking-tight text-balance">
          {SIGN_IN_INTRO.heading[lang]}
        </h1>

        <p className="text-fg-muted mt-3 max-w-[46ch] text-sm leading-normal">
          {SIGN_IN_INTRO.lede[lang]}
        </p>

        <ol className="mt-7 flex flex-col gap-3.5">
          {DOORS.map((door) => (
            <li
              key={door.number}
              data-tile
              className="bg-surface flex gap-3.5 rounded-lg border px-4 py-3.5"
            >
              {/* The number is the design's, and it is a label rather than a
                  step: nobody works through all three. Mono so the three sit on
                  one optical line whatever the digits are. */}
              <span
                data-num
                aria-hidden
                className="text-fg-disabled font-mono text-xs leading-[1.6] font-bold"
              >
                {door.number}
              </span>

              <span className="min-w-0">
                <span className="block text-sm font-semibold">{door.who[lang]}</span>
                <span className="text-fg-muted mt-1 block text-xs leading-normal">
                  {door.how[lang]}
                </span>
              </span>
            </li>
          ))}
        </ol>
      </section>

      <SignInPanel live />
    </div>
  );
}
