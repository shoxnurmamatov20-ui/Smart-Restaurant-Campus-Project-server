import Link from 'next/link';

import { AppearanceRow } from './appearance-row';
import { DesktopRow } from './crew-actions';
import { SwitchAccountRow } from './switch-account';

import { copy, FLASH, MORE_COPY } from '@restaurant/surfaces/crew/copy';
import { MORE, say, type CrewRole, type Lang } from '@restaurant/surfaces/crew/data';
import { Note } from './bits';

/**
 * Everything the four tabs do not hold, told honestly.
 *
 * The design puts about twenty-one inner screens behind this row of dots. Most
 * of them are not built, and there were two ways to handle that: leave them off
 * the list, or list them as links that go nowhere. Both are worse than this.
 * Leaving them off makes a manager conclude the app cannot close a shift, and
 * go looking on a desktop for something that is coming next month; a menu of
 * dead links teaches the same manager to stop trusting the menu, including the
 * rows that do work.
 *
 * So every screen is named, and a row states which of three things it is:
 * built and reachable, not built yet, or deliberately desktop-only. The third
 * is a distinct category on purpose — "Full system" is not a gap somebody
 * should file, it is a decision. Recipe cards and payroll do not belong on a
 * 390px screen and are not coming to one.
 *
 * A row that is not built is a `div`, not a disabled `button`. A disabled
 * control still invites a press and then refuses it; a line of text that says
 * what is missing does not ask for anything.
 *
 * The desktop row is the exception and it is a real control, because it has a
 * real answer: the design presses it and says where the work lives. "On
 * desktop" as a chip tells a manager what they already know; the press tells
 * them where to go.
 */
export function MorePanel({ lang, role }: { lang: Lang; role: CrewRole }) {
  const t = copy(MORE_COPY, lang);
  const f = copy(FLASH, lang);
  const rows = MORE[role];

  return (
    <section>
      <ul>
        {rows.map((row) => {
          const label = say(row.label, lang);
          const note = say(row.note, lang);

          const inner = (
            <>
              <span className="min-w-0">
                <span className="text-fg block text-sm font-semibold">{label}</span>
                <span className="text-fg-subtle text-2xs mt-0.5 block leading-normal">{note}</span>
              </span>

              {row.built ? (
                <svg
                  width="17"
                  height="17"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden
                  className="text-fg-subtle flex-none"
                >
                  <path d="m9 6 6 6-6 6" />
                </svg>
              ) : (
                <span
                  className={`text-2xs flex-none rounded-full px-2 py-1 font-semibold ${
                    row.desktopOnly
                      ? 'bg-bg-muted text-fg-subtle'
                      : 'bg-warning-50 text-warning-700'
                  }`}
                >
                  {row.desktopOnly ? t.desktop : t.notBuilt}
                </span>
              )}
            </>
          );

          const shape = 'border-divider flex items-center justify-between gap-3 border-b py-4';

          /*
           * `{role}` substitution rather than concatenating a relative slug.
           * Some of these screens sit outside the role's own subtree on
           * purpose — the lock screen has to escape the app chrome — and a
           * path built by concatenation would quietly drag it back in.
           */
          const href = row.href?.replace('{role}', role);

          /*
           * Ending the session is the one row that is not a navigation.
           *
           * It used to be `<Link href="/crew">`, which walked back to the PIN
           * screen and left the session cookie in a handset that is passed
           * around a kitchen. See `switch-account.tsx`.
           */
          /*
           * Deliberately desktop-only, and it says so out loud when pressed.
           * `built` stays false and no href is invented — the row still is not
           * a navigation, and `more-fidelity.test.ts` still counts exactly
           * three of them.
           */
          if (row.desktopOnly === true) {
            return (
              <li key={row.id}>
                <DesktopRow
                  lang={lang}
                  className={`${shape} min-h-[var(--tap-min)] w-full text-left`}
                >
                  {inner}
                </DesktopRow>
              </li>
            );
          }

          if (row.id === 'switch') {
            return (
              <li key={row.id}>
                <SwitchAccountRow
                  label={label}
                  note={note}
                  confirm={t.endConfirm}
                  cancel={t.endCancel}
                  working={t.endWorking}
                  signedOut={f.signedOut}
                  className={`${shape} min-h-[var(--tap-min)] w-full text-left`}
                >
                  {inner}
                </SwitchAccountRow>
              </li>
            );
          }

          return (
            <li key={row.id}>
              {row.built && href !== undefined ? (
                <Link
                  data-press
                  href={href}
                  className={`${shape} min-h-[var(--tap-min)] w-full text-left`}
                >
                  {inner}
                </Link>
              ) : (
                <div className={shape}>{inner}</div>
              )}
            </li>
          );
        })}
      </ul>

      <AppearanceRow lang={lang} />

      <Note>{t.note}</Note>
    </section>
  );
}
