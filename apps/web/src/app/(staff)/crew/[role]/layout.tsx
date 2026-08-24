import { headers } from 'next/headers';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { ReactNode } from 'react';

import { copy, SHARED } from '@restaurant/surfaces/crew/copy';
import { IDENTITY, isCrewRole, say } from '@restaurant/surfaces/crew/data';
import { crewLang } from '../../crew-session';
import { CrewDock } from './crew-dock';
import { OfflineStrip } from './offline-strip';

/**
 * The app's chrome: who is holding the phone, and the four places they can go.
 *
 * **Why the role is a path segment.** In production it comes from the session
 * the PIN opens, and that session does not exist yet — `crew/session/route.ts`
 * explains what is missing. Putting it in the URL is not a role switcher: there
 * is no control anywhere in this app that changes it, and the design's one is
 * deliberately gone. It is here because these screens have to be addressable
 * before they can be reachable. A push notification's whole job is to open the
 * app *at a place* — "table 14, three items ready" is worth nothing if it lands
 * on a home screen — and a deep link needs a path that names the screen.
 *
 * **The segment addresses a screen, it never grants one.** `middleware.ts`
 * compares it against `CREW_ROLE_COOKIE` — written beside the session token by
 * `crew/session/route.ts`, from the roles the PIN exchange answered with — and
 * redirects a mismatch to the reader's own workspace. Until that landed, any
 * signed-in waiter could type `/crew/owner/branches` and read five branches'
 * revenue, margin and headcount. The vocabulary both files share is
 * `crew-guard.ts`.
 *
 * The header shows the person, the scope and an avatar that goes to More. That
 * is the design's own behaviour: the avatar's handler is the fourth tab,
 * because a profile on a phone this small lives under More rather than beside
 * it.
 *
 * **The role switcher is gone.** The design draws a five-way segmented control
 * under the header so a reviewer can walk every role in one page. `START-HERE
 * §3` says those come out, and it is right twice over here: the role decides
 * what a person may approve and what money they may see, and a control that
 * changes it is an authorisation bypass with rounded corners.
 */
export default async function CrewAppLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ role: string }>;
}) {
  const { role } = await params;
  if (!isCrewRole(role)) notFound();

  const lang = crewLang((await headers()).get('accept-language'));
  const who = IDENTITY[role];
  const s = copy(SHARED, lang);

  return (
    /*
     * `h-dvh` and `overflow-hidden` on the shell, with the scroll inside it —
     * never `100vh`. Mobile Safari sizes `vh` against the viewport with the
     * address bar collapsed, so the dock would sit below the fold for the whole
     * first scroll, and the dock is how this app is navigated.
     *
     * `relative`, because the dock is positioned against this box rather than
     * the viewport; see the note in crew-dock.tsx.
     */
    <div className="bg-surface relative flex h-dvh flex-col overflow-hidden">
      <OfflineStrip lang={lang} />

      <header
        className="border-divider flex-none border-b px-[var(--crew-gutter)] pb-3"
        style={{ paddingTop: 'calc(10px + env(safe-area-inset-top, 0px))' }}
      >
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="font-display tracking-snug truncate text-lg leading-tight font-bold">
              {who.name}
            </p>
            <p className="text-fg-subtle mt-0.5 truncate text-[11px]">{say(who.scope, lang)}</p>
          </div>

          <Link
            href={`/crew/${role}/more`}
            data-press
            aria-label={s.account}
            className="bg-brand-100 text-brand-700 grid size-[38px] flex-none place-items-center rounded-full text-xs font-bold"
          >
            {who.initials}
          </Link>
        </div>
      </header>

      {/*
       * The scroll region owns the horizontal gutter rather than each screen,
       * so a list that runs edge to edge — the table grid, the alert feed —
       * cannot end up inset by a different amount than the one above it.
       */}
      <div data-crew-scroll data-docked="true" className="px-[var(--crew-gutter)] pt-4">
        {children}
      </div>

      <CrewDock role={role} lang={lang} />
    </div>
  );
}
