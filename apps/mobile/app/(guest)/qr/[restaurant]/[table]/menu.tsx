import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { allergenLabels, fill } from '@restaurant/surfaces/guest/copy';
import {
  allDishes,
  searchDishes,
  weightLabel,
  type GuestDish,
} from '@restaurant/surfaces/guest/menu-data';

import { addLine, basketCount, basketSubtotal, countOf, useBasket } from '@/guest/basket';
import { useGuestCopy } from '@/guest/copy';
import { DishSheet } from '@/guest/dish-sheet';
import { useFlash } from '@/guest/flash';
import { Alert, ChevronLeft, Picture, Search } from '@/guest/icons';
import { useGuestMenu } from '@/guest/menu';
import { param, tableHref, useGuestBack } from '@/guest/route';
import { useLocale, type Lang } from '@/lib/locale';
import { som } from '@/lib/money';
import { useTheme } from '@/lib/theme-context';
import { raw, size } from '@/theme';
import { displayAt, sansAt, text } from '@/type';
import { DishPhoto } from '@/ui/dish-photo';
import { Button, Empty, PRESSED } from '@/ui/primitives';

/**
 * The menu a guest reads at the table — `Mehmon.dc.html`, panel 02.
 *
 * Everything on it comes from `GET /api/v1/public/menu`. There is no fixture
 * fallback here and that is the native/web difference stated once: the browser
 * build can render a sample menu and mark it `live: false`, because a
 * server-rendered page mid-restart is better shown stale than blank. A phone
 * has no such story — a guest is holding it, and "we could not reach the
 * restaurant, press again" is the honest answer, so the failure state is a
 * sentence and a button rather than a menu nobody can order from.
 *
 * The search **replaces** the category filter rather than intersecting with it.
 * Two narrowing filters applied together produce the screen where a guest types
 * "osh", sees nothing, and cannot tell that a chip they tapped three taps ago is
 * the reason. Typing is the stronger intent.
 *
 * Every measurement below is the drawing's own — `dc.html:149-244`. The press
 * everywhere is `PRESSED`, because `[data-tap]:active{transform:scale(.97)}`
 * (`dc.html:36`) is the design's one press: the screen used to fade controls to
 * 0.72 opacity instead, which is a different gesture from the one drawn.
 */
export default function GuestMenuScreen() {
  const c = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const flash = useFlash();
  const { lang } = useLocale();
  const { t } = useGuestCopy();

  const params = useLocalSearchParams<{ restaurant: string; table: string }>();
  const restaurant = param(params.restaurant);
  const table = param(params.table);
  const here = tableHref({ restaurant, table });
  const back = useGuestBack(here);

  /* The basket belongs to the table, not to the phone: two people at table 14
     with two phones are ordering one order. */
  const basketId = `${restaurant}:${table}`;
  const basket = useBasket(basketId);

  const { state, retry } = useGuestMenu(restaurant, lang);

  const [query, setQuery] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [open, setOpen] = useState<GuestDish | null>(null);

  const menu = state.status === 'ready' ? state.menu : null;
  const everything = useMemo(() => (menu === null ? [] : allDishes(menu)), [menu]);
  const searching = query.trim() !== '';

  const shown = useMemo(() => {
    if (searching) return searchDishes(everything, query);
    if (categoryId === null) return everything;

    return everything.filter((dish) => dish.categoryId === categoryId);
  }, [searching, query, categoryId, everything]);

  const inBasket = basketCount(basket);

  const add = (dish: GuestDish) => {
    /*
     * A dish the kitchen has to ask about cannot be added from the row.
     *
     * `GET /public/menu` publishes `min_choices`, and a pizza that must be
     * given a size is not orderable without one — the `+` would queue a line
     * the pass cannot cook and the guest would find out when it arrived wrong.
     * The sheet is where the question lives, so the tap opens it.
     */
    if ((dish.groups ?? []).some((group) => group.min > 0)) {
      setOpen(dish);

      return;
    }

    addLine(basketId, {
      dishId: dish.id,
      name: dish.name,
      unitPrice: dish.price,
      quantity: 1,
      options: [],
      choiceIds: [],
      note: '',
    });

    /* The design flashes on every add — `dc.html:821`. The row's `+` gives no
       other feedback: the basket bar is pinned to the bottom of a scrolled
       list, so a tap two thirds up the menu looked like nothing happened and
       got pressed twice. */
    flash(fill(t.menu.added, { name: dish.name }));
  };

  return (
    <View style={[s.fill, { backgroundColor: c.bg, paddingTop: insets.top + 14 }]}>
      <View style={s.head}>
        <View style={s.headRow}>
          <View style={s.grow}>
            <Text style={[s.title, { color: c.fg }]}>{t.menu.title}</Text>
            <Text style={[text.caption, text.num, { color: c.fgSubtle, marginTop: 1 }]}>
              {searching
                ? fill(t.menu.countFor, { count: shown.length, query: query.trim() })
                : fill(t.menu.count, { count: shown.length })}
            </Text>
          </View>

          {/* The drawing's head is title · count · language · search and no back
              control (`dc.html:150-162`) — a browser has one. A phone with
              `headerShown:false` does not, so the chevron stays; what it does
              not do is carry a bordered 34pt box of its own, which made the way
              out look like a second filter beside the search toggle. */}
          <Pressable
            onPress={back}
            accessibilityRole="button"
            accessibilityLabel={t.dish.back}
            hitSlop={5}
            style={({ pressed }) => [s.iconGhost, pressed && PRESSED]}
          >
            <ChevronLeft colour={c.fgSubtle} />
          </Pressable>

          {/* `dc.html:157` — the reader's language, stated where they can see it
              before they wonder why the menu is in it. */}
          <Text style={[s.lang, { color: c.fgMuted }]}>{lang.toUpperCase()}</Text>

          <Pressable
            onPress={() => {
              // Closing the field clears what was typed, as the design does:
              // a hidden filter still narrowing the list is a menu with dishes
              // missing for no visible reason.
              setSearchOpen((was) => !was);
              if (searchOpen) setQuery('');
            }}
            accessibilityRole="button"
            accessibilityLabel={t.menu.search}
            accessibilityState={{ selected: searchOpen }}
            /* 34×34 at radius 11 — `dc.html:158`. The 44pt target is a hit slop
               rather than a bigger box: drawn at 44 the toggle outweighed the
               title beside it. */
            hitSlop={5}
            style={({ pressed }) => [
              s.iconButton,
              {
                backgroundColor: searchOpen ? c.n900 : c.surface,
                borderColor: searchOpen ? c.n900 : c.border,
              },
              pressed && PRESSED,
            ]}
          >
            <Search colour={searchOpen ? c.n0 : c.fg} />
          </Pressable>
        </View>

        {searchOpen ? (
          <View style={[s.search, { backgroundColor: c.bgSubtle, borderColor: c.border }]}>
            <Search size={16} colour={c.fgSubtle} />
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder={t.menu.searchPlaceholder}
              placeholderTextColor={c.fgSubtle}
              autoFocus
              returnKeyType="search"
              style={[s.searchField, { color: c.fg }]}
            />
            {searching ? (
              /* A filled 22pt circle, not a bare glyph — `dc.html:168`. The
                 background is the design's `--n-200`, which is `borderStrong`
                 here: the raw ramp does not invert, so `n200` would put a
                 near-white disc on the dark field. */
              <Pressable
                onPress={() => setQuery('')}
                accessibilityRole="button"
                accessibilityLabel={t.menu.clear}
                hitSlop={11}
                style={({ pressed }) => [
                  s.clear,
                  { backgroundColor: c.borderStrong },
                  pressed && PRESSED,
                ]}
              >
                <Text style={[s.clearGlyph, { color: c.fgMuted }]}>×</Text>
              </Pressable>
            ) : null}
          </View>
        ) : null}

        {menu === null ? null : (
          <FlatList
            horizontal
            showsHorizontalScrollIndicator={false}
            style={s.rail}
            contentContainerStyle={s.railInner}
            /* While a search is running the chips are inert rather than gone:
               a rail that disappears under the thumb makes the list jump. They
               keep their colour while they wait — `dc.html:172-176` dims
               nothing, and a rail at 0.4 read as a broken control. */
            scrollEnabled={!searching}
            data={[{ id: null as string | null, name: t.menu.all }, ...menu.categories]}
            keyExtractor={(item) => item.id ?? 'all'}
            renderItem={({ item }) => {
              const on = !searching && item.id === categoryId;

              return (
                <Pressable
                  onPress={() => setCategoryId(item.id)}
                  disabled={searching}
                  accessibilityRole="button"
                  accessibilityState={{ selected: on }}
                  style={({ pressed }) => [
                    s.chip,
                    {
                      backgroundColor: on ? c.n900 : c.surface,
                      borderColor: on ? c.n900 : c.border,
                    },
                    pressed && PRESSED,
                  ]}
                >
                  <Text style={[s.chipLabel, { color: on ? c.n0 : c.fg }]}>{item.name}</Text>
                </Pressable>
              );
            }}
          />
        )}
      </View>

      {state.status === 'loading' ? (
        <View style={s.centre}>
          <ActivityIndicator color={c.brand500} />
        </View>
      ) : state.status === 'failed' ? (
        <View style={s.centre}>
          <Empty title={t.menu.empty} body={t.common.offline} />
          {state.retryable ? (
            <Button kind="secondary" onPress={retry} style={s.centreButton}>
              {t.common.retry}
            </Button>
          ) : null}
        </View>
      ) : (
        <FlatList
          style={s.fill}
          data={shown}
          keyExtractor={(dish) => dish.id}
          showsVerticalScrollIndicator={false}
          /* `padding:4px 20px 20px` — `dc.html:179`. The bar below is part of
             the column now, so the list no longer holds a gap for it; the safe
             area belongs to whichever of the two ends the screen. */
          contentContainerStyle={[
            s.list,
            { paddingBottom: (inBasket > 0 ? 0 : insets.bottom) + 20 },
          ]}
          ListEmptyComponent={
            /* Drawn here rather than through `Empty` — `dc.html:214-218` is a
               tighter block than the shared one (36/12 against 56/24) and it
               ends in a filled brand pill, not a ghost link. */
            <View style={s.empty}>
              <Text style={[s.emptyTitle, { color: c.fg }]}>{t.menu.empty}</Text>
              <Text style={[s.emptySub, { color: c.fgSubtle }]}>{t.menu.emptySub}</Text>
              <Button
                kind="primary"
                height={40}
                onPress={() => {
                  setQuery('');
                  setCategoryId(null);
                }}
                style={s.emptyButton}
                textStyle={s.emptyButtonLabel}
              >
                {t.menu.showAll}
              </Button>
            </View>
          }
          renderItem={({ item }) => (
            <DishRow
              dish={item}
              lang={lang}
              inBasket={countOf(basket, item.id)}
              onOpen={() => setOpen(item)}
              onAdd={() => add(item)}
            />
          )}
        />
      )}

      {inBasket > 0 ? (
        /* A docked footer, in the flow — `dc.html:236`:
           `flex:none;padding:14px 20px 20px;border-top:1px solid var(--border);
           background:var(--n-0)`. It used to be `position:'absolute'` with no
           ground under it, so dish rows slid through the bar on their way past
           and the last price a guest read was half a blue rectangle. */
        <View
          style={[
            s.barDock,
            {
              backgroundColor: c.surface,
              borderColor: c.border,
              paddingBottom: insets.bottom + 20,
            },
          ]}
        >
          <Pressable
            onPress={() => router.push(`${here}/status`)}
            accessibilityRole="button"
            style={({ pressed }) => [s.bar, { backgroundColor: c.brand500 }, pressed && PRESSED]}
          >
            <View style={s.barCount}>
              <Text style={[s.barCountLabel, text.num, { color: c.n0 }]}>{inBasket}</Text>
            </View>
            <Text style={[s.barLabel, s.grow, { color: c.n0 }]}>{t.menu.viewOrder}</Text>
            {/* `cartTotal: this.f(T.items)` — `dc.html:983`: a grouped figure and
                no currency word. Three things share 52pt of blue, and the
                extra word pushed "Buyurtmani ko'rish" onto a second line. */}
            <Text style={[s.barTotal, text.num, { color: c.n0 }]}>
              {som(basketSubtotal(basket), lang, false)}
            </Text>
          </Pressable>
        </View>
      ) : null}

      {open === null ? null : (
        <DishSheet dish={open} basketId={basketId} onClose={() => setOpen(null)} />
      )}
    </View>
  );
}

/**
 * One dish, as the list draws it.
 *
 * The row is two targets, not one: the body opens the sheet — allergens,
 * add-ons, a note — and the `+` adds one straight away. Adding a second tea
 * should not cost two screens, and reading what is in a dish should not be
 * something a guest has to guess is possible.
 *
 * A sold-out dish stays on the menu, struck through and chipped with the line
 * that says when it comes back. Hiding it confuses somebody who remembers
 * yesterday's menu; the design is explicit about this and the copy for it was
 * written first.
 */
function DishRow({
  dish,
  lang,
  inBasket,
  onOpen,
  onAdd,
}: {
  dish: GuestDish;
  lang: Lang;
  inBasket: number;
  onOpen: () => void;
  onAdd: () => void;
}) {
  const c = useTheme();
  const { t } = useGuestCopy();
  const weight = weightLabel(dish);

  return (
    <View style={[s.row, { borderColor: c.divider }, dish.soldOut && s.soldOut]}>
      <Pressable
        onPress={onOpen}
        accessibilityRole="button"
        style={({ pressed }) => [s.rowBody, pressed && PRESSED]}
      >
        <View style={s.rowHead}>
          <Text style={[s.name, { color: c.fg }, dish.soldOut && s.struck]}>{dish.name}</Text>
          {dish.vegetarian ? <Badge tone="veg">{t.menu.veg}</Badge> : null}
          {dish.spicy ? <Badge tone="hot">{t.menu.hot}</Badge> : null}
          {dish.soldOut ? <Badge tone="off">{t.menu.soldOut}</Badge> : null}
        </View>

        {/* The sold-out line is `--fg-muted`, the same as a description
            (`dc.html:228`). In danger red it read as a fault in the app rather
            than as a plate the kitchen has run out of. */}
        <Text style={[text.small, { color: c.fgMuted, marginTop: 3 }]} numberOfLines={2}>
          {dish.soldOut ? t.menu.soldOutNote : dish.description}
        </Text>

        <View style={s.rowPrice}>
          <Text style={[s.price, text.num, { color: c.fg }]}>{som(dish.price, lang)}</Text>
          {weight === null ? null : (
            <Text style={[text.caption, text.num, { color: c.fgSubtle }]}>{weight}</Text>
          )}
        </View>

        {/*
         * The allergen line, on the row — `dc.html:197-202`. `allergens` has
         * always been a list rather than a sentence precisely so it could be
         * drawn twice at two lengths; without the short one, a guest who
         * cannot eat egg had to open every dish to find out which to avoid.
         */}
        {dish.allergens.length === 0 ? null : (
          <View style={s.allergens}>
            <Alert size={12} colour={c.warning600} />
            <Text style={[s.allergenLine, s.grow, { color: c.warning600 }]} numberOfLines={2}>
              {dish.allergens.map((slug) => allergenLabels[slug]?.[lang] ?? slug).join(', ')}
            </Text>
          </View>
        )}
      </Pressable>

      {/* One column on the right, not two things side by side — `dc.html:204-209`:
          `flex-direction:column;align-items:flex-end;gap:8px`, a 78pt square with
          a 78×34 button under it. The button used to be a 44pt square floating
          beside the thumb, vertically centred against a row it does not belong
          to. The slot is drawn even with no photograph: a list where some rows
          have a square and some do not reads as broken rather than as a menu
          that photographs its best-sellers. */}
      <View style={s.side}>
        {/* The square left the text button when it moved into this column, and
            a photograph that stopped opening the dish would be a tap a guest
            has already learnt. It keeps the press and stays out of the reader
            tree — the body button beside it already says the same thing. */}
        <Pressable
          onPress={onOpen}
          accessible={false}
          style={({ pressed }) => [
            s.thumb,
            { backgroundColor: c.bgMuted, borderColor: c.border },
            dish.soldOut && s.thumbOff,
            pressed && PRESSED,
          ]}
        >
          {/* A dish that has run out gets the dashed empty slot of
              `dc.html:230` — no glyph, and no add control under it. A dish
              with a photograph gets it at the thumbnail size, under this
              square's own border and clip; one without keeps the mark. */}
          {dish.soldOut ? null : (
            <DishPhoto image={dish.image} width={78} fill fallback={<Picture colour={c.n400} />} />
          )}
        </Pressable>

        {dish.soldOut ? null : (
          <Pressable
            onPress={onAdd}
            accessibilityRole="button"
            accessibilityLabel={`${t.dish.add} ${dish.name}`}
            style={({ pressed }) => [
              s.add,
              {
                backgroundColor: inBasket > 0 ? c.brand500 : c.surface,
                borderColor: inBasket > 0 ? c.brand500 : c.border,
              },
              pressed && PRESSED,
            ]}
          >
            {/* A plus that looks identical before and after the tap is a plus
                that gets tapped twice — `dc.html:810-813`. */}
            <Text style={[s.addLabel, text.num, { color: inBasket > 0 ? c.n0 : c.fg }]}>
              {inBasket > 0 ? inBasket : '+'}
            </Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

function Badge({ tone, children }: { tone: 'veg' | 'hot' | 'off'; children: string }) {
  const c = useTheme();

  const tint = {
    veg: [c.accent50, c.accent600],
    hot: [c.danger50, c.danger600],
    off: [c.bgMuted, c.fgSubtle],
  }[tone];

  return (
    <View style={[s.badge, { backgroundColor: tint[0] }]}>
      {/* `.03em` on the two flags and none on the sold-out chip — `dc.html:186`
          against `dc.html:226`. */}
      <Text style={[text.badge, tone === 'off' ? null : s.badgeTracked, { color: tint[1] }]}>
        {children}
      </Text>
    </View>
  );
}

const GUTTER = size.sp5;

const s = StyleSheet.create({
  fill: { flex: 1 },
  grow: { flex: 1, minWidth: 0 },
  head: { paddingHorizontal: GUTTER },
  headRow: { flexDirection: 'row', alignItems: 'center', gap: size.sp2 },
  title: displayAt(700, 21, 1.25, raw.trackingTight),
  lang: sansAt(600, 12),
  iconButton: {
    width: 34,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderRadius: 11,
  },
  iconGhost: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center' },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    height: 42,
    paddingHorizontal: 13,
    marginTop: 12,
    borderWidth: 1,
    borderRadius: 12,
  },
  searchField: { flex: 1, minWidth: 0, padding: 0, ...sansAt(400, 14) },
  clear: {
    width: 22,
    height: 22,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: size.radiusPill,
  },
  clearGlyph: sansAt(400, 13, 1),
  rail: { flexGrow: 0, marginTop: 14 },
  railInner: { gap: 7, paddingBottom: size.sp3 },
  chip: {
    height: 34,
    paddingHorizontal: 14,
    justifyContent: 'center',
    borderWidth: 1,
    borderRadius: size.radiusPill,
  },
  chipLabel: sansAt(600, 13),
  centre: { flex: 1, justifyContent: 'center', paddingHorizontal: GUTTER },
  centreButton: { alignSelf: 'center' },
  list: { paddingHorizontal: GUTTER, paddingTop: 4 },
  empty: { paddingVertical: 36, paddingHorizontal: 12, alignItems: 'center' },
  emptyTitle: { ...sansAt(600, 16), textAlign: 'center' },
  emptySub: { ...sansAt(400, 13, 1.55), marginTop: 5, textAlign: 'center' },
  emptyButton: { alignSelf: 'center', marginTop: 16, paddingHorizontal: 18, borderRadius: 11 },
  emptyButtonLabel: sansAt(600, 14),
  row: {
    flexDirection: 'row',
    gap: 13,
    paddingVertical: 14,
    borderBottomWidth: 1,
  },
  soldOut: { opacity: 0.5 },
  struck: { textDecorationLine: 'line-through' },
  rowBody: { flex: 1, minWidth: 0 },
  rowHead: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 7 },
  name: sansAt(600, 16),
  rowPrice: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 7 },
  price: sansAt(600, 14),
  allergens: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6 },
  allergenLine: sansAt(500, 11),
  side: { gap: 8, alignItems: 'flex-end' },
  thumb: {
    width: 78,
    height: 78,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderRadius: 12,
    overflow: 'hidden',
  },
  thumbOff: { borderStyle: 'dashed' },
  badge: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: size.radiusPill },
  badgeTracked: { letterSpacing: 0.3 },
  add: {
    width: 78,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderRadius: 10,
  },
  addLabel: sansAt(600, 13),
  barDock: { paddingTop: 14, paddingHorizontal: GUTTER, borderTopWidth: 1 },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: size.sp3,
    height: 52,
    paddingHorizontal: 18,
    borderRadius: size.radiusLg,
  },
  barCount: {
    width: 26,
    height: 26,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    /* `rgba(255,255,255,.2)` — `dc.html:238`. A lightened wash of the bar it
       sits on, in both themes; `brand600` made it a darker blue box. */
    backgroundColor: 'rgba(255,255,255,0.2)',
  },
  barCountLabel: sansAt(700, 13),
  barLabel: { ...sansAt(600, 16), textAlign: 'left' },
  barTotal: sansAt(600, 16),
});
