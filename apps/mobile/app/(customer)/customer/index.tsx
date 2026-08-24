import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import {
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { copy, DISH, HOME, MENU, SHARED } from '@restaurant/surfaces/customer/copy';
import {
  GUEST,
  LOYALTY,
  POPULAR_IDS,
  say,
  type Dish,
  type Lang,
} from '@restaurant/surfaces/customer/data';

import { DishSheet } from '@/customer/dish-sheet';
import { useCustomerMenu, useCustomerVenues } from '@/customer/live';
import { DishPhoto } from '@/ui/dish-photo';
import { Chevron, Photo, Pin, Search, Star } from '@/ui/icons';
import { Notice, useNotice } from '@/ui/notice';
import { cart, useCart, useCatalogue } from '@/lib/cart';
import { useLocale } from '@/lib/locale';
import { groupDigits, som } from '@/lib/money';
import { useTheme } from '@/lib/theme-context';
import { size } from '@/theme';
import { display, sans, sansAt, text } from '@/type';

/**
 * Home — `Smart Restaurant Mijoz ilovasi.dc.html`, screen 2.
 *
 * A shop, not a dish list. The order the design puts things in is the order a
 * returning guest needs them: where they are collecting from, how the food gets
 * to them, what is on this week, the categories, then what everybody else is
 * ordering. The bare category grid it replaced was a menu; the branch and the
 * mode at the top are what make it a shop, and every price below them depends on
 * both.
 *
 * The branch and the mode are written into the basket rather than kept in local
 * state, because the cart and the payment screen quote a delivery fee from them.
 * A picker whose choice dies with the screen is a screen that quotes one price
 * and charges another.
 *
 * **The branch pill cycles rather than opening a sheet** — the design's own
 * `cycleBranch`. Five branches: a modal for a five-item list is a second screen
 * to dismiss. It becomes a sheet the day a chain has thirty.
 */
export default function HomeScreen() {
  const c = useTheme();
  const { lang } = useLocale();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const basket = useCart();
  const { note, say: announce } = useNotice();

  const t = copy(HOME, lang);
  const s = copy(SHARED, lang);
  const m = copy(MENU, lang);

  const [query, setQuery] = useState('');
  const [open, setOpen] = useState<Dish | null>(null);

  /*
   * The restaurant's own catalogue and its own venues, handed to the basket.
   *
   * Both are asked for here because this is the screen a guest lands on, and
   * because every tile below adds a line to a basket that has to be orderable:
   * a dish tapped out of the fixtures carries an id that is a word, and
   * `POST /api/v1/public/orders` refuses the whole basket for it.
   */
  const { state: menuState, retry } = useCustomerMenu(lang);
  const { state: venueState } = useCustomerVenues(lang);
  const menu = menuState.status === 'loading' ? null : menuState.menu;

  useCatalogue(menu, venueState.status === 'loading' ? null : venueState.venues);

  const delivering = basket.channel === 'delivery';
  const branch = basket.branch;
  const venues = basket.venues.branches;
  const dishes = menu?.dishes ?? [];
  const categories = menu?.categories ?? [];
  const needle = query.trim().toLowerCase();

  /*
   * Search takes over the screen rather than filtering the popular rail.
   *
   * A guest typing "osh" wants every dish called that, not the four most ordered
   * ones that happen to match — and the design's field sits above everything for
   * the same reason.
   */
  const hits = useMemo(() => {
    if (needle === '') return [];

    return dishes.filter(
      (dish) =>
        say(dish.name, lang).toLowerCase().includes(needle) ||
        say(dish.description, lang).toLowerCase().includes(needle),
    );
  }, [needle, lang, dishes]);

  /*
   * The design's four, in the design's order — plov, pepperoni, lavash, double
   * burger — and the first four of the catalogue when it is a real one.
   *
   * `POPULAR_IDS` are the fixtures' ids and a live menu has none of them, so
   * the rail would be empty at every restaurant that answers. Array order is a
   * claim about other people's choices that happens to be false — and it is
   * exactly as false as the four hand-picked ids, because nothing on this
   * platform computes the heading above them. What HAS to be true is narrower
   * and matters more: a tile a guest taps must be orderable, and a fixture tile
   * drawn over a live menu carries an id no kitchen has.
   *
   * There is no endpoint behind this heading and there is not going to be one.
   * `analytics/*` is a console surface behind `auth:sanctum` and a permission,
   * which a guest holds neither of; publishing per-dish sales counts under
   * `/public/*` instead would hand a restaurant's numbers — what sells, how
   * much, on which day — to anybody who loads the page, including the
   * restaurant across the road. So the rail stays what it is: an editorial
   * choice, matched against the live menu so that only dishes this kitchen
   * actually sells can appear in it.
   */
  const popular = useMemo(() => {
    const named = POPULAR_IDS.map((id) => dishes.find((dish) => dish.id === id)).filter(
      (dish): dish is Dish => dish !== undefined,
    );

    return named.length > 0 ? named : dishes.slice(0, 4);
  }, [dishes]);

  const searching = needle !== '';

  return (
    <View style={st.fill}>
      <FlatList
        data={searching ? hits : popular}
        keyExtractor={(dish) => dish.id}
        numColumns={2}
        columnWrapperStyle={st.pair}
        contentContainerStyle={[st.page, { paddingTop: insets.top + size.sp3 }]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        ListHeaderComponent={
          <View>
            {/* -------------------------------------------------- the venue */}
            <View style={st.top}>
              <Pressable
                onPress={() => {
                  const at = venues.findIndex((option) => option.id === branch.id);
                  const next = venues[(at + 1) % venues.length];

                  if (next !== undefined) cart.setBranch(next.id);
                }}
                accessibilityRole="button"
                accessibilityLabel={`${branch.name} · ${s.change}`}
                style={({ pressed }) => [
                  st.branch,
                  {
                    backgroundColor: c.surface,
                    borderColor: c.border,
                    borderRadius: size.radiusPill,
                  },
                  pressed && st.pressed,
                ]}
              >
                <Pin size={15} />
                {/* A district is a proper noun — `Branch.name` is a plain string
                    for that reason. Chilonzor is Chilonzor in all three, and
                    translating it would be inventing places. */}
                <Text style={[st.branchLine, { color: c.fg }]} numberOfLines={1}>
                  {branch.name}
                </Text>
                <Chevron direction="down" size={13} />
              </Pressable>

              <Pressable
                onPress={() => router.push('/customer/profile')}
                accessibilityRole="button"
                accessibilityLabel={GUEST.name}
                style={({ pressed }) => [
                  st.avatar,
                  { backgroundColor: c.brand100, borderRadius: size.radiusPill },
                  pressed && st.pressed,
                ]}
              >
                <Text style={[st.avatarLine, { color: c.brand700 }]}>{GUEST.initials}</Text>
              </Pressable>
            </View>

            {/*
             * What this line says depends on the mode.
             *
             * On a delivery a guest needs the distance and the window; on a
             * pickup neither means anything — they are driving there — and what
             * they need is whether the door is open. A branch with no kilometre
             * figure is in another city, which the design words rather than
             * leaving blank.
             */}
            {/*
             * A live venue says when it is OPEN where a fixture says how long
             * delivery takes, and the two must not be printed in the same
             * sentence: "09:00–23:00 daqiqa" is what happens when they are. No
             * column answers "25–35 minutes" — the promise a guest is given is
             * `promised_at`, computed per basket from the slowest dish, the
             * branch's queue and its travel time — so a live line quotes the
             * hours and lets the checkout make the promise.
             */}
            <Text style={[st.branchNote, text.num, { color: c.fgSubtle }]}>
              {basket.venues.live
                ? [branch.address, branch.eta].filter((part) => part !== '').join(' · ')
                : delivering
                  ? `${branch.address} · ${branch.km === null ? t.inTown : `${branch.km} km`} · ${branch.eta} ${s.minutes}`
                  : `${branch.address} · ${t.openHours}`}
            </Text>

            {/* --------------------------------------------------- how it comes */}
            <View style={[st.segment, { backgroundColor: c.bgMuted, borderRadius: size.radiusMd }]}>
              {(
                [
                  ['delivery', s.delivery],
                  ['takeaway', s.pickup],
                ] as const
              ).map(([value, label]) => {
                const on = basket.channel === value;

                return (
                  <Pressable
                    key={value}
                    onPress={() => cart.setChannel(value)}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: on }}
                    style={[
                      st.segmentTab,
                      { borderRadius: size.radiusSm },
                      on && { backgroundColor: c.surface },
                    ]}
                  >
                    <Text style={[st.segmentLine, { color: on ? c.fg : c.fgMuted }]}>{label}</Text>
                  </Pressable>
                );
              })}
            </View>

            {/* The fee first, then the threshold. `{amount}` is per branch —
                Termiz charges 15 000 — so it is interpolated rather than
                written down. */}
            <Text style={[st.modeNote, { color: c.fgSubtle }]}>
              {delivering
                ? t.deliveryNote.replace('{amount}', som(branch.deliveryFee, lang))
                : t.pickupNote}
            </Text>

            {/*
             * The prices on this screen are not this restaurant's.
             *
             * Pressable because the usual cause is a minute of no signal, and
             * pressing costs less than closing the app. The same sentence the
             * menu screen prints, for the same reason: a guest ordering from a
             * sample is a guest quoted a price nobody set.
             */}
            {menu !== null && !menu.live ? (
              <Pressable
                onPress={retry}
                accessibilityRole="button"
                style={[st.demo, { backgroundColor: c.warning50, borderColor: c.warning500 }]}
              >
                <Text style={[st.meta, { color: c.warning700 }]}>{m.demoMenu}</Text>
              </Pressable>
            ) : null}

            {/* ------------------------------------------------------ search */}
            <View
              style={[
                st.search,
                {
                  backgroundColor: c.bgSubtle,
                  borderColor: c.border,
                  borderRadius: size.radiusMd,
                },
              ]}
            >
              <Search size={17} />
              <TextInput
                value={query}
                onChangeText={setQuery}
                placeholder={s.search}
                placeholderTextColor={c.fgSubtle}
                accessibilityLabel={s.search}
                returnKeyType="search"
                style={[st.searchField, text.small, { color: c.fg }]}
              />
              {query === '' ? null : (
                <Pressable
                  onPress={() => setQuery('')}
                  accessibilityRole="button"
                  accessibilityLabel={m.clearSearch}
                  style={({ pressed }) => [st.clear, pressed && st.pressed]}
                >
                  <Text style={[st.clearLine, { color: c.fgMuted }]}>×</Text>
                </Pressable>
              )}
            </View>

            {searching ? (
              <Text style={[st.meta, text.num, st.sectionTop, { color: c.fgSubtle }]}>
                {hits.length} {m.countFound}
              </Text>
            ) : (
              <>
                {/* ------------------------------------------------- promo */}
                {/*
                 * The design's promo — a 134px picture band over a 1px divider,
                 * then `padding:13px 16px 15px` (:184-190).
                 *
                 * The band used to be left out on the argument that a grey
                 * rectangle reads as a failed image. It does; the design's own
                 * `image-slot` does not render a bare rectangle, it renders the
                 * picture mark, and drawing that is both honest about there
                 * being no photograph yet and the right shape for when there is.
                 */}
                <View
                  style={[
                    st.promo,
                    {
                      backgroundColor: c.surface,
                      borderColor: c.border,
                      borderRadius: size.radiusLg,
                    },
                  ]}
                >
                  <View style={[st.promoBand, { backgroundColor: c.bgMuted }]}>
                    <Photo size={19} />
                  </View>

                  <View style={[st.promoBody, { borderTopColor: c.divider }]}>
                    <Text style={[st.tag, { color: c.brand600 }]}>{t.promoTag}</Text>
                    <Text style={[st.promoHead, { color: c.fg }]}>{t.promoHeading}</Text>
                    <Text style={[st.meta, text.num, { color: c.fgMuted, marginTop: 5 }]}>
                      {t.promoNote}
                    </Text>
                  </View>
                </View>

                {/* -------------------------------------------- categories */}
                <View style={st.sectionHead}>
                  {/* `--text-lg` (17px) in Inter Tight at `--tracking-snug`
                      — it was `text.title`, which is 20px. */}
                  <Text style={[st.sectionLine, { color: c.fg }]}>{t.categories}</Text>
                  <Pressable
                    onPress={() => router.push('/customer/menu')}
                    accessibilityRole="button"
                    style={({ pressed }) => [st.seeAll, pressed && st.pressed]}
                  >
                    <Text style={[st.seeAllLine, { color: c.brand600 }]}>{t.seeAll}</Text>
                  </Pressable>
                </View>

                {/*
                 * The count is what earns the rail: "Milliy · 18 ta" tells a
                 * guest where the menu actually is.
                 *
                 * Every tile opens the full menu. It cannot yet open it *at* the
                 * category — the menu screen keeps its chip selection in its own
                 * state and reads no route parameter — so the tile takes the
                 * guest one tap short rather than pretending to filter.
                 */}
                <FlatList
                  horizontal
                  data={categories}
                  keyExtractor={(category) => category.id}
                  showsHorizontalScrollIndicator={false}
                  style={st.rail}
                  contentContainerStyle={st.railBody}
                  renderItem={({ item }) => (
                    <Pressable
                      onPress={() => router.push('/customer/menu')}
                      accessibilityRole="button"
                      style={({ pressed }) => [
                        st.category,
                        {
                          backgroundColor: c.surface,
                          borderColor: c.border,
                          borderRadius: size.radiusLg,
                        },
                        pressed && st.pressed,
                      ]}
                    >
                      {/* `height:62px;background:var(--bg-muted)` over a
                          `padding:8px 9px 9px` block — :204. */}
                      <View style={[st.categoryBand, { backgroundColor: c.bgMuted }]}>
                        <Photo size={19} />
                      </View>

                      <View style={st.categoryBody}>
                        <Text style={[st.categoryName, { color: c.fg }]} numberOfLines={1}>
                          {say(item.name, lang)}
                        </Text>
                        <Text style={[st.categoryCount, text.num, { color: c.fgSubtle }]}>
                          {dishes.filter((dish) => dish.categoryId === item.id).length}{' '}
                          {t.countUnit}
                        </Text>
                      </View>
                    </Pressable>
                  )}
                />

                {/* ----------------------------------------------- popular */}
                <View style={st.sectionHead}>
                  <Text style={[st.sectionLine, { color: c.fg }]}>{t.popular}</Text>
                  <Text style={[st.meta, text.num, { color: c.fgSubtle }]}>{t.popularNote}</Text>
                </View>
              </>
            )}
          </View>
        }
        ListEmptyComponent={
          searching ? (
            <Text style={[text.small, st.noHits, { color: c.fgSubtle }]}>{m.noHitsHeading}</Text>
          ) : undefined
        }
        renderItem={({ item }) => (
          <DishTile dish={item} lang={lang} soldOut={s.soldOut} onOpen={() => setOpen(item)} />
        )}
        ListFooterComponent={
          searching ? undefined : (
            <View
              style={[
                st.loyalty,
                {
                  backgroundColor: c.bgSubtle,
                  borderColor: c.border,
                  borderRadius: size.radiusLg,
                },
              ]}
            >
              <View style={st.loyaltyMain}>
                <Text style={[st.branchLine, text.num, { color: c.fg }]}>
                  {groupDigits(LOYALTY.points)} {t.loyaltyStrip}
                </Text>
                <Text style={[st.meta, text.num, { color: c.fgMuted, marginTop: 2 }]}>
                  {t.loyaltyStripNote}
                </Text>
              </View>

              {/* `height:36px;padding:0 14px;border:1px solid var(--border-strong)`
                  — drawn here rather than through `Button`, whose CTA height is
                  52 and would make this strip a third taller than the drawing. */}
              <Pressable
                onPress={() => router.push('/customer/loyalty')}
                accessibilityRole="button"
                style={({ pressed }) => [
                  st.loyaltyGo,
                  {
                    borderColor: c.borderStrong,
                    backgroundColor: c.surface,
                    borderRadius: size.radiusMd,
                  },
                  pressed && st.pressed,
                ]}
              >
                <Text style={[st.loyaltyGoLine, { color: c.fg }]}>{s.open}</Text>
              </Pressable>
            </View>
          )
        }
      />

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

/** One dish tile — the design's 2-up card: name, rating, price. */
function DishTile({
  dish,
  lang,
  soldOut,
  onOpen,
}: {
  dish: Dish;
  lang: Lang;
  soldOut: string;
  onOpen: () => void;
}) {
  const c = useTheme();
  /* Two tiles to a row, inside the scene's 20pt gutters (`_layout.tsx`) and
     the 10 between them (`st.pair`). The photograph is requested for that
     width; a point or two either way picks the same file. */
  const { width: window } = useWindowDimensions();
  const tileWidth = (window - 2 * size.sp5 - 10) / 2;

  return (
    <Pressable
      onPress={onOpen}
      accessibilityRole="button"
      style={({ pressed }) => [
        st.tile,
        { backgroundColor: c.surface, borderColor: c.border, borderRadius: size.radiusLg },
        pressed && st.pressed,
        dish.soldOut && st.dimmed,
      ]}
    >
      {/* `height:104px` over `padding:10px 11px 12px` — :219-221. The band is
          the photograph where the dish has one, and the picture mark on the
          muted ground where it has not. */}
      <View style={[st.tileBand, { backgroundColor: c.bgMuted }]}>
        <DishPhoto
          image={dish.image ?? null}
          width={tileWidth}
          height={104}
          fill
          fallback={<Photo size={19} />}
        />
      </View>

      <View style={st.tileBody}>
        <Text style={[st.tileName, { color: c.fg }]} numberOfLines={1}>
          {say(dish.name, lang)}
        </Text>

        {/* A live dish has no rating and the row disappears with it: CRM stores
            feedback about a visit rather than about a plate, so "★  (0)" would be
            a score this kitchen never earned, printed next to its food. */}
        {dish.rating === '' ? null : (
          <View style={st.rating}>
            <Star size={11} />
            {/* Both figures are `--text-2xs` (11px) — :225-226. */}
            <Text style={[st.tileRating, text.num, { color: c.fgMuted }]}>{dish.rating}</Text>
            <Text style={[st.tileReviews, text.num, { color: c.fgSubtle }]}>({dish.reviews})</Text>
          </View>
        )}

        {/* `font-family:var(--font-display);font-size:--text-md;font-weight:700;
            margin-top:7px` — the price is a headline, not body copy. */}
        <Text style={[st.tilePrice, text.num, { color: c.fg }]}>{som(dish.price, lang)}</Text>

        {/* Said in a word, never in a tint alone: the row is dimmed *and*
            labelled, because a guest reading in low light sees one of the two. */}
        {dish.soldOut ? (
          <Text style={[st.meta, { color: c.danger600, marginTop: 4 }]}>{soldOut}</Text>
        ) : null}
      </View>
    </Pressable>
  );
}

/*
 * The design's own numbers — `Smart Restaurant Mijoz ilovasi.dc.html`, the
 * `at.home` block (:156-232).
 *
 * The screen was built on the spacing scale, and the scale has no 22, no 18, no
 * 11 and no 9 — so the section rhythm that repeats down the whole page (22
 * above a heading, 10 under it) came out as 20 and 8, and every rail and tile
 * shifted with it.
 */
const st = StyleSheet.create({
  fill: { flex: 1 },
  page: { paddingBottom: size.sp8 },
  pair: { gap: 10 },
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  /* `height:34px;padding:0 12px 0 11px;gap:7px;max-width:230px` — :160. The
     44pt reach comes from a hit slop, so the pill keeps the drawn height. */
  branch: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    height: 34,
    maxWidth: 230,
    paddingLeft: 11,
    paddingRight: 12,
    borderWidth: 1,
  },
  branchLine: { ...sansAt(600, 13, 1.3), flexShrink: 1 },
  /* `width:36px;height:36px` — :166. It was 44. */
  avatar: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  avatarLine: { ...sansAt(700, 12, 1.2) },
  /* `margin-top:6px` under the pill — :168. */
  branchNote: { ...sansAt(400, 12, 1.45), marginTop: 6 },
  /* `gap:3px;padding:3px;margin-top:14px` — :170. */
  segment: { flexDirection: 'row', padding: 3, gap: 3, marginTop: 14 },
  /* `height:36px;border-radius:8px` — :171. */
  segmentTab: {
    flex: 1,
    height: 36,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  segmentLine: { ...sansAt(600, 13, 1.3) },
  /* `margin-top:8px;line-height:1.5` — :174. */
  modeNote: { ...sansAt(400, 12, 1.5), marginTop: 8 },
  /* `height:44px;padding:0 14px;margin-top:14px` — :176. */
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    height: 44,
    paddingHorizontal: 14,
    borderWidth: 1,
    marginTop: 14,
  },
  searchField: { flex: 1, minWidth: 0, padding: 0 },
  /* `width:24px;height:24px;border-radius:50%;background:var(--bg-muted)` —
     :180. It was a bare glyph on nothing. */
  clear: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  clearLine: { fontSize: 14, lineHeight: 14 },
  sectionTop: { marginTop: 16, marginBottom: 8 },
  demo: { marginTop: 12, padding: 12, borderWidth: 1, borderRadius: size.radiusMd },
  /* `margin-top:18px` around a card at `--radius-lg` — :185. */
  promo: { marginTop: 18, borderWidth: 1, overflow: 'hidden' },
  /* `height:134px` — :187. */
  promoBand: { height: 134, alignItems: 'center', justifyContent: 'center' },
  /* `padding:13px 16px 15px;border-top:1px solid var(--divider)` — :190. */
  promoBody: { paddingTop: 13, paddingHorizontal: 16, paddingBottom: 15, borderTopWidth: 1 },
  /* `--text-2xs` (11px) at 700 with the caps tracking — :191. It was 10px. */
  tag: {
    ...sans(700),
    fontSize: 11,
    lineHeight: 14,
    letterSpacing: 0.88,
    textTransform: 'uppercase',
  },
  /* Inter Tight `--text-lg` at `--tracking-snug`, `line-height:1.25`, 5 above. */
  promoHead: { ...display(700), fontSize: 17, lineHeight: 21, letterSpacing: -0.2, marginTop: 5 },
  /* `padding:22px 20px 10px` — the rhythm the whole page repeats (:198, :213). */
  sectionHead: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    marginTop: 22,
    marginBottom: 10,
  },
  /* Inter Tight `--text-lg` at `--tracking-snug` — it was `text.title`, 20px. */
  sectionLine: { ...display(700), fontSize: 17, lineHeight: 21, letterSpacing: -0.2 },
  /* The design's 12px meta line, which this screen draws seven times. */
  meta: { ...sansAt(400, 12, 1.45) },
  seeAll: { minHeight: 44, justifyContent: 'center', paddingLeft: 12 },
  seeAllLine: { ...sansAt(600, 13, 1.3) },
  rail: { flexGrow: 0 },
  /* `gap:9px;padding:0 20px 4px` — :201. */
  railBody: { gap: 9, paddingVertical: 2 },
  /* `width:98px` — it was 118. */
  category: { width: 98, borderWidth: 1, overflow: 'hidden' },
  /* `height:62px;background:var(--bg-muted)` — :204. */
  categoryBand: { height: 62, alignItems: 'center', justifyContent: 'center' },
  /* `padding:8px 9px 9px`, left-aligned — :205. */
  categoryBody: { paddingTop: 8, paddingHorizontal: 9, paddingBottom: 9 },
  /* `--text-xs` at 600 — it was 13px. */
  categoryName: { ...sansAt(600, 12, 1.3) },
  /* `--text-3xs` with `margin-top:2px` — it was 12px. */
  categoryCount: { ...sansAt(400, 10, 1.25), marginTop: 2 },
  /* `grid-template-columns:1fr 1fr;gap:11px` — :217. */
  tile: { flex: 1, minWidth: 0, marginBottom: 11, borderWidth: 1, overflow: 'hidden' },
  /* `height:104px` — :219. */
  tileBand: { height: 104, alignItems: 'center', justifyContent: 'center' },
  /* `padding:10px 11px 12px` — :220. */
  tileBody: { paddingTop: 10, paddingHorizontal: 11, paddingBottom: 12 },
  tileName: { ...sansAt(600, 13, 1.3) },
  /* `--text-2xs` on both, `gap:5px;margin-top:4px` — :223-226. */
  tileRating: { ...sansAt(600, 11, 1.3) },
  tileReviews: { ...sansAt(400, 11, 1.3) },
  /* Inter Tight `--text-md` at 700, `margin-top:7px` — :228. */
  tilePrice: { ...display(700), fontSize: 15, lineHeight: 19, letterSpacing: -0.18, marginTop: 7 },
  rating: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 4 },
  noHits: { textAlign: 'center', paddingVertical: 40 },
  /* `margin:22px 20px 0;padding:16px 18px` — :232. */
  loyalty: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    marginTop: 22,
    paddingHorizontal: 18,
    paddingVertical: 16,
    borderWidth: 1,
  },
  loyaltyMain: { flex: 1, minWidth: 0 },
  /* `height:36px;padding:0 14px;border:1px solid var(--border-strong);13px/600`
     — drawn inline rather than through `Button`, whose 52pt CTA height would
     make this strip a third taller than the drawing. */
  loyaltyGo: {
    height: 36,
    paddingHorizontal: 14,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  loyaltyGoLine: { ...sansAt(600, 13, 1.3) },
  /* `[data-press]:active{transform:scale(.97)}`. */
  pressed: { transform: [{ scale: 0.97 }] },
  dimmed: { opacity: 0.5 },
});
