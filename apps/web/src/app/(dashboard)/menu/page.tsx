import { getLocale, getTranslations } from 'next-intl/server';
import { EmptyState } from '@restaurant/ui';
import { formatTiyinAmount } from '@restaurant/utils';

import { moduleMetadata } from '../module-page';
import { Pill, Row, TableCard } from '../screen';
import { Tabs } from '../tabs';
import { CATEGORIES, IMPORT_COLUMNS, marginOf, MODIFIER_GROUPS } from './menu-data';
import { MenuImport } from './menu-import';
import { MenuItems } from './menu-items';
import { StarterTemplate } from './menu-template';
import {
  getMenuCategories,
  getMenuRows,
  getModifierGroups,
  getVatPercent,
  menuFacts,
} from './menu-server';
import { PREP_COPY, say, type Lang } from './prep-data';
import { PrepPanel, RawGoodsPanel } from './prep-panels';
import { getPrepCards, getShelfItems } from './prep-server';

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
 *   - Editing an item: names, price, cost and photo are live; modifiers and
 *     allergens are still read-only in the drawer
 *   - Categories, and the order they appear in
 *   - The stop list, pushed live to the floor and the QR menu
 *   - Recipe cards, which is what makes the food cost above real
 *   - Per-channel prices (dine-in, delivery, aggregator)
 */
const CAT_COLUMNS = '[grid-template-columns:90px_minmax(0,1fr)_110px_150px]';

export default async function MenuPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [nav, t, locale, blank] = await Promise.all([
    getTranslations('console.nav'),
    getTranslations('console.menu'),
    getLocale(),
    getTranslations('console.empty'),
  ]);

  const lang = locale as Lang;

  /*
   * The API when there is a session, the fixtures when there is not — the seam
   * is inside getMenuRows(), so this screen never learns which it got.
   *
   * The prep cards are fetched beside it rather than after it: they feed a
   * different tab, neither read needs the other, and one round trip of latency
   * is one round trip whether the screen waits for it in series or not.
   */
  const [{ rows, live }, prepCards, shelf, categoryRows, vatPercent, modifierGroups] =
    await Promise.all([
      getMenuRows(t, locale),
      getPrepCards(lang),
      // The shelf, for the new prep card's component picker. Null on a console
      // with no session, and the form is then not offered at all.
      getShelfItems(),
      // The categories tab, which used to map the fixture unconditionally. `null`
      // is "the API did not answer"; `[]` is a restaurant that has built no
      // sections yet, and the table's own empty state says so.
      getMenuCategories(locale),
      // The caption's VAT clause, from this restaurant's settings rather than
      // from a number baked into three catalogues.
      getVatPercent(),
      /*
       * The sheets the Modifiers tab draws. `null` is the demo console and the
       * design's three groups; `[]` is a restaurant that asks no questions about
       * its dishes, which the tab now says rather than borrowing somebody else's.
       */
      getModifierGroups(),
    ]);

  /*
   * `/menu?filter=no-photo` — the site screen's "fix them all" button.
   *
   * A place rather than a click handler, for the same reason the customers
   * screen makes its selection a link: it survives a refresh and it can be sent
   * to whoever is going to take the photographs.
   */
  const photoFilter = (await searchParams).filter === 'no-photo';

  /*
   * Search matches all three locales, so all three go down with the row.
   *
   * The seam resolves one name for display; the other two come down beside it
   * in `row.names`, straight off the API's jsonb, and are what a
   * Russian-speaking manager on an Uzbek console will type. Joined into one
   * lowercase haystack here rather than compared three ways in a render loop
   * that runs on every keystroke.
   *
   * A fixture row has no `names` and falls back to its single name — the demo
   * console is one language deep, which is a property of the fixtures rather
   * than of the search.
   */
  const searchable = rows.map((row) => ({
    ...row,
    search: [
      row.name,
      row.names?.uz,
      row.names?.ru,
      row.names?.en,
      row.categoryLabel,
      row.stationLabel,
    ]
      .filter((part) => part !== undefined && part !== '')
      .join(' ')
      .toLowerCase(),
  }));

  /** The chips, in menu order, each with what it holds. */
  const categoryChips = [...new Set(rows.map((row) => row.categoryLabel))].map((label) => ({
    label,
    count: rows.filter((row) => row.categoryLabel === label).length,
  }));

  const amounts: Record<string, string> = {};

  for (const row of rows) {
    amounts[`price_${row.id}`] = formatTiyinAmount(row.price);
    amounts[`cost_${row.id}`] = formatTiyinAmount(row.cost);
    amounts[`margin_${row.id}`] = `${Math.round(marginOf(row))}%`;
    amounts[`priceRaw_${row.id}`] = String(Math.round(row.price / 100));
    amounts[`costRaw_${row.id}`] = String(Math.round(row.cost / 100));
  }

  const itemLabels: Record<string, string> = {
    search: t('search'),
    all: t('all'),
    showing: t.raw('showing') as string,
    colItem: t('colItem'),
    colCategory: t('colCategory'),
    colPrice: t('colPrice'),
    colCost: t('colCost'),
    colMargin: t('colMargin'),
    colState: t('colState'),
    onSale: t('onSale'),
    stopped: t('stopped'),
    station: t('colStation'),
    emptyFilter: t('emptyFilter'),
    emptyFilterSub: t('emptyFilterSub'),
    marginNote: t.raw('marginNote') as string,
    editorNote: t('editorNote'),
    save: t('save'),
    close: t('close'),
    photo: t('photo'),
    photoHint: t('photoHint'),
    photoChoose: t('photoChoose'),
    photoUploading: t('photoUploading'),
    photoSaved: t('photoSaved'),
    photoFailed: t('photoFailed'),
    photoDrop: t('photoDrop'),
    photoShrinking: t('photoShrinking'),
    photoRemove: t('photoRemove'),
    photoRemoved: t('photoRemoved'),
    photoNone: t('photoNone'),
    cropTitle: t('cropTitle'),
    cropHint: t('cropHint'),
    cropOriginal: t('cropOriginal'),
    cropZoom: t('cropZoom'),
    cropTurnLeft: t('cropTurnLeft'),
    cropTurnRight: t('cropTurnRight'),
    cropApply: t('cropApply'),
    cropCancel: t('cropCancel'),
    cropEdit: t('cropEdit'),
    cropLoading: t('cropLoading'),
    cropLoadFailed: t('cropLoadFailed'),
    cropSaveFailed: t('cropSaveFailed'),
  };

  /*
   * The import panel's words, resolved here.
   *
   * Same rule as `itemLabels` above: the catalogue stays on the server and the
   * client island receives sentences, so nothing about locales crosses the
   * boundary. The three with `{n}` and `{created}` in them come through
   * `t.raw()` — their numbers are per row and per run, and only the browser
   * knows them.
   */
  const importLabels = {
    upload: t('importUpload'),
    map: t('importMap'),
    recheck: t('importRecheck'),
    apply: t('importApply'),
    checking: t('importChecking'),
    writing: t('importWriting'),
    hint: t('importHint'),
    file: t('importFile'),
    reportDry: t('importReportDry'),
    reportWritten: t('importReportWritten'),
    rows: t('importRows'),
    created: t('importCreated'),
    updated: t('importUpdated'),
    skipped: t('importSkipped'),
    newCategories: t('importNewCategories'),
    refusals: t('importRefusals'),
    rowNumber: t.raw('importRowNumber') as string,
    truncated: t.raw('importTruncated') as string,
    done: t.raw('importDone') as string,
    failed: t('importFailed'),
    nothing: t('importNothing'),
    mapTitle: t('importMapTitle'),
    ignore: t('importIgnore'),
    fields: {
      name: t('col_name'),
      category: t('col_category'),
      price: t('col_price'),
      cost: t('col_cost'),
      station: t('col_station'),
      allergens: t('col_allergens'),
      sku: t('col_sku'),
      description: t('col_description'),
    },
  };

  /*
   * The line under the title.
   *
   * The catalogue's sentence counts the fixture and asserts a 12% rate; over a
   * live, empty menu all three of its clauses were wrong at once. So: counts
   * from the rows this render is about to draw, and the VAT clause only when
   * the restaurant is registered for VAT and settings answered with a rate.
   */
  /*
   * The sheets to draw: this restaurant's when the API answered, the design's
   * three when it did not. An empty live list stays empty — the tab's own
   * empty state says the restaurant has not built any.
   */
  const modifierRows = modifierGroups ?? MODIFIER_GROUPS;

  const facts = menuFacts(rows, live);
  const subtitle =
    facts === null
      ? t('subtitle')
      : [
          t('subtitleCount', facts),
          vatPercent === null ? null : t('subtitleVat', { percent: vatPercent }),
        ]
          .filter((part) => part !== null)
          .join(' · ');

  return (
    <>
      <Tabs
        ariaLabel={nav('menu')}
        title={nav('menu')}
        subtitle={subtitle}
        /*
         * The design's own two head buttons, and both reach the strip:
         * `mnu.imports` opens the Import tab and `mnu.newItem` goes back to
         * Items. They were drawn here with no handler at all, which is the one
         * thing a button must never be.
         */
        actions={[
          { label: t('importTitle'), tab: 'import' },
          { label: t('addItem'), tab: 'items', primary: true },
        ]}
        tabs={[
          { key: 'items', label: t('tabItems') },
          { key: 'categories', label: t('tabCategories') },
          { key: 'modifiers', label: t('tabModifiers') },
          { key: 'raw', label: say(PREP_COPY.tabRaw, lang) },
          { key: 'prep', label: say(PREP_COPY.tabPrep, lang) },
          { key: 'import', label: t('tabImport') },
        ]}
        panels={{
          items: (
            <MenuItems
              rows={searchable}
              categories={categoryChips}
              money={amounts}
              labels={itemLabels}
              lang={lang}
              photoFilter={photoFilter}
            />
          ),
          modifiers: (
            <>
              <p className="text-fg-muted mb-3 text-sm leading-normal">{t('modifiersSub')}</p>

              {/*
                The design's three groups are the design's data, and they are
                drawn only when the rest of this screen is drawing the design's
                data too. A live restaurant used to read "Ulush · 24 ta taomda"
                over dishes it never priced that way. There is no console read
                for modifier groups yet — `GET /api/v1/menu/modifier-groups`
                does not exist; the groups reach the till and the QR menu
                through `GET /v1/public/menu` — so the honest answer here is to
                say so rather than to borrow somebody else's sheet.
              */}
              {modifierRows.length === 0 ? (
                <EmptyState>{t('modifiersEmpty')}</EmptyState>
              ) : (
                <div className="flex flex-col gap-3">
                  {modifierRows.map((group) => (
                    <section key={group.id} className="bg-surface rounded-lg border p-5">
                      <div className="flex flex-wrap items-baseline justify-between gap-3">
                        <h3 className="text-md font-semibold">{group.name}</h3>

                        <span className="flex items-center gap-2.5">
                          {/* A sheet somebody switched off keeps its dishes and
                              stops being asked. Saying so is the point of
                              listing it at all. */}
                          {group.active === false ? (
                            <Pill tone="neutral">{t('modifierOff')}</Pill>
                          ) : null}
                          {/*
                           * The two numbers are the rule. `min 1` blocks the line
                           * until somebody answers; `min 0` is an extra. Stating
                           * them as a sentence rather than as "1/1" is what stops
                           * a manager guessing which is which.
                           */}
                          <Pill tone={group.min > 0 ? 'brand' : 'neutral'}>
                            {group.min > 0
                              ? t('ruleRequired', { max: group.max })
                              : t('ruleOptional', { max: group.max })}
                          </Pill>
                          <span data-num className="text-fg-subtle text-xs">
                            {t('usedBy', { n: group.usedBy })}
                          </span>
                        </span>
                      </div>

                      <ul className="border-divider mt-3.5 grid gap-x-6 gap-y-1.5 border-t pt-3 text-sm sm:grid-cols-2">
                        {group.options.map((option) => (
                          <li key={option.id} className="flex justify-between gap-3">
                            <span>{option.name}</span>
                            <span data-num className="text-fg-muted">
                              {option.price === 0 ? '—' : `+ ${formatTiyinAmount(option.price)}`}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </section>
                  ))}
                </div>
              )}
            </>
          ),
          categories: (
            <TableCard
              columns={CAT_COLUMNS}
              head={[
                { label: t('colPosition'), align: 'right' },
                t('colCategory'),
                { label: t('colItems'), align: 'right' },
                t('colState'),
              ]}
              empty={{ title: blank('menu'), body: blank('menuSub') }}
            >
              {(categoryRows ?? CATEGORIES).map((row) => (
                <Row key={row.id} columns={CAT_COLUMNS} className="py-3">
                  <span data-num className="text-fg-subtle text-right text-sm">
                    {row.position}
                  </span>
                  <span className="truncate text-sm font-semibold">{row.name}</span>
                  <span data-num className="text-fg-muted text-right text-sm">
                    {row.items}
                  </span>
                  <span>
                    {/* Hidden keeps its dishes and leaves the guest surfaces —
                        which is not the same as deleting it, and the word says
                        so. */}
                    <Pill tone={row.visible ? 'success' : 'neutral'}>
                      {row.visible ? t('catVisible') : t('catHidden')}
                    </Pill>
                  </span>
                </Row>
              ))}
            </TableCard>
          ),
          raw: <RawGoodsPanel lang={lang} />,
          prep: <PrepPanel lang={lang} cards={prepCards} shelf={shelf} />,
          import: (
            <div className="bg-surface rounded-lg border p-6">
              <h3 className="text-md font-semibold">{t('importTitle')}</h3>
              <p className="text-fg-muted mt-1.5 text-sm leading-normal">{t('importSub')}</p>

              <h4 className="text-2xs tracking-caps text-fg-subtle mt-5 mb-2 font-semibold uppercase">
                {t('importColumns')}
              </h4>

              <ul className="flex flex-wrap gap-2">
                {IMPORT_COLUMNS.map((column) => (
                  <li key={column.key}>
                    <Pill tone={column.required ? 'brand' : 'neutral'}>
                      {t(`col_${column.key}`)}
                      {column.required ? ' *' : ''}
                    </Pill>
                  </li>
                ))}
              </ul>

              <p className="text-fg-subtle mt-3 text-xs leading-normal">{t('importRequired')}</p>

              {/*
                The design's three steps, against `POST /api/v1/menu/import`:
                choose a file and get a rehearsal, map the columns the server
                did not recognise, then write. Nothing is written until the
                third press — see ./menu-import.tsx.
              */}
              <MenuImport labels={importLabels} lang={lang} />

              {/*
                And the other way a menu arrives: written for the restaurant
                rather than uploaded by it. The button used to be an
                `ActionButton` — it flashed "template downloaded" and downloaded
                nothing — because the template it named is the setup wizard's
                68-dish catalogue, which is a seed rather than a spreadsheet.
                `POST /api/v1/menu/seed-template` is that seed, and it is
                idempotent by SKIPPING: a second press does not restore a price
                somebody has just corrected.
              */}
              <StarterTemplate
                lang={lang}
                labels={{
                  action: t('templateAction'),
                  hint: t('templateHint'),
                  working: t('templateWorking'),
                  done: t.raw('templateDone') as string,
                  nothing: t('templateNothing'),
                  failed: t('templateFailed'),
                }}
              />
            </div>
          ),
        }}
      />
    </>
  );
}
