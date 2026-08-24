import { headers } from 'next/headers';

import { copy, PIN, SHARED } from '@restaurant/surfaces/crew/copy';
import { crewLang } from '../crew-session';
import { enrolledDeviceLine } from '../crew-server';
import { PinPanel } from './pin-panel';

/**
 * The staff app's front door.
 *
 * At `/crew` rather than `/staff`: `/staff` is already a console module, the HR
 * screen a manager opens *about* employees. This is the app an employee opens
 * about themselves — their tables, their calls, their shift. Two products with
 * two audiences, and one URL for both would be the first thing to confuse.
 *
 * A route group adds no path segment, so `(staff)` needs its own — `(marketing)`
 * already owns `/` and two parallel pages at the root fail the build.
 *
 * Server-rendered around a client keypad: the chrome here is static, and only
 * the four cells change per keystroke.
 */
export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Xodimlar ilovasi',
  /* A sign-in screen has nothing for a crawler and should not be an entry point
     into an employee tool. `app/robots.ts` lists the other full-bleed surfaces
     the same way; adding `/crew` to it needs `lib/roles.ts`, which this group
     does not own — reported rather than reached into. */
  robots: { index: false, follow: false },
};

export default async function CrewPinPage() {
  const lang = crewLang((await headers()).get('accept-language'));
  const t = copy(PIN, lang);
  const s = copy(SHARED, lang);
  /* This handset's own enrolment, asked for with its own device token. Null
     when the phone has never been enrolled — see ../crew-server.ts. */
  const terminal = await enrolledDeviceLine();

  return (
    <main
      className="flex flex-1 flex-col px-[26px] pb-7"
      style={{ paddingTop: 'calc(26px + env(safe-area-inset-top, 0px))' }}
    >
      <header className="flex-none text-center">
        {/*
         * The mark, not a logo file. Two letters at 44px is what the design
         * draws, it costs no request, and it is legible at the size a phone
         * screen actually shows it.
         */}
        <span className="bg-brand-500 font-display inline-grid size-11 place-items-center rounded-[13px] text-base font-extrabold tracking-tight text-white">
          SR
        </span>
        <h1 className="font-display tracking-snug mt-3.5 text-xl leading-tight font-bold">
          {t.heading}
        </h1>
        {/*
         * Which branch and which till this phone was enrolled against. It is
         * the one thing a person can check before typing: a waiter who has
         * walked into the wrong branch's back office sees it here rather than
         * after their PIN is refused.
         *
         * Which is why it may not be a fixture. It was one — the demo's
         * "Chilonzor filiali · POS-3", printed on every phone in the country —
         * and a line that is right for one restaurant and wrong for all the
         * others turns this screen's one check into this screen's one lie.
         */}
        <p className="text-fg-subtle mt-1 text-xs">{terminal ?? t.terminalUnknown}</p>
      </header>

      <PinPanel lang={lang} />

      <footer className="border-divider text-fg-subtle mt-auto border-t pt-4 text-center text-[10px] leading-normal">
        {s.appName}
      </footer>
    </main>
  );
}
