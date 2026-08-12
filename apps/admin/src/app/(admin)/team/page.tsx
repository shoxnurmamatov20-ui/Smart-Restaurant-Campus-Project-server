import { getTranslations } from 'next-intl/server';

import { TEAM, initials } from '../platform-data';

export async function generateMetadata() {
  const nav = await getTranslations('platform.nav');
  return { title: nav('team') };
}

/**
 * The people who run the platform, as opposed to the people who use it.
 *
 * Built to the design's team view: one row each, with the role and when they
 * were last here. Four people can hold every restaurant on the platform, which
 * is exactly why the access log next door matters.
 *
 * TODO — once the platform API lands:
 *   - Inviting a teammate, and the role that comes with the invitation
 *   - Removing access, which should end sessions rather than only the login
 *   - Enforced 2FA for anyone who can suspend a restaurant
 */
export default async function TeamPage() {
  const t = await getTranslations('platform.team');
  const nav = await getTranslations('platform.nav');
  const role = await getTranslations('platform.roles');

  return (
    <>
      <div data-pagehead className="mb-[18px] flex items-end justify-between gap-6">
        <p className="text-fg-muted text-sm">{nav('team')}</p>
        <button
          type="button"
          className="bg-brand-500 hover:bg-brand-600 h-9 rounded-md px-3.5 text-sm font-semibold text-white"
        >
          {t('invite')}
        </button>
      </div>

      <div className="bg-surface overflow-hidden rounded-lg border" data-table="s">
        {TEAM.map((person) => (
          <div
            key={person.email}
            data-row
            className="border-divider flex items-center gap-3.5 border-b px-[22px] py-3.5 last:border-b-0"
          >
            <span className="bg-bg-muted text-fg-muted grid size-9 flex-none place-items-center rounded-full text-xs font-semibold">
              {initials(person.name)}
            </span>

            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold">{person.name}</span>
              <span className="text-fg-subtle mt-0.5 block text-xs">{person.email}</span>
            </span>

            <span className="bg-bg-muted text-fg-muted rounded-pill text-2xs px-[9px] py-1 font-semibold">
              {role(person.role)}
            </span>

            <span className="text-fg-subtle flex items-center gap-2 text-xs whitespace-nowrap">
              <span
                aria-hidden
                className={`rounded-pill size-[7px] ${
                  person.online ? 'bg-success-500' : 'bg-[var(--n-300)]'
                }`}
              />
              {person.seen}
            </span>
          </div>
        ))}
      </div>
    </>
  );
}
