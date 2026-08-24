import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { FlatList, Pressable, SectionList, StyleSheet, Text, View } from 'react-native';
import { fill, t } from '@restaurant/surfaces/mp/copy';
import { say, type Trilingual } from '@restaurant/surfaces/mp/data';

import { basket } from '@/mp/basket';
import { minOrderNote, sampleNote, useStorefront, type LiveDish, type LiveStore } from '@/mp/live';
import { DishPhoto } from '@/ui/dish-photo';
import { Button, Empty, PRESSED } from '@/ui/primitives';
import { Chevron, Star } from '@/ui/icons';
import { Notice, useNotice } from '@/ui/notice';
import { useLocale } from '@/lib/locale';
import { groupDigits, som } from '@/lib/money';
import { useMpShadows, useMpTheme } from '@/lib/theme-context';
import { size } from '@/theme';
import { display, sans, text, tracking } from '@/type';

/**
 * MyPOS, screen 2 — one store's menu.
 *
 * `Ilova.dc.html:179-242`, and the same route the web build serves at
 * `/mp/store/{id}` so a shared link opens the same shop in either. The segment
 * is the store's slug, which is also what `GET /mp/stores/{slug}` is keyed by —
 * one identifier from the URL bar to the query, with nothing in between to keep
 * in step.
 *
 * **The menu is this store's own now.** `GET /mp/stores/{slug}` answers the card
 * and the listing together, priced for the marketplace channel: a dish the
 * restaurant sells only in its dining room is not in it, and a dish the kitchen
 * has 86'd comes back `sold_out` and cannot be added. Both of those are the
 * server's answer rather than this screen's, which is the only place they can be
 * right — a stale page and an edited request arrive looking identical.
 *
 * **The marketplace palette, not the restaurant one** (`useMpTheme`): this is a
 * second product with a grey page under white cards and its own status tones,
 * and it is the only palette that carries `--sh-pop` — the shadow the design
 * puts under both the back button (:183) and the add button (:232).
 *
 * The hero (`image-slot` at :182) still has no source on this platform, so it
 * is drawn as the flat tinted panel the store cards use, at the design's exact
 * size. Each dish's 96×80 slot (:230) is the same tint under the photograph
 * where the kitchen has published one, and the tint alone where it has not —
 * a grey rectangle in every row would read as eight images still loading.
 */
export default function MarketplaceStore() {
  const c = useMpTheme();
  const sh = useMpShadows();
  const { lang } = useLocale();
  const { note, say: flash } = useNotice();
  const { store: slug } = useLocalSearchParams<{ store: string }>();

  const shop = useStorefront(slug, lang);
  const { store, menu } = shop.data;

  /* Order preserved, duplicates dropped: the rail reads in menu order, which is
     the order a kitchen thinks in — mains before drinks, never alphabetical. */
  const categories = useMemo(() => {
    const seen = new Set<string>();
    const out: Trilingual[] = [];

    for (const dish of menu) {
      if (seen.has(dish.category.uz)) continue;

      seen.add(dish.category.uz);
      out.push(dish.category);
    }

    return out;
  }, [menu]);

  const [category, setCategory] = useState<string | null>(null);

  /* The chosen chip is cleared when the menu underneath it changes — a category
     that no longer exists would filter the list down to nothing and read as a
     restaurant with an empty menu. */
  useEffect(() => {
    setCategory((current) =>
      current !== null && categories.some((entry) => entry.uz === current) ? current : null,
    );
  }, [categories]);

  const here = category ?? categories[0]?.uz ?? '';
  const dishes = useMemo(() => menu.filter((dish) => dish.category.uz === here), [menu, here]);

  if (slug === undefined) {
    return (
      <View style={[s.fill, { backgroundColor: c.surface }]}>
        <Empty title={t('noHitsH', lang)} body={t('noHitsP', lang)} />
        <View style={s.missing}>
          <Button onPress={() => router.navigate('/mp')}>{t('backHome', lang)}</Button>
        </View>
      </View>
    );
  }

  return (
    /* The phone frame this screen fills is `background:var(--surface)` — :95.
       Nothing painted it before, so on dark the scroller showed the navigator's
       `--page` (#0B0E16) while the pinned rail below carried `--surface`
       (#12161F), and the two grounds met in a visible seam. */
    <View style={[s.fill, { backgroundColor: c.surface }]}>
      {/*
       * A SectionList rather than a FlatList, for one reason: the category rail
       * is `position:sticky;top:0;z-index:10` (:205) — it travels up with the
       * hero and then pins under the status bar while the menu keeps scrolling.
       * Inside `ListHeaderComponent` it scrolled away with the hero, and a guest
       * four dishes down had no way back to the other categories.
       *
       * The empty state moved to the footer with it. `ListEmptyComponent` never
       * fires on a SectionList — `VirtualizedSectionList` counts a header and a
       * footer per section, so its item count is never zero — and dropping the
       * section instead would take the rail away with it, which is the one
       * control that could refill the list.
       */}
      <SectionList
        sections={[{ data: dishes }]}
        keyExtractor={(dish) => dish.id}
        stickySectionHeadersEnabled
        showsVerticalScrollIndicator={false}
        contentContainerStyle={s.list}
        ListHeaderComponent={
          <View>
            <View style={[s.hero, { backgroundColor: store.tint }]}>
              <Text style={[text.display, s.heroMark]}>{store.initials}</Text>

              {/* `36×36;border-radius:11px;background:var(--surface);
                  box-shadow:var(--sh-pop)` — :183. It was a 44×44 square at
                  radius 10 with no shadow, so it sat flat on the hero instead of
                  lifting off it; `hitSlop` carries the 44pt target the 36 loses. */}
              <Pressable
                onPress={() => (router.canGoBack() ? router.back() : router.navigate('/mp'))}
                accessibilityRole="button"
                accessibilityLabel={t('back', lang)}
                hitSlop={4}
                style={({ pressed }) => [
                  s.back,
                  { backgroundColor: c.surface, boxShadow: sh.pop },
                  pressed && PRESSED,
                ]}
              >
                <Chevron direction="left" size={17} colour={c.fg} />
              </Pressable>
            </View>

            {shop.live ? null : (
              <Pressable onPress={shop.reload} accessibilityRole="button" style={s.demo}>
                <Text style={[s.meta, { color: c.warnFg }]}>{sampleNote(shop.problem, lang)}</Text>
              </Pressable>
            )}

            <View style={s.head}>
              {/* `font-size:25px;font-weight:700;letter-spacing:-.024em;
                  line-height:1.15` — :189. `text.display` is the 30px step, so
                  the shop's name was drawn a fifth larger than the design draws
                  it and pushed the meta line down the screen. */}
              <Text style={[s.shopName, { color: c.fg }]}>{store.name}</Text>
              <Text style={[s.kind, { color: c.fgMuted }]}>{say(store.kind, lang)}</Text>

              <View style={s.metaRow}>
                {/* The star, the rating and the review count are one span at
                    `gap:4px` inside the `gap:8px` row — :193-196. Flat siblings
                    at a single gap spaced the count away from the figure it
                    counts. */}
                <View style={s.rating}>
                  <Star size={13} colour={c.star} />
                  <Text style={[s.metaStrong, text.num, { color: c.fg }]}>
                    {store.rating.toFixed(1)}
                  </Text>
                  <Text style={[s.meta, text.num, { color: c.fgMuted }]}>
                    {fill(t('reviews', lang), { n: groupDigits(store.reviews) })}
                  </Text>
                </View>
                <Text style={[s.meta, { color: c.borderStrong }]}>·</Text>
                <Text style={[s.meta, text.num, { color: c.fgMuted }]}>
                  {fill(t('window', lang), { from: store.minutesFrom, to: store.minutesTo })}
                </Text>
                <Text style={[s.meta, { color: c.borderStrong }]}>·</Text>
                <Text style={[s.meta, text.num, { color: c.fgMuted }]}>
                  {store.deliveryFee === 0 ? t('freeDelivery', lang) : som(store.deliveryFee, lang)}
                </Text>

                {/* `height:22px;padding:0 9px;border-radius:7px` on `--ok-soft`
                    with a 5px `--ok` dot in front — :199-200. It was the shared
                    `Pill`: a full capsule, no dot, no fixed height and 12px at
                    500, which is a different object from the one drawn here.
                    The shut case is the same geometry in the bad tones — the
                    design only draws the open one. */}
                <View style={[s.openTag, { backgroundColor: store.open ? c.okSoft : c.badSoft }]}>
                  <View style={[s.openDot, { backgroundColor: store.open ? c.ok : c.bad }]} />
                  <Text style={[s.openLine, { color: store.open ? c.okFg : c.badFg }]}>
                    {store.open ? t('openUntil', lang) : t('closedAt', lang)}
                  </Text>
                </View>
              </View>

              {/* The kitchen's floor, said before the basket rather than at
                  checkout. `POST /mp/orders` refuses a basket under it with
                  `marketplace.below_minimum`, and finding that out after
                  choosing four dishes is finding it out too late.

                  Not in the design — the header there ends at the meta row
                  (:188-203). Kept anyway, and recorded here so the next audit
                  reads it as a decision rather than as drift. */}
              {store.minOrder === 0 ? null : (
                <Text style={[s.meta, { color: c.fgSubtle, marginTop: 8 }]}>
                  {minOrderNote(som(store.minOrder, lang), lang)}
                </Text>
              )}
            </View>
          </View>
        }
        renderSectionHeader={() => (
          <FlatList
            horizontal
            showsHorizontalScrollIndicator={false}
            /* `background:var(--surface);border-bottom:1px solid var(--divider)`
               — :205. The background is what makes a pinned rail opaque, and the
               rule is what separates it from the menu sliding under it. */
            style={[s.rail, { backgroundColor: c.surface, borderBottomColor: c.divider }]}
            contentContainerStyle={s.railInner}
            data={categories}
            keyExtractor={(entry) => entry.uz}
            renderItem={({ item }) => {
              const on = item.uz === here;

              return (
                <Pressable
                  onPress={() => setCategory(item.uz)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: on }}
                  style={({ pressed }) => [
                    s.chip,
                    {
                      borderColor: on ? c.fg : c.border,
                      backgroundColor: on ? c.fg : c.surface,
                    },
                    pressed && PRESSED,
                  ]}
                >
                  <Text style={[s.chipLine, { color: on ? c.surface : c.fg }]}>
                    {say(item, lang)}
                  </Text>
                </Pressable>
              );
            }}
          />
        )}
        ListFooterComponent={
          dishes.length === 0 ? <Empty title={t('none', lang)} body={t('noneSub', lang)} /> : null
        }
        renderItem={({ item }) => (
          <DishRow
            dish={item}
            lang={lang}
            tint={store.tint}
            /* A shut kitchen cannot take an order, so the whole menu is
               read-only rather than the guest finding out at the basket. */
            closed={!store.open}
            onAdd={() => add(store, item)}
          />
        )}
      />

      <Notice note={note} bottom={size.sp4} />
    </View>
  );

  function add(shopCard: LiveStore, dish: LiveDish) {
    /*
     * A sample dish carries no `menu_item_id`, so a basket built from one can
     * never be sent. Said at the tap rather than at checkout, where the guest
     * has already chosen an address and a card.
     */
    if (dish.menuItemId === null) {
      flash(sampleNote(shop.problem, lang), 'problem');

      return;
    }

    basket.add(shopCard, dish);
    flash(`${say(dish.name, lang)} · ${t('add', lang)}`);
  }
}

function DishRow({
  dish,
  lang,
  tint,
  closed,
  onAdd,
}: {
  dish: LiveDish;
  lang: 'uz' | 'ru' | 'en';
  /** The store's flat tint — what stands in for the dish photograph. */
  tint: string;
  closed: boolean;
  onAdd: () => void;
}) {
  const c = useMpTheme();
  const sh = useMpShadows();
  const off = dish.soldOut === true || closed;

  return (
    <View style={[s.row, { borderBottomColor: c.divider }, off && s.faded]}>
      <View style={s.rowMain}>
        <View style={s.rowTitle}>
          <Text style={[s.dishName, { color: c.fg }]} numberOfLines={1}>
            {say(dish.name, lang)}
          </Text>
          {/* `height:19px;padding:0 7px;border-radius:6px` at 10px/700 on
              `--bad-soft` — :218. It was the shared `Pill`, which is a capsule
              at 11px with its own padding: a different shape in a row where the
              tag has to sit level with a 15px name. */}
          {dish.was === undefined ? null : (
            <View style={[s.tag, { backgroundColor: c.badSoft }]}>
              <Text style={[s.tagLine, { color: c.badFg }]}>{t('promoTag_offer', lang)}</Text>
            </View>
          )}
        </View>

        {/* `line-height:1.45;text-wrap:pretty` and no clamp — :221. It was held
            to two lines, which cut the third line off a dish that needed one. */}
        {dish.description === null ? null : (
          <Text style={[s.dishDesc, { color: c.fgMuted }]}>{dish.description}</Text>
        )}

        <View style={s.prices}>
          <Text style={[s.price, text.num, { color: c.fg }]}>{som(dish.price, lang)}</Text>
          {dish.was === undefined ? null : (
            <Text style={[s.was, text.num, { color: c.fgDisabled }]}>{som(dish.was, lang)}</Text>
          )}
        </View>
      </View>

      {/*
       * `flex:none;width:96px;height:80px;border-radius:12px;overflow:hidden` —
       * :229. There was no thumbnail here at all, so every row was text on the
       * left and a lone blue square on the right, and the menu had none of the
       * weight the design gives it.
       *
       * The photograph lies under the veil and the add button, which stay the
       * slot's own; the tint is what shows while it loads and all there is
       * when the dish has none.
       */}
      <View style={[s.thumb, { backgroundColor: tint }]}>
        <DishPhoto image={dish.image} width={96} height={80} fill fallback={null} />

        {off ? (
          /* `inset:0;background:rgba(15,19,32,.55)` with the word centred at
             11px/700 in #fff — :235. Both literals: the veil's ground does not
             follow the theme, so the word on it cannot either. It used to be a
             neutral `Pill` down in the price row, which read as one more piece
             of meta rather than as the dish being unavailable. */
          <View style={[StyleSheet.absoluteFill, s.veil]}>
            <Text style={s.veilLine}>
              {dish.soldOut === true ? t('soldOut', lang) : t('closed', lang)}
            </Text>
          </View>
        ) : (
          /* `right:5px;bottom:5px;32×32;border-radius:10px;background:
             var(--surface);color:var(--fg);box-shadow:var(--sh-pop)` at
             18px/600 — :232. It was a 44×44 brand-filled square standing beside
             the text; `hitSlop` keeps the 44pt target the 32 gives up.
             The design draws it under `sc-if d.on` — an unavailable dish wears
             the veil instead, which is what the disabled button already meant. */
          <Pressable
            onPress={onAdd}
            accessibilityRole="button"
            accessibilityLabel={`${t('add', lang)} · ${say(dish.name, lang)}`}
            hitSlop={6}
            style={({ pressed }) => [
              s.add,
              { backgroundColor: c.surface, boxShadow: sh.pop },
              pressed && PRESSED,
            ]}
          >
            <Text style={[s.addGlyph, { color: c.fg }]}>+</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

/*
 * Every number below is the design's own — `MyPOS Marketplace - Ilova.dc.html`,
 * with the line it comes from. The screen was built on the spacing scale
 * (18 → sp5 = 20, 14 → sp3 = 12) and on the type ladder's 12px/20px steps,
 * neither of which has the values this drawing uses, so nothing on it was the
 * size the design draws.
 */
const s = StyleSheet.create({
  fill: { flex: 1 },
  /* `padding:0 18px 20px` — :211. The 18 is the row's own margin. */
  list: { paddingBottom: 20 },
  missing: { paddingHorizontal: 18 },
  demo: { paddingHorizontal: 18, paddingTop: 12, minHeight: 44 },
  /* `height:186px` — :181. */
  hero: { height: 186, alignItems: 'center', justifyContent: 'center' },
  /* White in both themes: the tint under it is a fixed dark colour, so this mark
     cannot follow `--n-0`, which flips to near-black on dark. */
  heroMark: { opacity: 0.9, color: '#FFFFFF' },
  /* `left:14px;top:14px;36×36;border-radius:11px` — :183. */
  back: {
    position: 'absolute',
    left: 14,
    top: 14,
    width: 36,
    height: 36,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  /* `padding:16px 18px 0` — :188. */
  head: { paddingHorizontal: 18, paddingTop: 16 },
  /* `font-size:25px;font-weight:700;letter-spacing:-.024em;line-height:1.15`
     in Inter Tight — :189. */
  shopName: {
    ...display(700),
    fontSize: 25,
    lineHeight: 29,
    letterSpacing: tracking('-.024em', 25),
  },
  /* `font-size:13px;margin-top:5px` at the sheet's 1.45 leading — :190. */
  kind: { ...sans(400), fontSize: 13, lineHeight: 19, marginTop: 5 },
  /* `gap:8px;flex-wrap:wrap;margin-top:10px` — :191. The gap was 6. */
  metaRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginTop: 10 },
  /* The row's own `font-size:12px`, which every child inherits — :191. It was
     `text.caption`, which is the same size at 500: a heavier meta line than the
     one drawn. */
  meta: { ...sans(400), fontSize: 12, lineHeight: 17 },
  metaStrong: { ...sans(700), fontSize: 12, lineHeight: 17 },
  /* `gap:4px` inside the row — :193. */
  rating: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  /* `height:22px;padding:0 9px;border-radius:7px;gap:5px` — :199. */
  openTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    height: 22,
    paddingHorizontal: 9,
    borderRadius: 7,
  },
  openDot: { width: 5, height: 5, borderRadius: 999 },
  /* `font-size:11px;font-weight:600` — :199. */
  openLine: { ...sans(600), fontSize: 11, lineHeight: 14 },
  /* `border-bottom:1px solid var(--divider)` — :205. Never a hairline: the
     design draws a whole pixel. */
  rail: { flexGrow: 0, borderBottomWidth: 1 },
  /* `gap:8px;padding:16px 18px 14px` — :205. It was 20 across and 16 both ways. */
  railInner: { gap: 8, paddingHorizontal: 18, paddingTop: 16, paddingBottom: 14 },
  /* `height:34px;padding:0 14px;border:1px solid;border-radius:999px` — :207. */
  chip: {
    height: 34,
    minHeight: 34,
    paddingHorizontal: 14,
    justifyContent: 'center',
    borderWidth: 1,
    borderRadius: 999,
  },
  /* `font-size:13px;font-weight:500` — :207. It was 13 at 400. */
  chipLine: { ...sans(500), fontSize: 13, lineHeight: 16 },
  /* `gap:14px;padding:15px 0` inside the 18px container — :213. No
     `align-items`, so the row stretches and the thumbnail hangs from the top;
     it was centred against the text, which floats it in a tall row. */
  row: {
    flexDirection: 'row',
    gap: 14,
    marginHorizontal: 18,
    paddingVertical: 15,
    borderBottomWidth: 1,
  },
  rowMain: { flex: 1, minWidth: 0 },
  /* `gap:8px` — :215. */
  rowTitle: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  /* `font-size:15px;font-weight:600` — :216. */
  dishName: { ...sans(600), fontSize: 15, lineHeight: 22, flexShrink: 1 },
  /* `height:19px;padding:0 7px;border-radius:6px` — :218. */
  tag: {
    flexShrink: 0,
    height: 19,
    paddingHorizontal: 7,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  /* `font-size:10px;font-weight:700` — :218. */
  tagLine: { ...sans(700), fontSize: 10, lineHeight: 13 },
  /* `font-size:12px;line-height:1.45;margin-top:3px` — :221. */
  dishDesc: { ...sans(400), fontSize: 12, lineHeight: 17, marginTop: 3 },
  /* `align-items:baseline;gap:8px;margin-top:7px` — :222. */
  prices: { flexDirection: 'row', alignItems: 'baseline', flexWrap: 'wrap', gap: 8, marginTop: 7 },
  /* `data-fd` — Inter Tight — at `font-size:15px;font-weight:700` — :223. The
     price was set in Inter at 700, a different face from the one drawn. */
  price: { ...display(700), fontSize: 15, lineHeight: 22 },
  /* `font-size:12px;text-decoration:line-through` — :225. */
  was: { ...sans(400), fontSize: 12, lineHeight: 17, textDecorationLine: 'line-through' },
  /* `width:96px;height:80px;border-radius:12px;overflow:hidden` — :229. */
  thumb: { flexShrink: 0, width: 96, height: 80, borderRadius: 12, overflow: 'hidden' },
  /* `right:5px;bottom:5px;32×32;border-radius:10px` — :232. */
  add: {
    position: 'absolute',
    right: 5,
    bottom: 5,
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  /* `font-size:18px;font-weight:600;line-height:1` — :232. */
  addGlyph: { ...sans(600), fontSize: 18, lineHeight: 18 },
  /* `background:rgba(15,19,32,.55)` — :235. */
  veil: {
    backgroundColor: 'rgba(15,19,32,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  /* `color:#fff;font-size:11px;font-weight:700` — :235. */
  veilLine: { ...sans(700), fontSize: 11, lineHeight: 14, color: '#FFFFFF' },
  faded: { opacity: 0.55 },
});
