import { getLocale, getTranslations } from 'next-intl/server';
import { formatTiyinAmount } from '@restaurant/utils';

import { moduleMetadata } from '../module-page';
import { ACTION, ACTION_PRIMARY, PageHead, Pill, Row, TableCard } from '../screen';
import { getMenuRows, marginOf } from './menu-data';

export const generateMetadata = () => moduleMetadata('menu');

/**
 * The menu.
 *
 * Built to the design's Menu screen: price, food cost and margin sit next to
 * each other on purpose — the point of the table is to show which dishes earn
 * their place, and a price without its cost beside it cannot answer that.
 *
 * The stop list is the `state` column: a dish the kitchen has 86'd reads
 * "Tugagan" in muted ink rather than green, and that is the same flag the floor
 * and the QR menu read.
 *
 * TODO — Phase 1 · menu, once the module is built:
 *   - Editing an item: price, modifiers, allergens, photo
 *   - Categories, and the order they appear in
 *   - The stop list, pushed live to the floor and the QR menu
 *   - Recipe cards, which is what makes the food cost above real
 *   - Per-channel prices (dine-in, delivery, aggregator)
 */
const COLUMNS = '[grid-template-columns:minmax(0,1.6fr)_150px_110px_110px_90px_120px_120px]';

export default async function MenuPage() {
  const [nav, t, locale] = await Promise.all([
    getTranslations('console.nav'),
    getTranslations('console.menu'),
    getLocale(),
  ]);

  // The API when there is a session, the fixtures when there is not — the
  // seam is inside getMenuRows(), so this screen never learns which it got.
  const rows = await getMenuRows(t, locale);

  return (
    <>
      <PageHead title={nav('menu')} subtitle={t('subtitle')}>
        <button type="button" className={ACTION}>
          {t('categories')}
        </button>
        <button type="button" className={ACTION_PRIMARY}>
          {t('addItem')}
        </button>
      </PageHead>

      <TableCard
        columns={COLUMNS}
        head={[
          t('colItem'),
          t('colCategory'),
          { label: t('colPrice'), align: 'right' },
          { label: t('colCost'), align: 'right' },
          { label: t('colMargin'), align: 'right' },
          t('colStation'),
          t('colState'),
        ]}
      >
        {rows.map((item) => (
          <Row key={item.id} columns={COLUMNS} className="py-3">
            <span className="min-w-0">
              <span className="block truncate text-sm font-semibold">{item.name}</span>
              <span data-num className="text-fg-subtle mt-0.5 block text-xs">
                {item.soldToday} {t('soldToday')}
              </span>
            </span>

            <span className="text-fg-muted text-sm">{item.categoryLabel}</span>

            <span data-num className="text-right text-sm font-semibold">
              {formatTiyinAmount(item.price)}
            </span>
            <span data-num className="text-fg-muted text-right text-sm">
              {formatTiyinAmount(item.cost)}
            </span>
            <span data-num className="text-right text-sm font-semibold">
              {marginOf(item)}%
            </span>

            <span className="text-fg-muted text-sm">{item.stationLabel}</span>

            <span>
              <Pill tone={item.available ? 'success' : 'neutral'}>
                {item.available ? t('available') : t('soldOut')}
              </Pill>
            </span>
          </Row>
        ))}
      </TableCard>
    </>
  );
}
