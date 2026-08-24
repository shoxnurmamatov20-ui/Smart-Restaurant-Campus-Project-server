import { getTranslations } from 'next-intl/server';

import { Chip, Head, Table, Td, Tr, type ChipTone } from '../../platform-ui';
import { type Operator } from '../platform-data';
import { platformTeam } from '../platform-server';
import { InviteOperator } from './invite-operator';

export async function generateMetadata() {
  const t = await getTranslations('console.platformNav');
  return { title: t('team') };
}

/**
 * The people who run the platform, and what each of them may reach.
 *
 * Scope is the point of the screen. Support needs impersonation and must never
 * change a plan; billing needs invoices and must never sign in as anybody. A
 * team page that lists names and no scopes is an org chart, not a control.
 */
export default async function TeamPage() {
  const [t, nav, team] = await Promise.all([
    getTranslations('console.platformTeam'),
    getTranslations('console.platformNav'),
    platformTeam(),
  ]);

  const TONE: Record<Operator['scope'], ChipTone> = {
    super: 'brand',
    support: 'success',
    billing: 'warning',
    engineer: 'neutral',
  };

  const seen = (minutes: number | null): string => {
    if (minutes === null) return t('never');
    if (minutes === 0) return t('onlineNow');
    if (minutes < 60) return t('minutesAgo', { n: minutes });
    if (minutes < 60 * 24) return t('hoursAgo', { n: Math.round(minutes / 60) });
    return t('daysAgo', { n: Math.round(minutes / (60 * 24)) });
  };

  return (
    <>
      <Head title={nav('team')} subtitle={t('subtitle')}>
        <InviteOperator
          labels={{
            invite: t('invite'),
            name: t('inviteName'),
            email: t('inviteEmail'),
            send: t('inviteSend'),
            cancel: t('inviteCancel'),
            failed: t('inviteFailed'),
            minted: t('inviteMinted'),
            next: t('inviteNext'),
          }}
        />
      </Head>

      <Table
        head={[
          { label: t('colName') },
          { label: t('colScope') },
          { label: t('colEmail') },
          { label: t('colSeen'), align: 'right' },
        ]}
      >
        {team.map((operator) => (
          <Tr key={operator.id}>
            <Td>
              <span className="flex items-center gap-2.5">
                <span className="bg-bg-muted text-fg-muted rounded-pill grid size-8 flex-none place-items-center text-xs font-semibold">
                  {operator.name
                    .split(' ')
                    .map((part) => part[0])
                    .join('')}
                </span>
                <span className="font-medium">{operator.name}</span>
              </span>
            </Td>
            <Td>
              <Chip tone={TONE[operator.scope]}>{t(`scope_${operator.scope}`)}</Chip>
              <span className="text-fg-subtle mt-1 block text-xs">
                {t(`scopeNote_${operator.scope}`)}
              </span>
            </Td>
            <Td numeric className="text-fg-muted">
              {operator.email}
            </Td>
            <Td align="right" className="text-fg-muted">
              {seen(operator.lastSeenMinutes)}
            </Td>
          </Tr>
        ))}
      </Table>
    </>
  );
}
