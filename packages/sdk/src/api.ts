import type { AxiosInstance } from 'axios';
import { createClient, type RestaurantClientConfig } from './client';
import { createMenuClient } from './modules/menu';
import { createOrdersClient } from './modules/orders';
import { createKitchenClient } from './modules/kitchen';
import { createTablesClient } from './modules/tables';
import { createInventoryClient } from './modules/inventory';
import { createSuppliersClient } from './modules/suppliers';
import { createStaffClient } from './modules/staff';
import { createFinanceClient } from './modules/finance';
import { createCRMClient } from './modules/crm';
import { createAnalyticsClient } from './modules/analytics';

/**
 * Every module client, wired to one Axios instance.
 *
 * The shape mirrors the backend module list, so a capability the server does
 * not expose simply has no client here.
 */
export function createApi(config: RestaurantClientConfig) {
  const http: AxiosInstance = createClient(config);

  return {
    http,
    menu: createMenuClient(http),
    orders: createOrdersClient(http),
    kitchen: createKitchenClient(http),
    tables: createTablesClient(http),
    inventory: createInventoryClient(http),
    suppliers: createSuppliersClient(http),
    staff: createStaffClient(http),
    finance: createFinanceClient(http),
    crm: createCRMClient(http),
    analytics: createAnalyticsClient(http),
  };
}

export type Api = ReturnType<typeof createApi>;
