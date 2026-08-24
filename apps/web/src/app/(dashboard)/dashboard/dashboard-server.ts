import { apiGet } from '@/lib/api-server';
import { getSession } from '@/lib/session';

import { getAccountantOverview, type AccountantOverview } from './accountant-data';
import { getCashierOverview, type CashierOverview } from './cashier-data';
import {
  accountantFrom,
  approvalsFrom,
  cashierFrom,
  managerFrom,
  operatorFrom,
  waiterFrom,
  warehouseFrom,
  type ApiApproval,
  type ApiDashboard,
} from './dashboard-map';
import { getManagerOverview, type ManagerOverview } from './manager-data';
import { getOperatorOverview, type OperatorOverview } from './operator-data';
import { type Period } from './overview-data';
import { getWaiterOverview, type WaiterOverview } from './waiter-data';
import { getWarehouseOverview, type WarehouseOverview } from './warehouse-data';

/**
 * The other six dashboards, from the API.
 *
 * Server half of the six `*-data.ts` files beside this one, and the same seam
 * `./overview-server.ts` opened for the owner: the types are unchanged, the
 * pages are unchanged, and the fixture stays exactly where it was so a console
 * with no session still renders the design's own figures.
 *
 * ---------------------------------------------------------------------------
 * One endpoint, seven shapes
 *
 * `GET /api/v1/dashboard?role=&period=` answers a genuinely different payload
 * per role, because the seven dashboards ask different questions — a manager
 * wants a leaderboard and an approval queue, a storekeeper wants a shelf. The
 * mapping from that payload into each screen's own type is in `./dashboard-map.ts`,
 * which is pure and tested; this file is only the pipe.
 *
 * ---------------------------------------------------------------------------
 * Why the role is a literal here and not an argument
 *
 * `getOverviewLive()` reads the role off the session, and it has to: it serves
 * `/dashboard` for whoever arrives. These six do not. Each is reached from
 * exactly one screen — `getCashierLive()` only ever runs inside
 * `CashierDashboard`, which `page.tsx` renders only for a cashier — so the role
 * is a property of the call site, and passing it in would let a caller ask for
 * a shape its screen cannot draw. The API scopes by permission regardless: a
 * waiter asking for the manager's payload is refused there, not here.
 *
 * ---------------------------------------------------------------------------
 * The greeting is the session's, everywhere
 *
 * A dashboard greets whoever is reading it, and that is not a figure the report
 * answers. The mapping keeps the fixture's name — it is pure and has no session
 * — and each getter below replaces it, exactly as `getOverviewLive()` does.
 *
 * The same is true of the PLACE. Every one of these six screens opened with a
 * sentence naming Chilonzor, because the sentence was a catalogue string: a
 * manager in Termiz read "Chilonzor · day shift", a cashier anywhere read
 * "Chilonzor · till 1". `placeName` travels with the figures for the same
 * reason the name does, and the screens word it themselves.
 */

/** `GET /api/v1/dashboard`, for one role and one stretch of trading. */
async function ask(role: string, period: Period): Promise<ApiDashboard | null> {
  const answer = await apiGet<{ data?: ApiDashboard }>(
    `/dashboard?role=${encodeURIComponent(role)}&period=${period}`,
  );

  return answer?.data ?? null;
}

/**
 * The reader's own first name, or the fixture's when there is no session.
 *
 * Split off because all six getters need it and because the fallback matters:
 * a console with no session is the demo console, and `Rustam` in the fixture is
 * part of the design's own screenshot.
 */
function greeting(name: string, fallback: string): string {
  return name.split(' ')[0] ?? fallback;
}

/**
 * The manager's approval queue — `GET /api/v1/pos/approvals`, pending by default.
 *
 * A second read beside the dashboard rather than a block on it, because the
 * queue is Pos's and `RoleDashboards` may not reach into that module. It is the
 * same list `packages/surfaces/src/crew/live.ts` reads for the phone, which
 * matters: the manager who answers on the handset and the manager who answers
 * at the desk must be looking at the same requests.
 *
 * `null` — no session, or a role without `pos.view` — is an empty queue rather
 * than the fixture's two. The panel draws `approvalsEmpty`, which is the true
 * statement: this console has nothing waiting for a signature. What it must
 * never do is put two invented requests behind live Approve and Decline
 * buttons, which is what it did.
 */
async function pendingApprovals(): Promise<readonly ApiApproval[] | undefined> {
  const answer = await apiGet<{ data?: ApiApproval[] }>('/pos/approvals?per_page=20');

  return answer?.data;
}

export async function getManagerLive(period: Period = 'today'): Promise<ManagerOverview> {
  const [fixture, session] = await Promise.all([getManagerOverview(null, period), getSession()]);

  const [data, approvals] = await Promise.all([ask('manager', period), pendingApprovals()]);

  if (data === null) return fixture;

  const mapped = managerFrom(data, fixture);

  return {
    ...mapped,
    greetingName: greeting(session.user.name, fixture.greetingName),
    placeName: session.placeName,
    approvals: approvalsFrom(approvals, new Date()),
  };
}

export async function getCashierLive(period: Period = 'today'): Promise<CashierOverview> {
  const [fixture, session] = await Promise.all([getCashierOverview(period), getSession()]);

  const data = await ask('cashier', period);

  if (data === null) return fixture;

  const mapped = cashierFrom(data, fixture);

  return {
    ...mapped,
    greetingName: greeting(session.user.name, fixture.greetingName),
    placeName: session.placeName,
  };
}

export async function getAccountantLive(period: Period = 'today'): Promise<AccountantOverview> {
  const [fixture, session] = await Promise.all([getAccountantOverview(period), getSession()]);

  const data = await ask('accountant', period);

  if (data === null) return fixture;

  const mapped = accountantFrom(data, fixture);

  return {
    ...mapped,
    greetingName: greeting(session.user.name, fixture.greetingName),
    placeName: session.placeName,
  };
}

export async function getWarehouseLive(period: Period = 'today'): Promise<WarehouseOverview> {
  const [fixture, session] = await Promise.all([getWarehouseOverview(null, period), getSession()]);

  const data = await ask('warehouse', period);

  if (data === null) return fixture;

  const mapped = warehouseFrom(data, fixture);

  return {
    ...mapped,
    greetingName: greeting(session.user.name, fixture.greetingName),
    placeName: session.placeName,
  };
}

export async function getWaiterLive(period: Period = 'today'): Promise<WaiterOverview> {
  const [fixture, session] = await Promise.all([getWaiterOverview(period), getSession()]);

  const data = await ask('waiter', period);

  if (data === null) return fixture;

  const mapped = waiterFrom(data, fixture);

  return {
    ...mapped,
    greetingName: greeting(session.user.name, fixture.greetingName),
    placeName: session.placeName,
  };
}

export async function getOperatorLive(period: Period = 'today'): Promise<OperatorOverview> {
  const [fixture, session] = await Promise.all([getOperatorOverview(period), getSession()]);

  const data = await ask('operator', period);

  if (data === null) return fixture;

  const mapped = operatorFrom(data, fixture);

  return {
    ...mapped,
    greetingName: greeting(session.user.name, fixture.greetingName),
    placeName: session.placeName,
  };
}
