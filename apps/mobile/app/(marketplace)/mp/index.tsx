import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { fill, t } from '@restaurant/surfaces/mp/copy';
import {
  APP_CUISINES,
  APP_VERTICALS,
  CUISINES,
  PROMO_BANNERS,
  VERTICALS,
} from '@restaurant/surfaces/mp/data';

import { AddressSheet } from '@/mp/address-sheet';
import { basket, useBasket } from '@/mp/basket';
import { sampleNote, useMpProfile, useStoreDirectory, type LiveStore } from '@/mp/live';
import { Empty } from '@/ui/primitives';
import { Chevron, Star } from '@/ui/icons';
import { Notice, useNotice } from '@/ui/notice';
import { useLocale } from '@/lib/locale';
import { groupDigits, som } from '@/lib/money';
import { useMpShadows, useMpTheme } from '@/lib/theme-context';
import { size } from '@/theme';
import { display, sans, text } from '@/type';

/**
 * MyPOS, screen 1 — where it is going, and who will cook it.
 *
 * `MyPOS Marketplace - Ilova.dc.html:120-186`. The address sits above the
 * scroll and everything else moves under it, because the address is what makes
 * every figure below true: change it and the fees, the windows and the list of
 * who can reach you all change with it.
 *
 * **Both rails filter server-side now.** `GET /mp/stores` takes `vertical` and
 * `cuisine`, and `StoreCard` carries both — so a chip is a query rather than a
 * client-side `.filter()` over whatever happened to be downloaded. The eleven
 * unlaunched verticals still only say when they open: they have no stores, and
 * asking for them would draw an empty list where the honest answer is a date.
 *
 * Monograms rather than pictures on the cuisine circles: `FOUNDATIONS §8` bans
 * emoji, and the emoji set has no plov, no somsa and no choyxona — swapping
 * those for sushi and croissants is how an Uzbek marketplace loses the four
 * things people actually order.
 *
 * The "offers only" chip stays local. It is not a filter the endpoint has, and
 * it is answerable from the cards already in hand — `offer` is on every one of
 * them.
 */
export default function MarketplaceHome() {
  const c = useMpTheme();
  const { lang } = useLocale();
  const { note, say: flash } = useNotice();
  const { address, store: basketStore } = useBasket();

  const [sheet, setSheet] = useState(false);
  const [vertical, setVertical] = useState('all');
  const [cuisine, setCuisine] = useState<string | null>(null);
  const [offersOnly, setOffersOnly] = useState(false);

  const directory = useStoreDirectory(lang, {
    vertical: vertical === 'all' ? null : vertical,
    cuisine,
  });

  /*
   * The address book is the profile's, and the header shows one before anybody
   * has picked: the default the guest set on whichever device they set it on.
   * Only when nothing is chosen — `suggestAddress` refuses to overwrite a
   * choice made on the cart screen a moment ago.
   */
  const profile = useMpProfile(lang);
  const book = profile.data.addresses;
  const preferred = book.find((entry) => entry.isDefault) ?? book[0];

  useEffect(() => {
    if (preferred !== undefined) basket.suggestAddress(preferred);
  }, [preferred]);

  /*
   * The window under the address is "how soon could anything get here", so it is
   * the fastest kitchen that is open — not an average, which describes no
   * restaurant, and not the nearest, which may be shut.
   */
  const soonest = useMemo(
    () =>
      directory.data
        .filter((store) => store.open)
        .reduce<LiveStore | undefined>(
          (best, store) =>
            best === undefined || store.minutesFrom < best.minutesFrom ? store : best,
          undefined,
        ),
    [directory.data],
  );

  const stores = useMemo(
    () =>
      offersOnly ? directory.data.filter((store) => store.offer !== undefined) : directory.data,
    [directory.data, offersOnly],
  );

  const filtered = cuisine !== null || offersOnly || vertical !== 'all';
  const banner = PROMO_BANNERS[0];

  return (
    <View style={s.fill}>
      <View style={s.head}>
        <Pressable
          onPress={() => setSheet(true)}
          accessibilityRole="button"
          accessibilityLabel={t('addrTitle', lang)}
          style={({ pressed }) => [s.address, pressed && s.pressed]}
        >
          {/* `font-size:19px;font-weight:700;letter-spacing:-.022em` in the
              display face — `Ilova.dc.html:107`. It was `text.title`, which is
              20px at the section-heading tracking. */}
          <Text style={[s.addrLine, { color: c.fg }]} numberOfLines={1}>
            {address?.label ?? t('addrTitle', lang)}
          </Text>
          <Chevron direction="down" size={15} />
        </Pressable>

        <Text style={[text.caption, { color: c.fgSubtle, marginTop: 2 }]} numberOfLines={1}>
          {soonest === undefined
            ? (address?.address ?? t('addrSub', lang))
            : fill(t('addrNote', lang), {
                window: fill(t('window', lang), {
                  from: soonest.minutesFrom,
                  to: soonest.minutesTo,
                }),
              })}
        </Text>
      </View>

      <FlatList
        data={stores}
        keyExtractor={(store) => store.id}
        contentContainerStyle={s.list}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={<Empty title={t('none', lang)} body={t('noneSub', lang)} />}
        ListHeaderComponent={
          <View>
            {directory.live ? null : (
              /* Said above the list rather than under it: a guest who orders
                 from a demo card is a guest who thinks they have ordered
                 dinner. */
              <Pressable onPress={directory.reload} accessibilityRole="button" style={s.demo}>
                <Text style={[s.meta, { color: c.warnFg }]}>
                  {sampleNote(directory.problem, lang)}
                </Text>
              </Pressable>
            )}

            {/* ------------------------------------------------ verticals */}
            <FlatList
              horizontal
              showsHorizontalScrollIndicator={false}
              style={s.rail}
              contentContainerStyle={s.railInner}
              /* The eight the app's design draws, not the website's fifteen —
                 `APP_VERTICALS` says which, and why. */
              data={[
                { key: 'all', label: t('allChip', lang), live: true, count: 0 },
                ...VERTICALS.filter((entry) => APP_VERTICALS.includes(entry.key)).map((entry) => ({
                  key: entry.key,
                  label: entry.label[lang],
                  live: entry.live,
                  count: entry.count,
                })),
              ]}
              keyExtractor={(entry) => entry.key}
              renderItem={({ item }) => {
                const on = item.key === vertical;

                return (
                  <Pressable
                    onPress={() =>
                      item.live
                        ? setVertical(item.key)
                        : flash(fill(t('verticalSoon', lang), { name: item.label }))
                    }
                    accessibilityRole="button"
                    accessibilityState={{ selected: on, disabled: !item.live }}
                    style={({ pressed }) => [
                      s.chip,
                      {
                        borderRadius: size.radiusPill,
                        // `[data-chip][data-on]{background:var(--brand);
                        // color:#fff;border-color:var(--brand)}` — Ilova:52.
                        // It was the `[data-pill]` on-state, which is the
                        // foreground colour and belongs to the guest menu.
                        borderColor: on ? c.brand : c.border,
                        backgroundColor: on ? c.brand : c.surface,
                      },
                      pressed && s.pressed,
                    ]}
                  >
                    <Text
                      style={[
                        s.chipLine,
                        { color: on ? ON_TINT : item.live ? c.fg : c.fgDisabled },
                      ]}
                    >
                      {item.label}
                    </Text>
                  </Pressable>
                );
              }}
            />

            {/* ------------------------------------------------- cuisines */}
            <FlatList
              horizontal
              showsHorizontalScrollIndicator={false}
              style={s.rail}
              contentContainerStyle={s.cuisines}
              /* Eight circles, in the app design's order. */
              data={CUISINES.filter((entry) => APP_CUISINES.includes(entry.key))}
              keyExtractor={(entry) => entry.key}
              renderItem={({ item }) => {
                const on = item.key === cuisine;

                return (
                  <Pressable
                    onPress={() => setCuisine(on ? null : item.key)}
                    accessibilityRole="button"
                    accessibilityState={{ selected: on }}
                    style={({ pressed }) => [s.cuisine, pressed && s.pressed]}
                  >
                    <View
                      style={[
                        s.monogram,
                        {
                          borderColor: on ? c.brandLine : c.border,
                          backgroundColor: on ? c.brandSoft : c.surface,
                        },
                      ]}
                    >
                      <Text style={[s.monogramLine, { color: on ? c.brandDark : c.fgMuted }]}>
                        {item.short}
                      </Text>
                    </View>
                    <Text style={[s.cuisineLabel, { color: c.fgMuted }]} numberOfLines={1}>
                      {item.label[lang]}
                    </Text>
                  </Pressable>
                );
              }}
            />

            {/* ---------------------------------------------------- promo */}
            {banner === undefined ? null : (
              <Pressable
                onPress={() => {
                  const next = !offersOnly;

                  setOffersOnly(next);
                  flash(next ? t('promoFlash_offer', lang) : t('seeAllFlash', lang));
                }}
                accessibilityRole="button"
                accessibilityState={{ selected: offersOnly }}
                style={({ pressed }) => [
                  s.promo,
                  {
                    borderColor: offersOnly ? c.bad : c.border,
                    backgroundColor: c.surface,
                  },
                  pressed && s.pressed,
                ]}
              >
                {/*
                 * The design's 132px picture block — `Ilova.dc.html:131`.
                 *
                 * Drawn as the flat tinted panel its `image-slot` renders as,
                 * for the reason the store cards use one: nothing on this
                 * platform has uploaded a photograph, and a grey rectangle
                 * pretending to be one is a loading state that never resolves.
                 * The height and the divider under it are the design's, so the
                 * card is the right shape when a picture does arrive.
                 */}
                <View style={[s.promoMedia, { backgroundColor: c.sunken }]} />

                <View style={[s.promoBody, { borderTopColor: c.divider }]}>
                  <Text style={[text.caps, { color: c.badFg }]}>{t('promoTag_offer', lang)}</Text>
                  <Text style={[s.promoHead, { color: c.fg }]}>{t('promoH_offer', lang)}</Text>
                  <Text style={[s.meta, { color: c.fgMuted, marginTop: 4 }]}>
                    {t('promoP_offer', lang)}
                  </Text>
                  {/*
                   * The one line the design does not draw, and it earns its
                   * place: the design's banner is a picture, this one is the
                   * only way into the offers filter, and a card that filters
                   * without saying so is a card that surprises.
                   */}
                  <Text style={[s.meta, { color: c.brand, marginTop: 8, ...sans(600) }]}>
                    {offersOnly ? t('seeAll', lang) : t('promoCta_offer', lang)}
                  </Text>
                </View>
              </Pressable>
            )}

            {/* -------------------------------------------------- section */}
            <View style={s.section}>
              {/* `font-size:19px;font-weight:700;letter-spacing:-.02em` — :141. */}
              <Text style={[s.sectionHead, { color: c.fg }]}>{t('nearH', lang)}</Text>
              <Text style={[s.meta, text.num, { color: c.fgSubtle }]}>
                {filtered
                  ? fill(t('found', lang), { n: stores.length })
                  : fill(t('storeCount', lang), { n: groupDigits(stores.length) })}
              </Text>
            </View>
          </View>
        }
        renderItem={({ item }) => (
          <StoreCard
            store={item}
            lang={lang}
            onOpen={() => {
              if (!item.open) {
                flash(fill(t('closedFlash', lang), { name: item.name }));

                return;
              }

              router.push(`/mp/store/${item.id}`);
            }}
          />
        )}
      />

      <AddressSheet
        open={sheet}
        addresses={book}
        selected={address?.key ?? null}
        /* The basket's shop, when there is one. Opening this header before
           choosing a shop leaves it empty, and the sheet then says nothing
           about reach rather than guessing at a boundary that does not exist
           yet — see its docblock. */
        zones={basketStore?.zones ?? []}
        onPick={(picked) => basket.setAddress(picked)}
        onClose={() => setSheet(false)}
      />

      <Notice note={note} bottom={size.sp4} />
    </View>
  );
}

/**
 * White that stays white.
 *
 * The marketplace's `--n-0` is the page ground, and on dark that is `#0B0E16` —
 * so `c.n0` is near-black there. Four labels on this screen sit on a colour of
 * their own rather than on the theme's: the store's initials over its tint, the
 * offer badge over its accent, the closed veil, and a selected chip over the
 * brand. The design writes `color:#fff` literally on each (`Ilova.dc.html:151`,
 * `:153`), and it has to be a literal for the same reason: the ground under
 * them does not follow the theme, so the ink on them must not either.
 */
const ON_TINT = '#fff';

/**
 * One store, as a card the whole of which is the target.
 *
 * There are no photographs — `logo_url` and `cover_url` come back null until
 * somebody uploads one — so the flat `tint` every card carries for exactly this
 * purpose stands in, with the initials over it. A grey rectangle would make
 * eight cards look like eight loading states.
 */
function StoreCard({
  store,
  lang,
  onOpen,
}: {
  store: LiveStore;
  lang: 'uz' | 'ru' | 'en';
  onOpen: () => void;
}) {
  const c = useMpTheme();
  const sh = useMpShadows();

  const badge =
    store.offerTone === 'danger' ? c.bad : store.offerTone === 'warning' ? c.warn : c.brand;

  return (
    <Pressable
      onPress={onOpen}
      accessibilityRole="button"
      accessibilityLabel={store.name}
      style={({ pressed }) => [
        s.card,
        /* `border-radius:16px;box-shadow:var(--sh-card)` — :147. It was
           `radiusLg` (14) with no shadow at all. */
        { borderColor: c.border, backgroundColor: c.surface, boxShadow: sh.card },
        pressed && s.pressed,
      ]}
    >
      <View style={[s.media, { backgroundColor: store.tint }]}>
        <Text style={[text.display, { color: ON_TINT }]}>{store.initials}</Text>

        {/* `left:11;top:11;height:24;padding:0 10;border-radius:7px;
            font-size:11px;font-weight:700` — :151. */}
        {store.offer === undefined ? null : (
          <View style={[s.badge, { backgroundColor: badge }]}>
            <Text style={[s.badgeLine, { color: ON_TINT }]}>{store.offer[lang]}</Text>
          </View>
        )}

        {store.open ? null : (
          <>
            {/* Two views rather than one: `opacity` on a parent dims its
                children too, and the word has to stay readable. */}
            {/* `background:rgba(15,19,32,.62)` over the picture, with the
                word at `13px/600` on it — :153. */}
            <View style={[StyleSheet.absoluteFill, s.veil, { backgroundColor: c.n900 }]} />
            <View style={[StyleSheet.absoluteFill, s.veilText]}>
              <Text style={[s.veilLine, { color: ON_TINT }]}>{t('closedAt', lang)}</Text>
            </View>
          </>
        )}
      </View>

      <View style={s.body}>
        <View style={s.titleRow}>
          {/* `font-size:16px;font-weight:700;letter-spacing:-.016em` in the
              display face — :159. */}
          <Text style={[s.name, { color: c.fg }]} numberOfLines={1}>
            {store.name}
          </Text>
          <View style={s.rating}>
            <Star size={13} />
            {/* `13px/700` then `11px` in `--fg-subtle` — :162-163. */}
            <Text style={[s.rate, text.num, { color: c.fg }]}>{store.rating.toFixed(1)}</Text>
            <Text style={[s.meta2xs, text.num, { color: c.fgSubtle }]}>
              {fill(t('reviews', lang), { n: groupDigits(store.reviews) })}
            </Text>
          </View>
        </View>

        <Text style={[s.meta, { color: c.fgSubtle, marginTop: 3 }]} numberOfLines={1}>
          {store.kind[lang]}
        </Text>

        <View style={s.foot}>
          <Text style={[s.meta, text.num, { color: c.fgMuted }]}>
            {fill(t('window', lang), { from: store.minutesFrom, to: store.minutesTo })}
          </Text>
          {/* No distance unless one was measured. The directory is asked without
              a coordinate — see `storeDirectory()` — so `0 km` would be a card
              claiming the restaurant is next door. */}
          {store.distanceMetres === null ? null : (
            <>
              <Text style={[s.meta, { color: c.borderStrong }]}>·</Text>
              <Text style={[s.meta, text.num, { color: c.fgMuted }]}>
                {fill(t('km', lang), { n: store.distanceKm })}
              </Text>
            </>
          )}
          <Text style={[s.meta, { color: c.borderStrong }]}>·</Text>
          <Text
            style={[
              s.meta,
              text.num,
              store.deliveryFee === 0 ? { color: c.okFg, ...sans(700) } : { color: c.fgMuted },
            ]}
          >
            {store.deliveryFee === 0 ? t('freeDelivery', lang) : som(store.deliveryFee, lang)}
          </Text>
        </View>
      </View>
    </Pressable>
  );
}

/*
 * Every number below is the design's own — `MyPOS Marketplace - Ilova.dc.html`,
 * with the line it comes from. The screen was built against a spacing scale
 * (18 → sp5 = 20, 13/15 → sp4 = 16, 14 → sp4 = 16) and a type ladder that has
 * no 19px and no 16px step, so nothing on it was the width the design draws.
 */
const s = StyleSheet.create({
  fill: { flex: 1 },
  /* `padding:6px 18px 12px` — :105. */
  head: { paddingHorizontal: 18, paddingTop: 6, paddingBottom: 12 },
  address: { flexDirection: 'row', alignItems: 'center', gap: 7, minHeight: 44 },
  /* `font-size:19px;font-weight:700;letter-spacing:-.022em` in Inter Tight. */
  addrLine: { ...display(700), fontSize: 19, letterSpacing: -0.42, flexShrink: 1 },
  demo: { paddingHorizontal: 18, paddingBottom: 12, minHeight: 44 },
  list: { paddingBottom: 20, gap: 14 },
  rail: { flexGrow: 0 },
  /* `gap:8;padding:0 18px 14px` — :115. */
  railInner: { gap: 8, paddingHorizontal: 18, paddingBottom: 14 },
  /* `height:34;padding:0 14px;border:1px solid;border-radius:999px` — :117. */
  chip: {
    height: 34,
    minHeight: 34,
    paddingHorizontal: 14,
    justifyContent: 'center',
    borderWidth: 1,
  },
  /* `font-size:13px;font-weight:500` — :117. It was 13/400. */
  chipLine: { ...sans(500), fontSize: 13, lineHeight: 16 },
  /* `gap:16;padding:0 18px 18px` — :121. */
  cuisines: { gap: 16, paddingHorizontal: 18, paddingBottom: 18 },
  cuisine: { width: 64, alignItems: 'center', gap: 7 },
  /* `56×56;border-radius:17px;border:1px solid` — :124. */
  monogram: {
    width: 56,
    height: 56,
    borderRadius: 17,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  /* `font-family:'Inter Tight';font-size:16px;font-weight:700;letter-spacing:-.02em`. */
  monogramLine: { ...display(700), fontSize: 16, letterSpacing: -0.32 },
  /* `font-size:11px;font-weight:500;line-height:1.2;text-align:center` — :125. */
  cuisineLabel: { ...sans(500), fontSize: 11, lineHeight: 13, textAlign: 'center' },
  /* `border:1px solid;border-radius:16px;overflow:hidden` — :130. */
  promo: { marginHorizontal: 18, borderWidth: 1, borderRadius: 16, overflow: 'hidden' },
  /* `height:132px` — :131. */
  promoMedia: { height: 132 },
  /* `padding:13px 15px 15px;border-top:1px solid var(--divider)` — :132. */
  promoBody: { paddingTop: 13, paddingHorizontal: 15, paddingBottom: 15, borderTopWidth: 1 },
  /* `font-size:17px;font-weight:700;letter-spacing:-.018em;line-height:1.25;
     margin-top:5` in the display face — :134. */
  promoHead: { ...display(700), fontSize: 17, lineHeight: 21, letterSpacing: -0.31, marginTop: 5 },
  /* `padding:24px 18px 0` — :139. */
  section: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: 12,
    paddingHorizontal: 18,
    paddingTop: 24,
  },
  /* `font-size:19px;font-weight:700;letter-spacing:-.02em` — :141. */
  sectionHead: { ...display(700), fontSize: 19, lineHeight: 24, letterSpacing: -0.38 },
  /* The design's 12px meta line, which this screen draws eleven times. */
  meta: { ...sans(400), fontSize: 12, lineHeight: 17 },
  /* And its 11px sibling, on the review count. */
  meta2xs: { ...sans(400), fontSize: 11, lineHeight: 15 },
  /* `gap:14px;padding:14px 18px 0` — :145. The list gap carries the 14. */
  card: { marginHorizontal: 18, borderWidth: 1, borderRadius: 16, overflow: 'hidden' },
  /* `height:150px` — :148. */
  media: { height: 150, alignItems: 'center', justifyContent: 'center' },
  badge: {
    position: 'absolute',
    left: 11,
    top: 11,
    height: 24,
    paddingHorizontal: 10,
    borderRadius: 7,
    justifyContent: 'center',
  },
  /* `font-size:11px;font-weight:700` — :151. */
  badgeLine: { ...sans(700), fontSize: 11, lineHeight: 14 },
  /* `rgba(15,19,32,.62)` — the ground colour at 62%. */
  veil: { opacity: 0.62 },
  veilText: { alignItems: 'center', justifyContent: 'center' },
  /* `font-size:13px;font-weight:600` — :153. */
  veilLine: { ...sans(600), fontSize: 13, lineHeight: 17 },
  /* `padding:13px 15px 15px` — :156. */
  body: { paddingTop: 13, paddingHorizontal: 15, paddingBottom: 15 },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: 10,
  },
  /* `font-size:16px;font-weight:700;letter-spacing:-.016em` in Inter Tight. */
  name: { ...display(700), fontSize: 16, lineHeight: 20, letterSpacing: -0.26, flexShrink: 1 },
  rating: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  /* `font-size:13px;font-weight:700` — :162. */
  rate: { ...sans(700), fontSize: 13, lineHeight: 17 },
  /* `gap:7;margin-top:8` — :166. */
  foot: { flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: 8 },
  /* `[data-press]:active{transform:scale(.97)}` — the design's own press. */
  pressed: { transform: [{ scale: 0.97 }] },
});
