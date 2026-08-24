import { getLocale, getTranslations } from 'next-intl/server';
import { formatTiyinAmount } from '@restaurant/utils';

import { moduleMetadata } from '../../module-page';
import { PageHead } from '../../screen';
import {
  batchCost,
  BY_KEY,
  DELIVERIES,
  lineCost,
  perBase,
  PREP_BY_KEY,
  PREP_ITEMS,
  prepUnitCost,
  RECIPES,
  recipeCost,
  shortfallValue,
  WASTE_LOG,
  type Lang,
} from './stock-ops-data';
import {
  fetchDeliveries,
  fetchLedger,
  fetchPrepCards,
  fetchRecipeCards,
  fetchStockItems,
  fetchTransfers,
  fetchVenues,
  fetchWasteLog,
} from './stock-ops-server';
import { StockOpsTabs } from './stock-ops-tabs';
import { TAB_ORDER } from './stock-ops-data';

export const generateMetadata = () => moduleMetadata('stockOps');

/**
 * What actually moves the stock.
 *
 * Seven tabs, from the design file's own strip: receiving, count, waste,
 * transfer, recipe cards, prep items, and the adjustment log. `specs/01-os.md
 * §5.8` names five; the file draws seven and the file wins.
 *
 * The page is a shell. Everything below the head is one client component,
 * because every tab is an interaction — a counted quantity, a chosen reason,
 * two branches, a selected recipe — and a tab strip that does not switch is the
 * bug this screen shipped with for months.
 *
 * Money is formatted here and handed down by key. That looks roundabout and is
 * deliberate: `formatTiyinAmount` needs the locale, the locale lives on the
 * server, and shipping the formatter plus its locale data to the browser to
 * render two dozen static amounts is a real cost for no gain.
 */
export default async function StockOperationsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  /* `?tab=count` and `?tab=waste` are the store screen's two head buttons. An
     unknown value falls back to receiving rather than rendering nothing. */
  const asked = (await searchParams).tab;
  const initial = TAB_ORDER.find((key) => key === asked) ?? 'recv';

  const [nav, t, pin, act, locale] = await Promise.all([
    getTranslations('console.nav'),
    getTranslations('console.stockOps'),
    getTranslations('console.approvalPin'),
    getTranslations('console.actions'),
    getLocale(),
  ]);

  const lang = locale as Lang;

  /*
   * The four lists the writing tabs need real ids for.
   *
   * Fetched in parallel and every one of them may be null: no session, an
   * expired token or an API mid-restart puts the screen back on its fixtures,
   * where the buttons confirm instead of posting. See stock-ops-server.ts.
   */
  const [venues, items, transfers, prepCards, deliveries] = await Promise.all([
    fetchVenues(),
    fetchStockItems(),
    fetchTransfers(),
    fetchPrepCards(lang),
    fetchDeliveries(),
  ]);

  /*
   * The dishes that have a technical card. Its own await rather than joining
   * the group above only because it is the last thing added here and the group
   * is already five wide; both are one round trip either way.
   */
  const recipes = await fetchRecipeCards();

  /*
   * The two ledger reads need the shelf to name their rows — a movement
   * carries an ingredient id and nothing else — so they follow rather than
   * run beside it.
   */
  const [ledger, wasteLog] = await Promise.all([fetchLedger(items), fetchWasteLog(items)]);
  const money = (tiyin: number) => formatTiyinAmount(Math.round(tiyin), lang);

  /* Every amount the seven tabs can show, formatted once, keyed by where it goes. */
  const amounts: Record<string, string> = {};

  for (const delivery of DELIVERIES) {
    amounts[`short_${delivery.id}`] = money(shortfallValue(delivery));
  }

  /*
   * And the same figure for the live vans, keyed by their own row ids.
   *
   * The fixture loop above keys by document number — `INV-4862` — and a live
   * delivery is keyed by primary key, so the two never collide. Formatted here
   * because the locale is here: the panel is a client island.
   */
  for (const delivery of deliveries ?? []) {
    amounts[`short_${delivery.id}`] = money(delivery.shortfallTiyin);
  }

  for (const entry of WASTE_LOG) amounts[`waste_${entry.id}`] = money(entry.cost);
  amounts.wasteTotal = money(WASTE_LOG.reduce((sum, entry) => sum + entry.cost, 0));

  for (const entry of wasteLog ?? []) amounts[`liveWaste_${entry.id}`] = money(entry.costTiyin);
  amounts.liveWasteTotal = money((wasteLog ?? []).reduce((sum, entry) => sum + entry.costTiyin, 0));

  for (const recipe of RECIPES) {
    amounts[`cost_${recipe.key}`] = money(recipeCost(recipe));
    amounts[`sell_${recipe.key}`] = money(recipe.sell);

    recipe.lines.forEach((line, index) => {
      const unitCost =
        line.kind === 'prep'
          ? prepUnitCost(PREP_BY_KEY.get(line.prep)!)
          : perBase(BY_KEY.get(line.ingredient)!);

      amounts[`unit_${recipe.key}_${index}`] = money(unitCost);
      amounts[`line_${recipe.key}_${index}`] = money(lineCost(line));
    });
  }

  for (const item of PREP_ITEMS) {
    amounts[`batch_${item.key}`] = money(batchCost(item));
    amounts[`prepUnit_${item.key}`] = money(prepUnitCost(item));
  }

  /* The live cards are costed by the server — `batch_cost_tiyin` and
     `unit_cost_tiyin` on the resource — so nothing is recomputed here; the
     figures are only formatted, in the same place and by the same function as
     the fixtures'. */
  for (const card of prepCards ?? []) {
    amounts[`liveBatch_${card.id}`] = money(card.batchCostTiyin);
    amounts[`liveUnit_${card.id}`] = money(card.unitCostTiyin);
  }

  const labels: Record<string, string> = {
    ...Object.fromEntries(TAB_ORDER.map((key) => [`tab_${key}`, t(`tab_${key}`)])),

    recvSub: t('recvSub'),
    docMeta: t.raw('docMeta') as string,
    accept: t('accept'),
    shortfall: t.raw('shortfall') as string,

    countSub: t('countSub'),
    countHidden: t('countHidden'),
    colCounted: t('colCounted'),
    matched: t('matched'),
    needsPin: t('needsPin'),
    signed: t('signed'),
    varianceRule: t.raw('varianceRule') as string,
    finishCount: t('finishCount'),
    countReason: t.raw('countReason') as string,

    wasteSub: t('wasteSub'),
    wastePlaceholder: t('wastePlaceholder'),
    wasteAdd: t('wasteAdd'),
    wasteTotal: t.raw('wasteTotal') as string,
    reason_expired: t('reason_expired'),
    reason_spoiled: t('reason_spoiled'),
    reason_broken: t('reason_broken'),
    reason_cooking: t('reason_cooking'),
    reason_returned: t('reason_returned'),

    moveSub: t('moveSub'),
    from: t('from'),
    to: t('to'),
    moveSend: t('moveSend'),
    samePlace: t('samePlace'),
    state_inTransit: t('state_inTransit'),
    state_received: t('state_received'),
    state_delivered: t('state_delivered'),

    recipeSub: t('recipeSub'),
    colIngredient: t('colIngredient'),
    colUnitCost: t('colUnitCost'),
    prepTag: t('prepTag'),
    totalCost: t('totalCost'),
    sellPrice: t('sellPrice'),
    margin: t('margin'),
    foodCost: t('foodCost'),
    lowMargin: t('lowMargin'),

    prepSub: t('prepSub'),
    prepMake: t('prepMake'),
    prepMade: t.raw('prepMade') as string,
    colBatch: t('colBatch'),
    colLoss: t('colLoss'),
    colShelf: t('colShelf'),
    colOnHand: t('colOnHand'),
    ingredients: t('ingredients'),
    days: t.raw('days') as string,

    recvEmpty: t('recvEmpty'),
    countNothing: t('countNothing'),
    countFailed: t('countFailed'),
    wasteIncomplete: t('wasteIncomplete'),
    wasteFailed: t('wasteFailed'),
    wasteEmpty: t('wasteEmpty'),
    logEmpty: t('logEmpty'),
    recipeEmpty: t('recipeEmpty'),
    recipeMissingLine: t('recipeMissingLine'),
    recipeUnresolved: t.raw('recipeUnresolved') as string,
    recipeFloor: t('recipeFloor'),

    logSub: t('logSub'),
    logNote: t('logNote'),
    kind_receiving: t('kind_receiving'),
    kind_count: t('kind_count'),
    kind_waste: t('kind_waste'),
    kind_transfer: t('kind_transfer'),
    kind_correction: t('kind_correction'),

    colItem: t('colItem'),
    colOrdered: t('colOrdered'),
    colReceived: t('colReceived'),
    colVariance: t('colVariance'),
    colQuantity: t('colQuantity'),
    colReason: t('colReason'),
    colCost: t('colCost'),
    colTime: t('colTime'),

    deliveryAccepted: act('deliveryAccepted'),
    countFinished: act('countFinished'),
    wasteLogged: act('wasteLogged'),
    transferSent: act('transferSent'),

    pinTitle: pin('title'),
    pinSub: pin('sub'),
    cancel: pin('cancel'),
    digitsEntered: pin.raw('digits') as string,
  };

  return (
    <>
      <PageHead title={nav('stockOps')} subtitle={t('subtitle')} />
      <StockOpsTabs
        lang={lang}
        labels={labels}
        money={amounts}
        initial={initial}
        venues={venues}
        items={items}
        transfers={transfers}
        prepCards={prepCards}
        deliveries={deliveries}
        recipes={recipes}
        ledger={ledger}
        wasteLog={wasteLog}
      />
    </>
  );
}
