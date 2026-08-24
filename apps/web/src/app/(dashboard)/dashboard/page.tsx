import { getTranslations } from 'next-intl/server';

import { getSession } from '@/lib/session';

import { isPeriod } from './overview-data';

import { AccountantDashboard } from './accountant';
import { CashierDashboard } from './cashier';
import { ManagerDashboard } from './manager';
import { OperatorDashboard } from './operator';
import { OwnerDashboard } from './owner';
import { WaiterDashboard } from './waiter';
import { WarehouseDashboard } from './warehouse';

export async function generateMetadata() {
  const t = await getTranslations('console.nav');
  return { title: t('dashboard') };
}

/**
 * One route, seven screens.
 *
 * The design gives every role its own dashboard and they share only a skeleton:
 * an eyebrow date over a greeting, a period segment opposite, a KPI row, then a
 * 1.4/1 split. What fills that skeleton is entirely different — a manager wants
 * the approval queue, an accountant wants six months of cash flow, a waiter
 * wants their own six tables.
 *
 * Dispatching here rather than at six routes because `/dashboard` is what the
 * sidebar's first row points at for every role, and because a waiter who is
 * promoted to manager should find their new screen at the same address.
 *
 * The chef and the platform operator never arrive: the layout sends them to the
 * kitchen display and the platform before this renders. `owner` is the fallback
 * for the same reason `roleOrDefault` picks it — an unreadable cookie should
 * land somewhere coherent, and the API refuses whatever the screen cannot back.
 */
export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string }>;
}) {
  const [{ role }, params] = await Promise.all([getSession(), searchParams]);

  /*
   * The period lives in the URL — see `period-toggle.tsx`. Anything the reader
   * invents falls back to today rather than 404ing: a mistyped query parameter
   * is not a missing page.
   */
  const period = isPeriod(params.period) ? params.period : 'today';

  switch (role.id) {
    case 'manager':
      return <ManagerDashboard period={period} />;
    case 'accountant':
      return <AccountantDashboard period={period} />;
    case 'warehouse':
      return <WarehouseDashboard period={period} />;
    case 'waiter':
      return <WaiterDashboard period={period} />;
    case 'cashier':
      return <CashierDashboard period={period} />;
    case 'operator':
      return <OperatorDashboard period={period} />;
    default:
      return <OwnerDashboard period={period} />;
  }
}
