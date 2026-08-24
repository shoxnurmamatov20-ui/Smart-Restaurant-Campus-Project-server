import { getTranslations } from 'next-intl/server';

import { Chip, Head, Table, Td, Tr } from '../../platform-ui';
import { seenLabel } from '../platform-data';
import { platformOverview } from '../platform-server';

export async function generateMetadata() {
  const t = await getTranslations('console.platformNav');
  return { title: t('trials') };
}

/**
 * Who is still deciding, and how long they have.
 *
 * The whole screen used to be a fixture. `TRIALS` was six hardcoded entries
 * with an `ordersTaken` count and a `likelihood` percentage, drawn beside real
 * restaurant names pulled out of the live overview — so an operator read
 * "migration likelihood 74%" about a customer nobody had measured, and rang
 * them on the strength of it.
 *
 * What replaces it is the fact that number was pretending to summarise. The
 * platform genuinely knows whether a trial has been SET UP: how many venues it
 * opened, how many logins it issued, how many tills it paired. A trial with a
 * paired till has already been installed by somebody and is deciding whether to
 * pay; a trial still on nought has not got past the wizard, and those two need
 * different phone calls. Orders taken would be a better signal still, and it is
 * absent on purpose — it lives in another module's schema and there is no
 * contract that would let this screen reach it without core reading `orders`
 * directly.
 *
 * Three days or fewer is red. That is the window where a call still changes the
 * outcome; after it the account lapses and the conversation becomes a
 * reactivation, which is a much harder one.
 */
export default async function TrialsPage() {
  const [t, nav, city, card] = await Promise.all([
    getTranslations('console.platformTrials'),
    getTranslations('console.platformNav'),
    getTranslations('console.city'),
    getTranslations('console.platformTenants.card'),
  ]);

  /* The eight phrases both this screen and the tenants list label their
     activity column with. A list, so `.raw()` rather than `card()`. */
  const seenPhrases = card.raw('seen') as readonly string[];

  const data = await platformOverview();

  /*
   * Days from midnight to midnight, not from now.
   *
   * A trial ending in nine hours and one ending in thirty are both "tomorrow"
   * to the person being rung, and rounding the difference in hours would print
   * 0 for one of them and 1 for the other. Computed on the server, where there
   * is one clock — a count worked out in the browser would disagree with the
   * page it sits on for anybody in another timezone.
   */
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);

  const daysLeft = (iso: string): number => {
    const ends = new Date(iso);
    ends.setHours(0, 0, 0, 0);

    return Math.round((ends.getTime() - startOfToday.getTime()) / 86_400_000);
  };

  /*
   * A restaurant on a trial is one with an end date, whatever else it is.
   *
   * Not `state === 'trial'`, which the overview computes as "active AND the
   * date is in the future" — that hides the row an operator most needs, the
   * trial that ran out while nobody was looking.
   */
  const trials = data.list
    .filter((tenant) => tenant.trialEndsAt != null)
    .map((tenant) => ({ tenant, left: daysLeft(tenant.trialEndsAt as string) }))
    .sort((a, b) => a.left - b.left);

  /** `YYYY-MM-DD` into the `dd.mm.yyyy` this console prints. */
  const readable = (iso: string | null | undefined): string => {
    const parts = (iso ?? '').slice(0, 10).split('-');

    return parts.length === 3 ? `${parts[2]}.${parts[1]}.${parts[0]}` : '—';
  };

  return (
    <>
      <Head title={nav('trials')} subtitle={t('subtitle')} />

      {trials.length === 0 ? (
        /* An honest empty state. It used to be unreachable, because the fixture
           behind this screen was never empty. */
        <div className="text-fg-subtle rounded-lg border border-dashed p-12 text-center text-sm">
          {t('empty')}
        </div>
      ) : (
        <Table
          head={[
            { label: t('colTenant') },
            { label: t('colOwner') },
            { label: t('colSetup') },
            { label: t('colSeen') },
            { label: t('colDaysLeft'), align: 'right' },
          ]}
        >
          {trials.map(({ tenant, left }) => {
            /* Nothing opened, nobody added, no till paired: the wizard was
               closed and never reopened. It is the one row on this screen that
               is worth a tone, because it is the only one where the call has to
               be made today. */
            const untouched = tenant.branches <= 1 && tenant.users <= 1 && tenant.terminals === 0;

            return (
              <Tr key={tenant.id}>
                <Td>
                  <span className="font-medium">{tenant.name}</span>
                  <span className="text-fg-subtle block text-xs">
                    {city(tenant.city)} · {t('since', { date: readable(tenant.since) })}
                  </span>
                </Td>

                <Td>
                  <span className="text-fg-muted text-sm">{tenant.owner?.name ?? '—'}</span>
                  {tenant.owner?.email ? (
                    <span className="text-fg-subtle block truncate font-mono text-xs">
                      {tenant.owner.email}
                    </span>
                  ) : null}
                </Td>

                <Td>
                  {untouched ? (
                    <Chip tone="warning">{t('untouched')}</Chip>
                  ) : (
                    <span data-num className="text-fg-muted text-sm">
                      {t('setup', {
                        branches: tenant.branches,
                        users: tenant.users,
                        terminals: tenant.terminals ?? 0,
                      })}
                    </span>
                  )}
                </Td>

                <Td className="text-fg-subtle text-xs">
                  {/* Read off the audit trail, not off a login: a restaurant
                      whose owner has not signed in for a week but whose tills
                      have been selling all day is not dormant. */}
                  {seenLabel(tenant.seenMinutes, seenPhrases)}
                </Td>

                <Td align="right">
                  {left < 0 ? (
                    <Chip tone="danger">{t('expired')}</Chip>
                  ) : left === 0 ? (
                    <Chip tone="danger">{t('today')}</Chip>
                  ) : left <= 3 ? (
                    <Chip tone="danger">{t('days', { n: left })}</Chip>
                  ) : (
                    /* Anything past the window is graphite. A trial with three
                       weeks left is not something an operator has to act on,
                       and a chip around it says otherwise. */
                    <span data-num className="text-fg-muted text-sm">
                      {t('days', { n: left })}
                    </span>
                  )}
                </Td>
              </Tr>
            );
          })}
        </Table>
      )}
    </>
  );
}
