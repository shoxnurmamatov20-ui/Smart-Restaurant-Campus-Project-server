import { useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { copy, DISH, MENU, SHARED } from '@restaurant/surfaces/customer/copy';
import { DEFAULT_PORTION, say, type Dish } from '@restaurant/surfaces/customer/data';
import { dishesOf, searchDishes } from '@restaurant/surfaces/customer/live';

import { DishSheet } from '@/customer/dish-sheet';
import { useCustomerMenu } from '@/customer/live';
import { DishPhoto } from '@/ui/dish-photo';
import { Photo, Search } from '@/ui/icons';
import { Notice, useNotice } from '@/ui/notice';
import { Button, Chip, Empty, PRESSED } from '@/ui/primitives';
import { cart, useCatalogue } from '@/lib/cart';
import { useLocale } from '@/lib/locale';
import { som } from '@/lib/money';
import { useTheme } from '@/lib/theme-context';
import { size } from '@/theme';
import { display, sansAt, text } from '@/type';

/**
 * The menu — `Smart Restaurant Mijoz ilovasi.dc.html`, screen 3 (`at.menu`, :244-296).
 *
 * The reference screen for this app, and the shape the others follow:
 *
 *   1. Data and words come from `@restaurant/surfaces`, never from a local
 *      fixture. A price written twice is a price that will differ. The dishes
 *      themselves now come from `GET /api/v1/public/menu` through the same
 *      mapping the browser build uses (`customer/live`), and the fixtures are
 *      what the screen falls back to — labelled, so nobody orders from them.
 *   2. The list is a `FlatList`, not a mapped `ScrollView`. Ninety dishes in a
 *      `ScrollView` mount ninety rows before the first paint.
 *   3. Nothing is ported from the web component. The web version imitates a
 *      phone in a 390px column; this *is* the phone, so the row is a row and
 *      the sheet will be a sheet.
 *   4. Every colour comes from `useTheme()`, so the screen answers the system
 *      appearance without a second palette existing anywhere.
 *
 * ---------------------------------------------------------------------------
 * What this screen was, against what the design draws
 *
 * It was a page of cards. The design draws a **catalogue**: a header that stays
 * put while the dishes move under it, and rows separated by a 1px rule with no
 * fill, no radius and no gap between them (`:277`). Cards on a menu read as
 * eight separate offers; rules read as one list you scan. Four whole elements
 * were missing on top of that, and each one is something a guest reaches for:
 *
 *   - the dish count beside the heading (`:249`) — the answer to "did my search
 *     find anything" before you have finished reading the list;
 *   - the magnifier and the clear × inside the field (`:253`, `:256`);
 *   - the 74pt picture band that opens every row (`:278`);
 *   - the 34pt brand "+" (`:290`), which is the whole point of a dish list —
 *     one tap adds, and the sheet is for the guest who wants to choose a size.
 *
 * The two copy defects were worse than the geometry. The search field prompted
 * with `clearSearch` — "Qidiruvni tozalash", the label of the button that
 * *empties* it — and a sold-out dish was marked `86`, which is kitchen jargon
 * no guest has ever seen. The design says `t.search` and `t.soldOut` (`:254`,
 * `:283`), and both strings were already in the catalogue.
 */
export default function MenuScreen() {
  const c = useTheme();
  const { lang } = useLocale();
  const t = copy(MENU, lang);
  const shared = copy(SHARED, lang);
  const { note, say: announce } = useNotice();

  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<string | null>(null);
  const [open, setOpen] = useState<Dish | null>(null);

  // The catalogue, re-asked every minute — which is how a dish the kitchen
  // 86'd goes grey here without a socket a stranger may not open.
  const { state, retry } = useCustomerMenu(lang);
  const menu = state.status === 'loading' ? null : state.menu;

  /*
   * The basket is priced against whatever this screen is showing.
   *
   * Without this the cart would keep resolving lines through the fixtures while
   * the guest adds dishes from a live menu — two catalogues, one basket, and a
   * checkout the server refuses in full. See `lib/cart.ts`.
   */
  useCatalogue(menu, null);

  /*
   * There is no "all" chip, and the first category is on by default.
   *
   * `menuTabs` is `this.CATS.map(...)` — the six categories and nothing else
   * (`:992`) — and the chip that lights up is `S.cat === null ? 0 : S.cat`, so
   * a guest who has chosen nothing is looking at the first heading. This screen
   * prepended a seventh chip of its own labelled "Menyu" and started on it,
   * which put the whole menu under a filter the design never drew.
   *
   * `category` stays nullable because the categories arrive with the menu:
   * null means "not chosen", and resolves to the first one once there is one.
   */
  const active = category ?? menu?.categories[0]?.id ?? null;

  const dishes = useMemo(() => {
    if (menu === null) return [];

    /*
     * A query searches the whole menu; the category only filters when there is
     * none (`:875-880` — `if (qq)` returns before `S.cat` is ever read). That
     * ordering is not decoration: with the "all" chip gone, searching inside
     * the selected category would hide every hit a guest typed the name of
     * because they were standing on the wrong heading.
     */
    // The heading counts too — `Mijoz ilovasi:877` searches the category's three
    // names alongside the dish's, so "Ichimliklar" returns the whole drinks
    // list where the name search returned nothing.
    if (query.trim() !== '') return searchDishes(menu.dishes, query, menu.categories);

    // Both filters are the surfaces package's, so this screen and the browser
    // apply the same rules to the same payload.
    return dishesOf(menu.dishes, active);
  }, [menu, query, active]);

  return (
    <View style={s.fill}>
      {/*
       * `position:sticky;top:0` over `--bg`, under a `1px solid var(--divider)`
       * rule, `padding:6px 0 10px` (:246).
       *
       * Heading, field and chip rail scrolled away with the dishes before, so
       * on row twelve there was no way to search or change category without
       * flicking back to the top. Sticky is a plain sibling of the list here —
       * the same result, and one fewer thing for the list to re-measure.
       *
       * The rule runs edge to edge, so the header pulls back out of the tab
       * layout's 20pt gutter (`_layout.tsx`) and re-applies it row by row,
       * exactly as the design's own `padding:0 20px …` children do.
       */}
      <View style={[s.header, { backgroundColor: c.bg, borderBottomColor: c.divider }]}>
        {/* `align-items:baseline;justify-content:space-between;padding:0 20px 10px` — :247. */}
        <View style={s.headRow}>
          {/* Inter Tight `--text-2xl` (24px) at 700, `--tracking-tight` — :248.
              It was `text.title`, 20px: a section heading where the design
              draws a screen title, and the design draws both. */}
          <Text style={[text.screenTitle, { color: c.fg }]}>{t.heading}</Text>
          {/* `data-num` at `--text-xs` on `--fg-subtle` — :249. Absent entirely,
              so `MENU.countOne` and `MENU.countFound` were catalogue entries no
              screen said out loud. Held back until the menu answers: "0 ta
              taom" while it is still loading is a claim, not a count. */}
          {menu === null ? null : (
            <Text style={[s.count, text.num, { color: c.fgSubtle }]}>
              {`${dishes.length} ${query.trim() === '' ? t.countOne : t.countFound}`}
            </Text>
          )}
        </View>

        {/* `padding:0 20px 10px` — :251. */}
        <View style={s.searchWrap}>
          {/* `height:42px;padding:0 14px;gap:10px;border:1px solid var(--border)`
              on `--surface` at `--radius-md` — :252. It was a 44pt box with 12
              of padding and a 15px input, and nothing in it but the text. */}
          <View style={[s.search, { backgroundColor: c.surface, borderColor: c.border }]}>
            <Search size={17} />
            <TextInput
              value={query}
              onChangeText={setQuery}
              /* :254. The placeholder was `clearSearch` — "Qidiruvni tozalash",
                 the *button* that empties the field — so an empty search box
                 told the guest to clear it. */
              placeholder={shared.search}
              placeholderTextColor={c.fgSubtle}
              accessibilityLabel={shared.search}
              returnKeyType="search"
              style={[s.searchField, s.searchLine, { color: c.fg }]}
            />
            {/* `width:24px;height:24px;border-radius:50%;background:var(--bg-muted)`
                — :256, drawn only while there is something to clear. */}
            {query === '' ? null : (
              <Pressable
                onPress={() => setQuery('')}
                accessibilityRole="button"
                accessibilityLabel={t.clearSearch}
                style={({ pressed }) => [
                  s.clear,
                  { backgroundColor: c.bgMuted },
                  pressed && PRESSED,
                ]}
              >
                <Text style={[s.clearLine, { color: c.fgMuted }]}>×</Text>
              </Pressable>
            )}
          </View>
        </View>

        {/* `gap:7px;overflow-x:auto;padding:0 20px 2px` — :260. `Chip` is the
            design's own `[data-chip]` box (32pt, 13 of padding, 12px/600) and
            its `[data-on]` brand fill; this rail hand-rolled a 34pt chip with
            14 of padding in 12px/400 and drifted from every other chip in the
            app. */}
        <FlatList
          horizontal
          showsHorizontalScrollIndicator={false}
          data={menu?.categories ?? []}
          keyExtractor={(item) => item.id}
          contentContainerStyle={s.chips}
          style={s.chipRail}
          renderItem={({ item }) => (
            <Chip on={item.id === active} onPress={() => setCategory(item.id)}>
              {say(item.name, lang)}
            </Chip>
          )}
        />
      </View>

      <FlatList
        data={dishes}
        keyExtractor={(dish) => dish.id}
        /* `padding:4px 20px 0` on the list (:275) inside `padding:0 0 26px`
           (:245); the 20 is the tab layout's gutter. The rows carry their own
           rule, so there is no gap between them — a 12pt list gap plus a card
           radius is what made this read as eight offers rather than one menu. */
        contentContainerStyle={s.list}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={
          menu === null || menu.live ? null : (
            /*
             * A customer ordering from a fixture is a customer quoted a price
             * this restaurant never set. The banner is pressable because the
             * usual cause is a minute of no signal, and pressing is a cheaper
             * fix than closing the app.
             *
             * Not in the design — the prototype cannot lose its connection —
             * so it is drawn in the shape the home screen uses for the same
             * sentence, at the same 12px meta line.
             */
            <Pressable
              onPress={retry}
              accessibilityRole="button"
              style={[s.demo, { backgroundColor: c.warning50, borderColor: c.warning500 }]}
            >
              <Text style={[s.meta, { color: c.warning700 }]}>{t.demoMenu}</Text>
            </Pressable>
          )
        }
        ListEmptyComponent={
          state.status === 'loading' ? null : (
            <View>
              <Empty
                title={query.trim() === '' ? t.emptyHeading : t.noHitsHeading}
                body={query.trim() === '' ? t.emptyBody : t.noHitsBody}
              />
              {/*
               * `height:40px;padding:0 18px;margin-top:16px;radius md;
               * --brand-500;#fff;13px/600` — :271.
               *
               * The no-hits block ended at its two sentences, which left the
               * guest to find the × themselves; the design ends it with the way
               * out. Only under a search: the other empty state is a branch
               * that is not taking orders, and clearing a query nobody typed
               * would change nothing.
               */}
              {query.trim() === '' ? null : (
                <Button
                  kind="primary"
                  height={40}
                  onPress={() => setQuery('')}
                  style={s.clearQ}
                  textStyle={s.clearQLine}
                >
                  {t.clearSearch}
                </Button>
              )}
            </View>
          )
        }
        renderItem={({ item }) => (
          <DishRow
            dish={item}
            lang={lang}
            onOpen={() => setOpen(item)}
            onAdd={() => {
              /*
               * `m.add` — :290, and `:889` for what it says.
               *
               * The default portion is the one with a zero delta, so a one-tap
               * add is the dish at the price the row is showing. A guest who
               * wants a size or an extra opens the sheet; a guest who wants the
               * lavash on the picture taps once, which is what a dish list is
               * for. The web build adds from its rows the same way
               * (`menu-board.tsx`).
               */
              cart.add({
                dishId: item.id,
                portionId: DEFAULT_PORTION,
                modifierIds: [],
                quantity: 1,
                note: '',
              });
              announce(`${say(item.name, lang)} · ${t.addedToCart}`);
            }}
          />
        )}
      />

      {/* The row opens the sheet, which is where a dish is configured and added.
          Until now the rows carried `accessibilityRole="button"` and no handler:
          a menu a guest could read and not order from. */}
      <DishSheet
        dish={open}
        onClose={() => setOpen(null)}
        onAdd={(line) => {
          const name = open === null ? '' : say(open.name, lang);

          cart.add(line);
          setOpen(null);
          announce(`${name} · ${copy(DISH, lang).added}`);
        }}
      />

      <Notice note={note} />
    </View>
  );
}

/**
 * One dish — `:277-293`.
 *
 * A divider row, not a card: `gap:13px;padding:14px 0;border-bottom:1px solid
 * var(--divider)`, at `opacity:.5` when the kitchen has pulled it.
 *
 * The design hangs `m.open` on the picture button alone and leaves the name
 * inert; this keeps the whole row pressable, which is what it already did and
 * what a thumb expects on a phone. `[data-row]:hover{background:var(--bg-subtle)}`
 * (:65) is the row's own feedback in the design and a press is the touch
 * equivalent of a hover, so that is what it tints to — not the `opacity:.72`
 * fade it used to do, which reads as "disabled for a moment".
 */
function DishRow({
  dish,
  lang,
  onOpen,
  onAdd,
}: {
  dish: Dish;
  lang: 'uz' | 'ru' | 'en';
  onOpen: () => void;
  onAdd: () => void;
}) {
  const c = useTheme();
  const shared = copy(SHARED, lang);

  return (
    <Pressable
      onPress={onOpen}
      accessibilityRole="button"
      disabled={dish.soldOut}
      style={({ pressed }) => [
        s.row,
        { borderBottomColor: c.divider },
        pressed && { backgroundColor: c.bgSubtle },
        dish.soldOut && s.soldOut,
      ]}
    >
      {/*
       * `width:74px;height:74px;border:1px solid var(--border);radius md;
       * background:var(--bg-muted)`, holding the 21px picture mark — :278.
       *
       * A dish with a photograph draws it inside this square, clipped to the
       * border's inner corner; one without draws exactly what the design's own
       * image slot draws in that state: the band at its full height with the
       * mark in it. A row of text with no band is a different layout; a grey
       * rectangle is a stuck loading state; an invented picture is a lie about
       * a dish.
       */}
      <View style={[s.thumb, { backgroundColor: c.bgMuted, borderColor: c.border }]}>
        <DishPhoto
          image={dish.image ?? null}
          width={74}
          radius={size.radiusMd - 1}
          fill
          fallback={<Photo size={21} />}
        />
      </View>

      <View style={s.rowMain}>
        {/* `align-items:baseline;gap:8px` — :280. */}
        <View style={s.nameRow}>
          {/* `--text-md` (15px) at 600, ellipsised on one line — :281. */}
          <Text style={[s.name, { color: c.fg }]} numberOfLines={1}>
            {say(dish.name, lang)}
          </Text>
          {/*
           * `--text-3xs` (10px) at 700, `padding:3px 7px`, pill, `--danger-50`
           * under `--danger-700` — :283, and it says `t.soldOut`.
           *
           * It said `86`. That is what the pass calls a dish it has run out of,
           * and it is the one word on this screen a guest cannot be expected to
           * know. Drawn here rather than through `Pill` because `Pill` is the
           * app's 11px badge and this one is the design's 10/700 at 3×7 —
           * `ui/primitives.tsx` belongs to another hand this session.
           */}
          {dish.soldOut ? (
            <View style={[s.soldOutPill, { backgroundColor: c.danger50 }]}>
              <Text style={[s.soldOutLine, { color: c.danger700 }]}>{shared.soldOut}</Text>
            </View>
          ) : null}
        </View>

        {/* `--text-xs` on `--fg-muted`, `line-height:1.45;margin-top:3px`, two
            lines — :286. */}
        <Text style={[s.desc, { color: c.fgMuted }]} numberOfLines={2}>
          {say(dish.description, lang)}
        </Text>

        {/* `justify-content:space-between;gap:10px;margin-top:8px` — :287. */}
        <View style={s.rowFoot}>
          {/* Inter Tight `--text-md` at **700** with tabular figures — :288.
              It was Inter at 600: the sans face where the design sets the
              display one, which is the difference a price is read in. */}
          <Text style={[s.price, text.num, { color: c.fg }]}>{som(dish.price, lang)}</Text>

          {/*
           * `width:34px;height:34px;border:0;radius md;--brand-500;#fff;19px/600`
           * — :290, drawn only while the dish is on (`sc-if m.on`).
           *
           * The same box as `Stepper`, written out because a stepper takes no
           * accessibility label: eight of them down a list read as "plus, plus,
           * plus" to a screen reader, where each one is a different dish.
           */}
          {dish.soldOut ? null : (
            <Pressable
              onPress={onAdd}
              accessibilityRole="button"
              accessibilityLabel={`${say(dish.name, lang)} · ${copy(DISH, lang).addToCart}`}
              hitSlop={6}
              style={({ pressed }) => [s.add, { backgroundColor: c.brand500 }, pressed && PRESSED]}
            >
              <Text style={[text.stepper, { color: c.n0 }]}>+</Text>
            </Pressable>
          )}
        </View>
      </View>
    </Pressable>
  );
}

const s = StyleSheet.create({
  fill: { flex: 1 },
  /* `background:var(--bg);border-bottom:1px solid var(--divider);padding:6px 0 10px`
     — :246. The negative gutter is the tab layout's `paddingHorizontal: sp5`
     pulled back out so the rule reaches both edges, as the design draws it. */
  header: {
    marginHorizontal: -size.sp5,
    paddingTop: 6,
    paddingBottom: 10,
    borderBottomWidth: 1,
  },
  /* `padding:0 20px 10px` — :247. */
  headRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: 10,
    paddingHorizontal: size.sp5,
    paddingBottom: 10,
  },
  /* `--text-xs` — :249. */
  count: { ...sansAt(400, 12, 1.45) },
  /* `padding:0 20px 10px` — :251. */
  searchWrap: { paddingHorizontal: size.sp5, paddingBottom: 10 },
  /* `height:42px;padding:0 14px;gap:10px;border:1px solid var(--border)` — :252.
     1px, never `hairlineWidth`: at @3x that outline is a third of its weight and
     the field reads as a fill. */
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    height: 42,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderRadius: size.radiusMd,
  },
  searchField: { flex: 1, minWidth: 0, padding: 0 },
  /* `font-size:var(--text-sm)` (13px) — :254. It was `text.body`, 15. */
  searchLine: { ...sansAt(400, 13, 1.5) },
  /* `width:24px;height:24px;border-radius:50%` — :256. */
  clear: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  clearLine: { fontSize: 14, lineHeight: 14 },
  /* `gap:7px;padding:0 20px 2px` — :260. It was gap 8 with 2 above and below. */
  chipRail: { flexGrow: 0 },
  chips: { gap: 7, paddingHorizontal: size.sp5, paddingBottom: 2 },
  /* `padding:4px 20px 0` (:275) with the outer `padding-bottom:26px` (:245). */
  list: { paddingTop: 4, paddingBottom: 26 },
  demo: {
    marginTop: 12,
    marginBottom: 4,
    padding: 12,
    borderWidth: 1,
    borderRadius: size.radiusMd,
  },
  meta: { ...sansAt(400, 12, 1.45) },
  /* `height:40px;padding:0 18px;margin-top:16px` — :271, inline-centred under
     the two sentences rather than stretched across the screen. */
  clearQ: { alignSelf: 'center', paddingHorizontal: 18, marginTop: 16 },
  /* `font-size:var(--text-sm);font-weight:600` — :271. The house CTA is 15. */
  clearQLine: { ...sansAt(600, 13, 1.2) },
  /* `gap:13px;padding:14px 0;border-bottom:1px solid var(--divider)` — :277.
     No fill, no radius, no minimum height: the rule is what separates dishes. */
  row: {
    flexDirection: 'row',
    gap: 13,
    paddingVertical: 14,
    borderBottomWidth: 1,
  },
  /* `width:74px;height:74px;border:1px solid var(--border)` — :278. */
  thumb: {
    width: 74,
    height: 74,
    borderWidth: 1,
    borderRadius: size.radiusMd,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowMain: { flex: 1, minWidth: 0 },
  /* `align-items:baseline;gap:8px` — :280. */
  nameRow: { flexDirection: 'row', alignItems: 'baseline', gap: 8 },
  /* `--text-md` at 600 — :281. */
  name: { ...sansAt(600, 15, 1.35), flexShrink: 1 },
  /* `padding:3px 7px` at `--radius-pill` — :283. */
  soldOutPill: { paddingHorizontal: 7, paddingVertical: 3, borderRadius: size.radiusPill },
  /* `--text-3xs` (10px) at 700 — :283. */
  soldOutLine: { ...sansAt(700, 10, 1.2) },
  /* `--text-xs;line-height:1.45;margin-top:3px` — :286. */
  desc: { ...sansAt(400, 12, 1.45), marginTop: 3 },
  /* `justify-content:space-between;gap:10px;margin-top:8px` — :287. */
  rowFoot: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    marginTop: 8,
  },
  /* Inter Tight `--text-md` at 700, no tracking of its own — :288. */
  price: { ...display(700), fontSize: 15, lineHeight: 18 },
  /* `width:34px;height:34px;border:0;border-radius:var(--radius-md)` — :290. */
  add: {
    width: 34,
    height: 34,
    borderRadius: size.radiusMd,
    alignItems: 'center',
    justifyContent: 'center',
  },
  /* `opacity:{{m.op}}` — :277, `.5` for a dish the kitchen has pulled. */
  soldOut: { opacity: 0.5 },
});
