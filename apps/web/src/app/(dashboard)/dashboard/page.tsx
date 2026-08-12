import { getTranslations } from 'next-intl/server';

import { getSession } from '@/lib/session';

import { AccountantDashboard } from './accountant';
import { CashierDashboard } from './cashier';
import { ManagerDashboard } from './manager';
import { OwnerDashboard } from './owner';
import { WaiterDashboard } from './waiter';
import { WarehouseDashboard } from './warehouse';

export async function generateMetadata() {
  const t = await getTranslations('console.nav');
  return { title: t('dashboard') };
}

/**
 * One route, six screens.
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
export default async function DashboardPage() {
  const { role } = await getSession();

  switch (role.id) {
    case 'manager':
      return <ManagerDashboard />;
    case 'accountant':
      return <AccountantDashboard />;
    case 'warehouse':
      return <WarehouseDashboard />;
    case 'waiter':
      return <WaiterDashboard />;
    case 'cashier':
      return <CashierDashboard />;
    default:
      return <OwnerDashboard />;
  }
}
