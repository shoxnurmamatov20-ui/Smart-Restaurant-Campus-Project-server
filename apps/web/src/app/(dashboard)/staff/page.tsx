import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { formatTiyinAmount } from '@restaurant/utils';

import { moduleMetadata } from '../module-page';
import { shellState } from '../shell-server';
import { getSession } from '@/lib/session';
import { AddStaff } from './add-staff';
import { PairPhone } from './pair-phone';
import { ACTION, Avatar, PageHead, Pill, Row, TableCard, type Tone } from '../screen';
import { Tabs } from '../tabs';
import {
  ATTENDANCE,
  isLate,
  LATE_GRACE_MINUTES,
  PAYROLL,
  STAFF,
  stillOwed,
  type AttendanceState,
} from './staff-data';
import { getRoster, rosterFacts, rosterIsLive } from './staff-server';

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
 * The people tab reads the API — the roster, today's published rota and the
 * open attendance records, joined in `staff-server.ts`. The other two still
 * draw fixtures: attendance has an endpoint but the design's table asks for the
 * rostered start beside the actual one, and payroll has no table at all.
 *
 * TODO — Phase 1 · staff, once the module is built:
 *   - Attendance: the rostered start beside the actual one, and the exceptions
 *   - Payroll: rates, hours, bonuses, deductions
 *   - Documents: contract, medical book, expiry reminders
 *   - Roles and permissions, which the button above already points at
 */
const ATT_COLUMNS = '[grid-template-columns:minmax(0,1.4fr)_110px_130px_110px_150px]';

const PAY_COLUMNS = '[grid-template-columns:minmax(0,1.3fr)_130px_130px_140px_130px_140px]';

/** Absent is the only one that shouts. Off today is information. */
const ATTENDANCE_TONE: Record<AttendanceState, Tone> = {
  onTime: 'success',
  late: 'warning',
  absent: 'danger',
  off: 'neutral',
};

const COLUMNS = '[grid-template-columns:minmax(0,1.5fr)_170px_170px_130px_100px_130px_90px]';

/** `CrewLogin::DESK_POSITIONS` — who works at the console and so needs a password, not only a PIN. */
const DESK_POSITIONS = new Set(['manager', 'accountant', 'operator']);

export default async function StaffPage() {
  const [nav, t, common, blank, roster, shell, session] = await Promise.all([
    getTranslations('console.nav'),
    getTranslations('console.staff'),
    getTranslations('console.common'),
    getTranslations('console.empty'),
    // The API when there is a session, the fixtures when there is not.
    getRoster(),
    // The venues this manager may hire into — the same read the header's
    // switcher makes, and it is already cached for this render.
    shellState(null),
    getSession(),
  ]);

  /*
   * The design's sentence over the design's data; the counts over the
   * restaurant's own. The fixture console keeps "19 people in Chilonzor" —
   * which is what the fixture holds — and a live one says what it has, even
   * when what it has is nobody yet.
   */
  const live = rosterIsLive(roster);
  const facts = rosterFacts(roster, session.placeName, live);
  const subtitle = facts === null ? t('subtitle') : t('subtitleLive', facts);

  return (
    <>
      <PageHead title={nav('staff')} subtitle={subtitle}>
        {/* The page a manager sends a new hire to: the staff app's download.
            This is where a phone gets enrolled, so this is where the link to
            the thing being enrolled belongs. A button, not the store badges —
            the console draws buttons. */}
        <Link href="/download" className={`${ACTION} grid place-items-center`}>
          {t('crewApp')}
        </Link>
        <Link href="/staff/shifts" className={`${ACTION} grid place-items-center`}>
          {t('shiftPlan')}
        </Link>
        <Link href="/settings/permissions" className={`${ACTION} grid place-items-center`}>
          {t('roles')}
        </Link>
        {/* Wired, not a flash: `POST /api/staff/members`. A restaurant with
            no venue yet gets a link to open one instead — an employee is
            hired into a venue, and a form that could only fail is worse than
            a signpost. */}
        <AddStaff
          labels={{
            add: t('add'),
            hire_first: t('hire_first'),
            hire_last: t('hire_last'),
            hire_position: t('hire_position'),
            hire_phone: t('hire_phone'),
            hire_branch: t('hire_branch'),
            hire_save: t('hire_save'),
            hire_cancel: t('hire_cancel'),
            hire_done: t.raw('hire_done') as string,
            hire_failed: t('hire_failed'),
            hire_needBranch: t('hire_needBranch'),
            hire_openBranches: t('hire_openBranches'),
            pair_pinOnce: t('pair_pinOnce'),
            roleWaiter: t('roleWaiter'),
            roleKitchen: t('roleKitchen'),
            roleHeadChef: t('roleHeadChef'),
            roleCashier: t('roleCashier'),
            roleBartender: t('roleBartender'),
            roleHost: t('roleHost'),
            roleCourier: t('roleCourier'),
            roleStore: t('roleStore'),
            roleShiftManager: t('roleShiftManager'),
            roleAccountant: t('roleAccountant'),
            roleOperator: t('roleOperator'),
          }}
          branches={shell.branches.map((branch) => ({ id: branch.id, name: branch.name }))}
        />
      </PageHead>

      <Tabs
        ariaLabel={nav('staff')}
        tabs={[
          { key: 'people', label: t('tabPeople') },
          { key: 'attendance', label: t('tabAttendance') },
          { key: 'payroll', label: t('tabPayroll') },
        ]}
        panels={{
          people: (
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
              empty={{ title: blank('staff'), body: blank('staffSub') }}
            >
              {roster.map((person) => (
                <Row key={person.id} columns={COLUMNS} className="py-3">
                  <span className="flex min-w-0 items-center gap-3">
                    <Avatar name={person.name} />
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-semibold">{person.name}</span>
                      {/* The crew app's door, under the name rather than in a
                          column of its own: the table's 1080px floor puts an
                          eighth column behind a scrollbar on every laptop with
                          the sidebar open, and a control a manager has to
                          scroll to find is a control they phone support about.
                          A fixture row has no server behind it and draws
                          nothing — a button that can only fail is worse. */}
                      {live ? (
                        <PairPhone
                          memberId={person.id}
                          userId={person.userId}
                          name={person.name}
                          desk={DESK_POSITIONS.has(person.position ?? '')}
                          labels={{
                            pair_button: t('pair_button'),
                            pair_once: t('pair_once'),
                            pair_until: t('pair_until'),
                            pair_again: t('pair_again'),
                            pair_copy: t('pair_copy'),
                            pair_copied: t('pair_copied'),
                            pair_failed: t('pair_failed'),
                            pair_openLogin: t('pair_openLogin'),
                            pair_newPin: t('pair_newPin'),
                            pair_pinOnce: t('pair_pinOnce'),
                            pair_loginFailed: t('pair_loginFailed'),
                            pair_password: t('pair_password'),
                            pair_passwordOnce: t('pair_passwordOnce'),
                            pair_passwordFailed: t('pair_passwordFailed'),
                          }}
                        />
                      ) : null}
                    </span>
                  </span>

                  <span className="text-fg-muted text-sm">{t(person.role)}</span>
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
          ),
          attendance: (
            <>
              <p className="text-fg-muted mb-3 text-sm leading-normal">
                {t('attendanceSub', { minutes: LATE_GRACE_MINUTES })}
              </p>

              <TableCard
                columns={ATT_COLUMNS}
                head={[
                  t('colEmployee'),
                  t('colDue'),
                  t('colClockedIn'),
                  { label: t('colLate'), align: 'right' },
                  t('colState'),
                ]}
                empty={{ title: blank('generic'), body: blank('genericSub') }}
              >
                {ATTENDANCE.map((row) => {
                  const person = STAFF.find((entry) => entry.id === row.staffId);

                  return (
                    <Row key={row.staffId} columns={ATT_COLUMNS} className="py-3">
                      <span className="truncate text-sm font-semibold">
                        {person?.name ?? row.staffId}
                      </span>
                      <span data-num className="text-fg-muted text-sm">
                        {row.due}
                      </span>
                      <span data-num className="text-sm font-medium">
                        {row.clockedIn ?? '—'}
                      </span>

                      {/* Only past the grace period is it a number worth
                          colouring. Two minutes is on time. */}
                      <span
                        data-num
                        className={`text-right text-sm ${isLate(row) ? 'text-danger-700 font-semibold' : 'text-fg-subtle'}`}
                      >
                        {row.lateMinutes === 0 ? '—' : `+${row.lateMinutes}′`}
                      </span>

                      <span>
                        <Pill tone={ATTENDANCE_TONE[row.state]}>{t(`att_${row.state}`)}</Pill>
                      </span>
                    </Row>
                  );
                })}
              </TableCard>
            </>
          ),
          payroll: (
            <>
              <p className="text-fg-muted mb-3 text-sm leading-normal">{t('payrollSub')}</p>

              <TableCard
                columns={PAY_COLUMNS}
                head={[
                  t('colEmployee'),
                  { label: t('colBase'), align: 'right' },
                  { label: t('colBonus'), align: 'right' },
                  { label: t('colDeductions'), align: 'right' },
                  { label: t('colAdvance'), align: 'right' },
                  { label: t('colOwed'), align: 'right' },
                ]}
                empty={{ title: blank('generic'), body: blank('genericSub') }}
              >
                {PAYROLL.map((row) => {
                  const person = STAFF.find((entry) => entry.id === row.staffId);

                  return (
                    <Row key={row.staffId} columns={PAY_COLUMNS} className="py-3">
                      <span className="truncate text-sm font-semibold">
                        {person?.name ?? row.staffId}
                      </span>
                      <span data-num className="text-fg-muted text-right text-sm">
                        {formatTiyinAmount(row.base)}
                      </span>
                      <span data-num className="text-success-700 text-right text-sm">
                        +{formatTiyinAmount(row.bonus)}
                      </span>
                      <span data-num className="text-danger-700 text-right text-sm">
                        −{formatTiyinAmount(row.deductions)}
                      </span>
                      <span data-num className="text-fg-muted text-right text-sm">
                        {formatTiyinAmount(row.advance)}
                      </span>

                      {/* What is actually handed over on payday — the column a
                          manager is asked about, and the one arithmetic nobody
                          should be doing in their head. */}
                      <span data-num className="text-right text-sm font-semibold">
                        {formatTiyinAmount(stillOwed(row))}
                      </span>
                    </Row>
                  );
                })}
              </TableCard>
            </>
          ),
        }}
      />
    </>
  );
}
