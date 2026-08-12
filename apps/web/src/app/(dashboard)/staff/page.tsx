import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { formatTiyinAmount } from '@restaurant/utils';

import { moduleMetadata } from '../module-page';
import { ACTION, ACTION_PRIMARY, Avatar, PageHead, Pill, Row, TableCard } from '../screen';
import { getStaff } from './staff-server';

export const generateMetadata = () => moduleMetadata('staff');

/**
 * The roster.
 *
 * Built to the design's Staff screen: who is on the books, what they are on
 * today, and whether they have clocked in — which is the column a manager
 * opens this page for at ten past nine.
 *
 * Sales and tickets show an em dash for roles that do not take orders. A chef
 * with "0" beside their name reads as a bad month rather than as a job that
 * does not involve selling.
 *
 * TODO — Phase 1 · staff, once the module is built:
 *   - Attendance: Face ID and QR clock-in, and the exceptions
 *   - Payroll: rates, hours, bonuses, deductions
 *   - Documents: contract, medical book, expiry reminders
 *   - Roles and permissions, which the button above already points at
 */
const COLUMNS = '[grid-template-columns:minmax(0,1.5fr)_170px_170px_130px_100px_130px_90px]';

export default async function StaffPage() {
  const [nav, t, common] = await Promise.all([
    getTranslations('console.nav'),
    getTranslations('console.staff'),
    getTranslations('console.common'),
  ]);

  // The API when there is a session, the fixtures when there is not. Every
  // figure is derived from shifts, attendances and orders — see getStaff().
  const staff = await getStaff(t);

  return (
    <>
      <PageHead title={nav('staff')} subtitle={t('subtitle')}>
        <Link href="/staff/shifts" className={`${ACTION} grid place-items-center`}>
          {t('shiftPlan')}
        </Link>
        <Link href="/settings/permissions" className={`${ACTION} grid place-items-center`}>
          {t('roles')}
        </Link>
        <button type="button" className={ACTION_PRIMARY}>
          {t('add')}
        </button>
      </PageHead>

      <TableCard
        columns={COLUMNS}
        head={[
          t('colEmployee'),
          t('colRole'),
          t('colShift'),
          t('colState'),
          { label: t('colHours'), align: 'right' },
          { label: t('colSales'), align: 'right' },
          { label: t('colTickets'), align: 'right' },
        ]}
      >
        {staff.map((person) => (
          <Row key={person.id} columns={COLUMNS} className="py-3">
            <span className="flex min-w-0 items-center gap-3">
              <Avatar name={person.name} />
              <span className="truncate text-sm font-semibold">{person.name}</span>
            </span>

            <span className="text-fg-muted text-sm">{person.roleLabel}</span>
            <span data-num className="text-fg-muted text-sm">
              {person.shift}
            </span>

            <span>
              <Pill tone={person.clockedIn ? 'success' : 'neutral'}>
                {person.clockedIn ? t('clockedIn') : t('offShift')}
              </Pill>
            </span>

            <span data-num className="text-fg-muted text-right text-sm">
              {person.hours} {common('hours')}
            </span>
            <span data-num className="text-right text-sm font-semibold">
              {person.sales ? formatTiyinAmount(person.sales) : '—'}
            </span>
            <span data-num className="text-fg-muted text-right text-sm">
              {person.tickets || '—'}
            </span>
          </Row>
        ))}
      </TableCard>
    </>
  );
}
