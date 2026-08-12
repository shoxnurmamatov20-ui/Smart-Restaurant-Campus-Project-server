import { getTranslations } from 'next-intl/server';
import { formatNumber } from '@restaurant/utils';

import { moduleMetadata } from '../../module-page';
import { PageHead, Row, TableCard } from '../../screen';
import { getDeliveries } from './operations-data';

export const generateMetadata = () => moduleMetadata('stockOps');

/**
 * What actually moves the stock.
 *
 * Built to the design's Stock operations screen: five tabs across the top —
 * receiving, count, waste, transfer, recipe card — with receiving open, which
 * is what a storekeeper starts the morning on.
 *
 * A delivery is shown as ordered against received, with the variance called
 * out. That is the whole job: the supplier's document says forty kilograms and
 * the scale says thirty-eight, and someone has to decide which one the ledger
 * believes before the meat goes in the fridge.
 *
 * TODO — Phase 1 · inventory/operations, once the module is built:
 *   - Accepting a delivery, which posts the stock and the payable together
 *   - The count sheet, and the variance it writes to the ledger
 *   - Waste with a reason, since that is what makes it analysable
 *   - Transfers between branches, both sides in one movement
 *   - Recipe cards, which is what makes every deduction automatic
 */
const COLUMNS = '[grid-template-columns:minmax(0,1.4fr)_110px_110px_120px]';

/** The design's two open deliveries — what the screen draws with no session. */
const DELIVERIES = [
  {
    id: 'INV-4862',
    supplier: 'Toshkent Go‘sht Savdo',
    time: '08:40',
    lines: [
      { key: 'itemBeef', ordered: 40, received: 38 },
      { key: 'itemLamb', ordered: 25, received: 25 },
      { key: 'itemChicken', ordered: 30, received: 30 },
    ],
  },
  {
    id: 'INV-4871',
    supplier: 'Anhor Sabzavot',
    time: '09:15',
    lines: [
      { key: 'itemCarrot', ordered: 50, received: 50 },
      { key: 'itemOnion', ordered: 40, received: 36 },
      { key: 'itemTomato', ordered: 20, received: 20 },
      { key: 'itemHerbs', ordered: 8, received: 8 },
    ],
  },
] as const;

const TABS = ['tabReceiving', 'tabCount', 'tabWaste', 'tabTransfer', 'tabRecipe'] as const;

export default async function StockOperationsPage() {
  const [nav, t] = await Promise.all([
    getTranslations('console.nav'),
    getTranslations('console.stockOps'),
  ]);

  /*
   * The API's open deliveries when there is a session, the fixtures when there
   * is not. The two carry their line names differently — a fixture holds a
   * catalogue key, a real document holds what the supplier wrote — so the rows
   * are normalised here rather than in the table below.
   */
  const live = await getDeliveries();
  const deliveries =
    live ??
    DELIVERIES.map((delivery) => ({
      ...delivery,
      lines: delivery.lines.map((line) => ({ ...line, name: t(line.key) })),
    }));

  return (
    <>
      <PageHead title={nav('stockOps')} subtitle={t('subtitle')} />

      <div className="bg-bg-muted mb-5 flex w-fit flex-wrap gap-0.5 rounded-md p-[3px]">
        {TABS.map((tab, index) => (
          <button
            key={tab}
            type="button"
            data-seg
            data-active={index === 0 ? 'true' : undefined}
            className="text-fg-muted h-8 rounded-[7px] border-0 bg-transparent px-3.5 text-sm font-medium"
          >
            {t(tab)}
          </button>
        ))}
      </div>

      {deliveries.map((delivery) => (
        <section key={delivery.id} className="bg-surface mb-4 overflow-hidden rounded-lg border">
          <div className="border-divider flex flex-wrap items-center justify-between gap-3 border-b px-5 pt-4 pb-3.5">
            <div>
              <h3 className="text-md tracking-snug font-semibold">{delivery.supplier}</h3>
              <p className="text-fg-subtle mt-1 text-xs">
                {t('docMeta', { doc: delivery.id, time: delivery.time })}
              </p>
            </div>

            <button
              type="button"
              className="bg-brand-500 hover:bg-brand-600 h-[34px] rounded-md px-4 text-sm font-semibold text-white"
            >
              {t('accept')}
            </button>
          </div>

          <TableCard
            columns={COLUMNS}
            className="rounded-none border-0"
            head={[
              t('colItem'),
              { label: t('colOrdered'), align: 'right' },
              { label: t('colReceived'), align: 'right' },
              { label: t('colVariance'), align: 'right' },
            ]}
          >
            {delivery.lines.map((line) => {
              const variance = line.received - line.ordered;

              return (
                <Row key={line.name} columns={COLUMNS} className="py-3">
                  <span className="min-w-0 text-sm font-medium">{line.name}</span>

                  <span data-num className="text-fg-muted text-right text-sm">
                    {formatNumber(line.ordered)} kg
                  </span>
                  <span data-num className="text-right text-sm font-semibold">
                    {formatNumber(line.received)} kg
                  </span>

                  {/* A short delivery is the only thing on this row worth a
                      colour, so nothing else gets one. */}
                  <span
                    data-num
                    className={`text-right text-sm font-semibold ${
                      variance < 0 ? 'text-danger-700' : 'text-fg-subtle'
                    }`}
                  >
                    {variance === 0 ? '—' : `${variance > 0 ? '+' : '−'}${Math.abs(variance)} kg`}
                  </span>
                </Row>
              );
            })}
          </TableCard>
        </section>
      ))}
    </>
  );
}
