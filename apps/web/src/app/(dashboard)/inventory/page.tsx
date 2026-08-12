import { getTranslations } from 'next-intl/server';
import { formatNumber, formatTiyinAmount } from '@restaurant/utils';

import { moduleMetadata } from '../module-page';
import { ACTION, ACTION_PRIMARY, PageHead, Pill, Rail, Row, StatStrip, TableCard } from '../screen';
import { getStockRows, LEVEL_RAIL, LEVEL_TONE, levelOf, STOCK_SUMMARY } from './inventory-data';

export const generateMetadata = () => moduleMetadata('inventory');

/**
 * The store room.
 *
 * Built to the design's Inventory screen: four figures across the top, then
 * every ingredient with what is on hand against what the kitchen set as par,
 * and a rail showing the one as a fraction of the other.
 *
 * The rail is the reason the screen works. A storekeeper does not compare two
 * numbers eleven times; they scan a column of bars and stop at the short red
 * ones. The pill beside it says the same thing in words, so the scan and the
 * reading agree.
 *
 * TODO — Phase 1 · inventory, once the module is built:
 *   - Recipe cards, so a sold dish deducts its ingredients
 *   - Goods receipt against the supplier's document
 *   - Stock counts: the count sheet and the variance it produces
 *   - Waste, with a reason
 *   - Transfers between branches
 */
const COLUMNS =
  '[grid-template-columns:minmax(0,1.4fr)_110px_110px_160px_120px_minmax(0,1fr)_96px]';

export default async function InventoryPage() {
  const [nav, t, common] = await Promise.all([
    getTranslations('console.nav'),
    getTranslations('console.inventory'),
    getTranslations('console.common'),
  ]);

  // The API when there is a session, the fixtures when there is not.
  const stock = await getStockRows();

  return (
    <>
      <PageHead title={nav('inventory')} subtitle={t('subtitle')}>
        <button type="button" className={ACTION}>
          {t('stockCount')}
        </button>
        <button type="button" className={ACTION}>
          {t('logWaste')}
        </button>
        <button type="button" className={ACTION_PRIMARY}>
          {t('newPurchase')}
        </button>
      </PageHead>

      <StatStrip
        stats={[
          { label: t('kStockValue'), value: formatTiyinAmount(STOCK_SUMMARY.valueTiyin) },
          {
            label: t('kBelowPar'),
            value: `${STOCK_SUMMARY.belowPar} ${common('items')}`,
            tone: 'warning',
          },
          { label: t('kWasteToday'), value: formatTiyinAmount(STOCK_SUMMARY.wasteTodayTiyin) },
          { label: t('kOpenPurchases'), value: String(STOCK_SUMMARY.openPurchases) },
        ]}
      />

      <TableCard
        columns={COLUMNS}
        head={[
          t('colIngredient'),
          { label: t('colOnHand'), align: 'right' },
          { label: t('colPar'), align: 'right' },
          t('colCoverage'),
          t('colState'),
          t('colSupplier'),
          '',
        ]}
      >
        {stock.map((row) => {
          const level = levelOf(row);
          const unit = t(row.unit);

          return (
            <Row key={row.id} columns={COLUMNS} className="py-3">
              <span className="min-w-0">
                <span className="block text-sm font-semibold">{row.name}</span>
                <span className="text-fg-subtle mt-0.5 block text-xs">{row.lastMove}</span>
              </span>

              <span data-num className="text-right text-sm font-semibold">
                {formatNumber(row.onHand)} {unit}
              </span>
              <span data-num className="text-fg-muted text-right text-sm">
                {row.par} {unit}
              </span>

              <Rail percent={Math.round((row.onHand / row.par) * 100)} colour={LEVEL_RAIL[level]} />

              <span>
                <Pill tone={LEVEL_TONE[level]}>{t(level)}</Pill>
              </span>

              <span className="text-fg-muted truncate text-sm">{row.supplier}</span>

              <button type="button" className="text-fg-brand text-right text-xs font-semibold">
                {t('order')}
              </button>
            </Row>
          );
        })}
      </TableCard>
    </>
  );
}
