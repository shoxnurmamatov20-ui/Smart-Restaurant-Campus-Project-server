import { TenantList } from './tenant-list';

export const metadata = { title: 'Restoranlar' };

/**
 * Every restaurant on the platform.
 *
 * The screen is a shell around one client component: the search and the chips
 * are interactive, and there is nothing else on the page to keep on the server.
 *
 * TODO — once the platform API lands:
 *   - Server-side search and pagination, when the estate outgrows one payload
 *   - Sorting by column, which a worklist eventually needs
 *   - Bulk actions: remind, suspend, export
 */
export default function TenantsPage() {
  return <TenantList />;
}
