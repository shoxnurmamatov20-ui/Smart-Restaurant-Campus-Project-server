import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { Path, Svg } from 'react-native-svg';
import { fill, t } from '@restaurant/surfaces/mp/copy';

import { needsSignIn, rateOrder, sampleNote, useMyOrders, type LiveOrder } from '@/mp/live';
import { SignInSheet } from '@/mp/sign-in-sheet';
import { Empty, PRESSED } from '@/ui/primitives';
import { Notice, useNotice } from '@/ui/notice';
import { useLocale } from '@/lib/locale';
import { som } from '@/lib/money';
import { useMpShadows, useMpTheme } from '@/lib/theme-context';
import { size } from '@/theme';
import { display, displayAt, sans, sansAt, text } from '@/type';

/**
 * MyPOS, screen 5 — the order history.
 *
 * `Ilova.dc.html:358-392`. Two tabs and four states, and the four are the point:
 * one live, two delivered — one of them still unrated — and one the guest
 * cancelled. A list that only ever drew delivered orders would never show the
 * row somebody actually opens this screen for.
 *
 * **The stars are in the row, not behind a "rate" button.** A delivered order a
 * person is glancing at is the moment they will give a rating; a screen they
 * have to open first is a rating that never arrives. That is the design's
 * decision and the reason the strip appears only on the row it belongs to.
 *
 * **The palette is MyPOS's own** (`useMpTheme`), not the restaurant console's:
 * this screen is drawn in `MyPOS Marketplace - Ilova.dc.html`, whose `--ok`,
 * `--bad` and `--sunken` are a different set of hexes from the ones
 * `theme.ts` carries. Drawn on the restaurant palette, the row accents were
 * saying a state in the wrong product's colour.
 *
 * `GET /mp/orders` answers the guest's own thirty most recent, across every
 * restaurant they have ordered from — their history crosses tenants because they
 * do. `POST /mp/orders/{number}/rate` is what a star sends, and the server
 * refuses a second one (`marketplace.already_rated`), so the strip disappears
 * from a row the moment it has been used rather than inviting a rating that
 * cannot land.
 */
export default function MarketplaceOrders() {
  const c = useMpTheme();
  const sh = useMpShadows();
  const { lang } = useLocale();
  const { note, say: flash } = useNotice();

  const orders = useMyOrders(lang);

  const [tab, setTab] = useState<'active' | 'history'>('active');
  const [signIn, setSignIn] = useState(false);
  /* What this device has just sent, per order — the strip fills in before the
     round trip finishes, and the reload behind it makes the answer permanent. */
  const [given, setGiven] = useState<Record<string, number>>({});

  const shown = useMemo(
    () =>
      orders.data.filter((order) =>
        tab === 'active' ? order.state === 'live' : order.state !== 'live',
      ),
    [orders.data, tab],
  );

  const rate = async (order: LiveOrder, stars: number) => {
    setGiven((current) => ({ ...current, [order.number]: stars }));

    const sent = await rateOrder(order.number, stars, lang);

    if (!sent.ok) {
      // Put the strip back where it was: a star that stayed lit after a refusal
      // is a guest believing they have said something they have not.
      setGiven((current) => {
        const { [order.number]: _dropped, ...rest } = current;

        return rest;
      });
      flash(sent.message ?? t('placeFailed', lang), 'problem');

      return;
    }

    flash(t('rateThanks', lang));
    orders.reload();
  };

  return (
    <View style={s.fill}>
      <FlatList
        data={shown}
        keyExtractor={(order) => order.number}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={s.list}
        /* The design's `display:grid;gap:10px` (:366) — between rows and nowhere
           else. As a `gap` on the content container it also fell between the
           header and the first card, so the segment sat 26px above the list
           where the drawing puts 16. */
        ItemSeparatorComponent={Gap}
        ListEmptyComponent={<Empty title={t('ordersEmpty', lang)} />}
        ListHeaderComponent={
          <View>
            <Text style={[displayAt(700, 21), { color: c.fg }]}>{t('ordersH', lang)}</Text>

            {orders.live ? null : (
              <Pressable
                onPress={() => (needsSignIn(orders.problem) ? setSignIn(true) : orders.reload())}
                accessibilityRole="button"
                style={s.demo}
              >
                <Text style={[text.caption, { color: c.warnFg }]}>
                  {sampleNote(orders.problem, lang)}
                </Text>
              </Pressable>
            )}

            {/* `gap:2px;padding:3px;background:var(--sunken);border-radius:10px`
                (:361). The tabs are written out here rather than taken from the
                `Segmented` primitive because this block is the design's larger
                variant — `height:32px;border-radius:8px;font-size:12px` (:363)
                against the primitive's 30/7/11. */}
            <View style={[s.segment, { backgroundColor: c.sunken }]}>
              {(['active', 'history'] as const).map((key) => {
                const on = key === tab;

                return (
                  <Pressable
                    key={key}
                    onPress={() => setTab(key)}
                    accessibilityRole="tab"
                    accessibilityState={{ selected: on }}
                    /* 32 drawn, 44 reachable: the target belongs on the slop,
                       not on the box — a taller box is a taller track. */
                    hitSlop={{ top: 6, bottom: 6 }}
                    style={({ pressed }) => [
                      s.segmentTab,
                      /* `[data-seg][data-on="true"]{background:var(--surface);
                         color:var(--fg);box-shadow:var(--sh-card)}` (:57). The
                         lift is what separates the thumb from the track; on a
                         dark phone surface-on-sunken alone is nearly nothing. */
                      on && { backgroundColor: c.surface, boxShadow: sh.card },
                      pressed && PRESSED,
                    ]}
                  >
                    <Text style={[s.segmentLabel, { color: on ? c.fg : c.fgMuted }]}>
                      {t(key === 'active' ? 'ordersActive' : 'ordersHistory', lang)}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        }
        renderItem={({ item }) => (
          <OrderRow
            order={item}
            lang={lang}
            rated={given[item.number] ?? item.rating ?? 0}
            onOpen={() => {
              /* Every row opens its own order rather than only the live one:
                 the number is in the URL, so a delivered order still shows its
                 ladder, its stamps and what was in it. */
              router.navigate(`/mp/track?order=${encodeURIComponent(item.number)}`);
            }}
            onRate={(stars) => void rate(item, stars)}
          />
        )}
      />

      <SignInSheet
        open={signIn}
        onClose={() => setSignIn(false)}
        onDone={() => {
          setSignIn(false);
          orders.reload();
        }}
        announce={flash}
      />

      <Notice note={note} bottom={size.sp4} />
    </View>
  );
}

const Gap = () => <View style={s.gap} />;

function OrderRow({
  order,
  lang,
  rated,
  onOpen,
  onRate,
}: {
  order: LiveOrder;
  lang: 'uz' | 'ru' | 'en';
  rated: number;
  onOpen: () => void;
  onRate: (stars: number) => void;
}) {
  const c = useMpTheme();

  /* The accent is the state, said in a colour — and the word beside it says the
     same thing, because a colour alone is not a state to somebody who cannot
     tell green from grey. The four are the fixture's own: brand, ok,
     border-strong for a settled order and bad for a cancelled one (:589-594). */
  const accent =
    order.state === 'live'
      ? c.brand
      : order.state === 'delivered'
        ? c.ok
        : order.state === 'cancelled'
          ? c.bad
          : c.borderStrong;

  return (
    <View
      style={[
        s.card,
        {
          borderColor: c.border,
          borderLeftColor: accent,
          backgroundColor: c.surface,
          borderRadius: size.radiusLg,
        },
      ]}
    >
      <Pressable
        onPress={onOpen}
        accessibilityRole="button"
        accessibilityLabel={`${order.store} · ${order.number}`}
        /* `padding:15px 16px` (:368). With a rate strip under it the card's
           bottom padding moves to the strip, because the design's `margin-top:
           11px` (:381) is measured from the row above, not from a 15px gap. */
        style={({ pressed }) => [s.cardBody, order.canRate && s.cardBodyRated, pressed && PRESSED]}
      >
        <View style={s.cardTop}>
          <Text style={[text.body, s.store, { color: c.fg }]} numberOfLines={1}>
            {order.store}
          </Text>
          {/* The file's only `data-mono` element (:371) — JetBrains Mono at 11px.
              That face is not bundled and bundling a third family for four
              digits is not worth the binary, so it is Inter with its tabular
              figures at the design's size. Recorded rather than silently
              rounded to `text.caption`, which drew it at 12. */}
          <Text style={[s.number, text.num, { color: c.fgSubtle }]}>{order.number}</Text>
        </View>

        {/*
         * What was in it — `{{o.items}}` at `font-size:12px;color:var(--fg-muted);
         * margin-top:4px` (:369).
         *
         * The row carried shop, number, state and total only, so two orders from
         * the same shop were indistinguishable in a guest's own history. The
         * endpoint has always sent the lines (`ordersOf()` eager-loads them);
         * what was missing was the mapping, which is now `contentsOf()` in
         * `src/mp/live.ts`. Empty on a demo row, and then the line is not drawn
         * rather than left as an empty gap.
         */}
        {order.contents === '' ? null : (
          <Text style={[s.contents, { color: c.fgMuted }]} numberOfLines={1}>
            {order.contents}
          </Text>
        )}

        <View style={s.cardFoot}>
          <View style={s.state}>
            <View style={[s.dot, { backgroundColor: accent }]} />
            {/* `color:{{o.stFg}}`, and `stFg` is `var(--fg)` on every row
                (:375, :739) — the dot carries the state, the word stays as
                readable as the shop's name above it. */}
            {/*
             * The state AND the minutes — "Kuryer yo'lda · 9 daqiqa" (:375).
             * The row said the state alone, and the minutes are the one thing a
             * person opens this screen for. `eta_at` has always been in the
             * payload; `orderFrom()` now keeps it.
             */}
            <Text style={[s.stateWord, { color: c.fg }]}>
              {order.state === 'live' && order.minutesLeft !== null
                ? `${t('state_live', lang)} · ${fill(t('minutesLeft', lang), { n: order.minutesLeft })}`
                : t(`state_${order.state}` as 'state_past', lang)}
            </Text>
          </View>
          <Text style={[s.total, text.num, { color: c.fg }]}>{som(order.total, lang, false)}</Text>
        </View>
      </Pressable>

      {order.canRate ? (
        <View style={[s.stars, { borderTopColor: c.divider }]}>
          {[1, 2, 3, 4, 5].map((n) => (
            <Pressable
              key={n}
              onPress={() => onRate(n)}
              accessibilityRole="button"
              accessibilityLabel={fill(t('star', lang), { n })}
              /* 19pt of star, 44pt of reach — taken vertically, because the
                 neighbouring star is 7px away and overlapping slops would post
                 a rating the guest did not press. */
              hitSlop={{ top: 13, bottom: 12, left: 3, right: 4 }}
              style={({ pressed }) => [s.star, pressed && PRESSED]}
            >
              <RateStar
                tint={n <= rated ? c.star : 'transparent'}
                line={n <= rated ? c.star : c.borderStrong}
              />
            </Pressable>
          ))}
          <Text style={[s.rateNote, { color: c.fgSubtle }]} numberOfLines={1}>
            {rated > 0 ? t('rateThanks', lang) : t('rateNote', lang)}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

/**
 * The rate strip's star — `Ilova.dc.html:383`.
 *
 * `19×19` with **both** `fill` and `stroke` at `stroke-width:1.4`: an unrated
 * star is a hollow outline in `--border-strong`, not a solid grey one, and a
 * solid grey one reads as a rating already given. Drawn here rather than in
 * `@/ui/icons` because that `Star` is fill-only by design and is shared with
 * screens this change does not own.
 */
function RateStar({ tint, line }: { tint: string; line: string }) {
  return (
    <Svg width={19} height={19} viewBox="0 0 24 24">
      <Path
        d="m12 2.6 2.9 5.9 6.5.9-4.7 4.6 1.1 6.4L12 17.3l-5.8 3.1 1.1-6.4L2.6 9.4l6.5-.9L12 2.6Z"
        fill={tint}
        stroke={line}
        strokeWidth={1.4}
      />
    </Svg>
  );
}

const s = StyleSheet.create({
  fill: { flex: 1 },
  /* `padding:6px 18px 20px` (:359). */
  list: { paddingHorizontal: 18, paddingTop: 6, paddingBottom: 20 },
  gap: { height: 10 },
  demo: { paddingTop: size.sp3, minHeight: 44 },
  segment: {
    flexDirection: 'row',
    gap: 2,
    padding: 3,
    borderRadius: 10,
    marginTop: 14,
    marginBottom: 16,
  },
  segmentTab: {
    flex: 1,
    height: 32,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  segmentLabel: { ...sans(600), fontSize: 12 },
  /* `border:1px solid var(--border)` (:368) — a point, not a hairline: at @3x
     `1` drew this outline at a third of its weight and
     the rows read as flat panels. */
  card: { borderWidth: 1, borderLeftWidth: 3, overflow: 'hidden' },
  cardBody: { paddingVertical: 15, paddingHorizontal: 16 },
  cardBodyRated: { paddingBottom: 0 },
  cardTop: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: 10,
  },
  store: { flex: 1, ...sans(600) },
  /* `font-size:12px;margin-top:4px` — :369. */
  contents: { ...sansAt(400, 12, 1.45), marginTop: 4 },
  number: { ...sans(400), fontSize: 11 },
  cardFoot: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    marginTop: 9,
  },
  state: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  stateWord: { ...sans(600), fontSize: 12 },
  dot: { width: 6, height: 6, borderRadius: 3 },
  total: { ...display(700), fontSize: 15 },
  /* `gap:7px;margin-top:11px;padding-top:10px` (:381), and 16 of side padding
     to stand in the same column as the card body above it. The 15 at the bottom
     is the card's own — in the drawing the strip sits inside the button's
     padding box, and here it has to be a sibling so that a star can be pressed
     without opening the order. */
  stars: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    marginTop: 11,
    paddingTop: 10,
    paddingBottom: 15,
    paddingHorizontal: 16,
    borderTopWidth: 1,
  },
  star: { width: 19, height: 19, alignItems: 'center', justifyContent: 'center' },
  rateNote: { ...sans(400), fontSize: 11, flex: 1, marginLeft: 3 },
});
