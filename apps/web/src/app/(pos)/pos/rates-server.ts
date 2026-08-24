import { apiGet } from '@/lib/api-server';

/**
 * The two rates the till may print beside a figure.
 *
 * The labels on this screen used to carry them as text — `console.pos.service`
 * still reads "Xizmat haqi 10%" and `console.pos.vat` "Shundan QQS 12%" — and a
 * restaurant on a different rate therefore read a printed percentage that
 * contradicted the amount next to it. The amount is always right: it comes down
 * from `BillTotals::of()`, which reads the tenant's own settings. So the till
 * dropped the rate from its labels, which fixed the contradiction by removing
 * information a cashier is asked about all day ("why is there ten thousand on
 * my bill?").
 *
 * This is the other half. One read of `GET /api/v1/settings` answers both, and
 * the label is composed from the same number the server computed the figure
 * from, so the two cannot drift apart again.
 *
 * ---------------------------------------------------------------------------
 * `null`, not defaults
 *
 * A cashier does not hold `settings.view`, and that is the ordinary case rather
 * than an error — `apiGet` answers `null` and the till carries on. When it does,
 * the screens fall back to the rate-free labels they already have, which is
 * correct in every configuration. Substituting the platform's 12 and 10 here
 * would put a printed rate on a bill for a restaurant nobody had asked, which
 * is precisely the defect this exists to close.
 *
 * Server-only, like every other seam under this route: `apiGet` reads the
 * session cookie through `next/headers`, and the client components take the
 * answer as a prop.
 */
export type BillRates = { vat: number; service: number };

type ApiRateSettings = {
  data?: { settings?: { vat_percent?: number; service_charge_percent?: number } };
};

/**
 * Both rates, or null when the till may not read them.
 *
 * A percentage outside 0–100 is treated as unreadable rather than clamped: a
 * settings row that says 1 200 is a data problem, and printing "Xizmat haqi
 * 1200%" beside a correct figure is worse than printing no rate at all.
 */
export async function fetchBillRates(): Promise<BillRates | null> {
  const settings = await apiGet<ApiRateSettings>('/settings');
  const values = settings?.data?.settings;

  if (values === undefined) return null;

  const vat = values.vat_percent;
  const service = values.service_charge_percent;

  if (!inRange(vat) || !inRange(service)) return null;

  return { vat, service };
}

function inRange(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 100;
}
