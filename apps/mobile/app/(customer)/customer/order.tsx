import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Path, Svg } from 'react-native-svg';
import {
  copy,
  ORDER_STATE,
  ORDER_STATE_NOTE,
  PAY,
  PROBLEM,
  SHARED,
  TRACK,
} from '@restaurant/surfaces/customer/copy';
import {
  BRANCH_BY_ID,
  DISH_BY_ID,
  ORDER_LADDER,
  PORTION_BY_ID,
  say,
  TRACKED_ORDER,
  type OrderState,
  type TrackedOrder,
} from '@restaurant/surfaces/customer/data';
import { trackedOrderFrom, type TrackedOrderPayload } from '@restaurant/surfaces/customer/order';

import { trackOrder } from '@/customer/account';
import { Button, Empty, PRESSED } from '@/ui/primitives';
import { Check } from '@/ui/icons';
import { Notice, useNotice } from '@/ui/notice';
import { ProblemSheet } from '@/customer/problem-sheet';
import { cart, useCart } from '@/lib/cart';
import { useLocale } from '@/lib/locale';
import { som } from '@/lib/money';
import { useTheme } from '@/lib/theme-context';
import { raw, size } from '@/theme';
import { displayAt, sansAt, text, tracking } from '@/type';

/**
 * How often the screen asks again.
 *
 * Ten seconds, and polling rather than a socket. Reverb carries the kitchen and
 * the floor on `branch.{id}.*`, which are private channels and rightly not open
 * to strangers — a guest's phone has no session to authorise one with. Ten is
 * the interval at which a rung appearing still feels like it happened, and it
 * costs one indexed lookup by bill number.
 */
const POLL_MS = 10_000;

/**
 * Order status — `Smart Restaurant Mijoz ilovasi.dc.html`, screen 7.
 *
 * The ladder is the screen. Four rungs drawn as a vertical rail, the reached
 * ones stamped with the time they were reached and the rest dimmed, so a guest
 * sees both where the order is and how long each step took — which is what turns
 * "cooking" from a spinner into information.
 *
 * The states come from `orders.state` and are never stored as words. The POS
 * reads `cooking` as "Tayyorlanmoqda" and this screen reads it as "Oshxonada":
 * one row, two audiences, `DATABASE.md §6.1`.
 *
 * ---------------------------------------------------------------------------
 * Two credentials, and neither is a session
 *
 * `GET /api/v1/public/orders/{number}` takes the bill number AND the last four
 * digits of the phone that placed it. The pair is deliberate: bill numbers are
 * sequential per restaurant, so an endpoint answering on the number alone would
 * hand a stranger somebody's address and dinner one keystroke at a time.
 *
 * Both come from the cart store, which remembered them when the order was
 * placed — and both are held in memory only. A guest whose phone killed the app
 * while they were in Payme comes back to the sample, labelled as one, because
 * the alternative is asking a stranger's phone to prove something it no longer
 * knows.
 */
export default function OrderScreen() {
  const c = useTheme();
  const { lang } = useLocale();
  const router = useRouter();
  const basket = useCart();
  const { note, say: announce } = useNotice();
  const params = useLocalSearchParams<{ note?: string }>();

  const t = copy(TRACK, lang);
  const s = copy(SHARED, lang);
  const p = copy(PROBLEM, lang);
  const y = copy(PAY, lang);
  const states = copy(ORDER_STATE, lang);

  const [reporting, setReporting] = useState(false);
  const [live, setLive] = useState<TrackedOrder | null>(null);
  const [payload, setPayload] = useState<TrackedOrderPayload | null>(null);
  /**
   * Why there is no ladder to draw, when there is none.
   *
   * `trackedOrderFrom()` answers null for a bill that is not on the ladder, and
   * two very different things produce that null: an online order still waiting
   * for the money, and one that was voided, refunded or comped. To the person
   * holding the phone they are opposite instructions — "confirm it in the bank
   * app" against "this is not happening" — so the payment state is what tells
   * them apart.
   */
  const [stalled, setStalled] = useState<'gone' | 'unpaid' | null>(null);
  const [attempt, setAttempt] = useState(0);

  const number = basket.placed;
  const phone = basket.placedPhone;

  /*
   * The one sentence the payment screen could not say itself.
   *
   * `useNotice` is per screen — deliberately, so a message raised in the basket
   * cannot appear over the checkout — which means a notice raised just before a
   * navigation dies with the screen that raised it. The two that must survive
   * ride in the route: a promo the server refused, and a payment rail that
   * never opened. Announced once, on arrival.
   */
  const carried = typeof params.note === 'string' ? params.note : null;

  useEffect(() => {
    if (carried === 'promo') announce(y.promoNotApplied, 'problem');
    if (carried === 'rail') announce(y.railFailed, 'problem');
  }, [carried, announce, y.promoNotApplied, y.railFailed]);

  useEffect(() => {
    if (number === null || phone === null) return;

    let running = true;

    const ask = async () => {
      const answer = await trackOrder(lang, number, phone);

      if (!running) return;

      if (!answer.ok) {
        /*
         * A network blip leaves the last good state on the screen. Only a
         * refusal clears it — the number is not this guest's, or the bill has
         * been voided — because that is the one case where what is drawn is
         * wrong rather than merely old.
         */
        if (answer.code !== 'offline') setStalled('gone');

        return;
      }

      const mapped = trackedOrderFrom(answer.data);

      if (mapped === null) {
        setPayload(answer.data);
        setStalled(answer.data.payment?.state === 'pending' ? 'unpaid' : 'gone');

        return;
      }

      setPayload(answer.data);
      setLive(mapped);
      setStalled(null);
    };

    void ask();

    const timer = setInterval(() => void ask(), POLL_MS);

    return () => {
      running = false;
      clearInterval(timer);
    };
  }, [number, phone, lang, attempt]);

  if (number === null) {
    return (
      <View style={st.blank}>
        <Empty title={t.noneHeading} body={t.noneBody} />
        <Button kind="secondary" onPress={() => router.push('/customer/menu')}>
          {s.open}
        </Button>
      </View>
    );
  }

  if (stalled !== null) {
    /*
     * The poll is still running behind this — the effect does not care what the
     * screen draws — so an order whose payment lands a minute from now grows
     * its ladder without anybody tapping anything.
     */
    return (
      <View style={st.blank}>
        <Empty title={`№${number}`} body={stalled === 'unpaid' ? t.awaitingPayment : t.orderGone} />
        <Button kind="secondary" onPress={() => router.push('/customer/menu')}>
          {s.open}
        </Button>
      </View>
    );
  }

  /*
   * The live order when one has arrived, the design's sample until then — and
   * the screen says which. `demo` is not a styling flag: it is the difference
   * between "your dinner is twenty minutes away" and "this is what that will
   * look like", and a guest who cannot tell them apart waits for food nobody is
   * cooking.
   */
  const order = live ?? TRACKED_ORDER;
  const demo = live === null;
  /*
   * The venue's NAME, from the payload rather than from a lookup.
   *
   * The tracking endpoint sends it beside the id for exactly this reason: a
   * client holding only the id would have to resolve it through an endpoint a
   * guest cannot reach, and this app may be showing an order from a branch the
   * venue list has since dropped. The list and the fixtures are behind it, for
   * the sample order.
   */
  const branch =
    payload?.branch?.name ??
    basket.venues.branches.find((venue) => venue.id === order.branchId)?.name ??
    BRANCH_BY_ID.get(order.branchId)?.name;
  const reached = ORDER_LADDER.indexOf(order.state);
  const delivering = order.courier !== null;

  /*
   * What was ordered, as the bill records it.
   *
   * Titles come from the payload rather than from the catalogue: a bill is
   * settled history and its lines were frozen at the price and the name they
   * were sold under, while the menu may have moved since. The fixture path
   * still resolves through `DISH_BY_ID`, because a sample order is a sample of
   * the catalogue it came from.
   */
  /*
   * And what each line came to, which this screen did not draw at all.
   *
   * `Mijoz ilovasi.dc.html:548-550` ends every line with its own figure —
   * `<span data-num style="flex:none;font-size:var(--text-sm);font-weight:600">
   * {{l.total}}</span>` — and without it the "what you ordered" block was a
   * receipt with no money on it: a guest checking whether they were charged for
   * the second lavash had nothing to check against. The design's own arithmetic
   * is `lineTotal()`, `(price + size delta + extras) × qty`, which is what the
   * fixture branch reproduces; a live line already carries the figure it was
   * rung up at and is never recomputed here.
   */
  const lines =
    payload === null
      ? order.lines.map((line) => {
          const dish = DISH_BY_ID.get(line.dishId);
          const portion = PORTION_BY_ID.get(line.portionId);

          return {
            key: `${line.dishId}|${line.portionId}`,
            quantity: line.quantity,
            title: dish === undefined ? '' : say(dish.name, lang),
            note: portion === undefined ? '' : say(portion.name, lang),
            total:
              dish === undefined
                ? 0
                : (dish.price + (portion === undefined ? 0 : portion.delta)) * line.quantity,
          };
        })
      : (payload.lines ?? [])
          .filter((line) => line.status !== 'cancelled')
          .map((line, index) => ({
            key: `${String(line.menu_item_id ?? index)}|${index}`,
            quantity: line.quantity,
            title: line.title ?? '',
            note: '',
            total:
              typeof line.total_price === 'number'
                ? line.total_price
                : line.unit_price * line.quantity,
          }));

  return (
    <View style={st.fill}>
      <ScrollView contentContainerStyle={st.page} showsVerticalScrollIndicator={false}>
        {/*
         * The heading and the bill number share one baseline.
         *
         * `Mijoz ilovasi.dc.html:498-501` draws them as a single row —
         * `align-items:baseline;justify-content:space-between;gap:12px` — with
         * the number pushed to the right edge at `--text-xs` in `--fg-subtle`.
         * This screen stacked them instead, so the number read as a subtitle of
         * the heading rather than as the label of the order below it, and the
         * whole page started 16px lower than the drawing.
         */}
        <View style={st.head}>
          <Text style={[text.title, st.headTitle, { color: c.fg }]} numberOfLines={1}>
            {t.heading}
          </Text>
          <Text
            style={[sansAt(400, 12), text.num, st.headNumber, { color: c.fgSubtle }]}
            numberOfLines={1}
          >
            №{demo ? order.number : number}
            {branch === undefined || branch === null ? '' : ` · ${branch}`}
          </Text>
        </View>

        {/* Said out loud, and pressable: the usual cause is a minute of no
            signal, and asking again costs less than closing the app. */}
        {demo ? (
          <Pressable
            onPress={() => setAttempt((count) => count + 1)}
            accessibilityRole="button"
            style={[st.demo, { backgroundColor: c.warning50, borderColor: c.warning500 }]}
          >
            <Text style={[text.caption, { color: c.warning700 }]}>{t.sampleOrder}</Text>
          </Pressable>
        ) : null}

        {/* ------------------------------------------------------------ eta */}
        {/*
         * A plain surface card, centred, with the stage named under the time.
         *
         * Not the accent block: on this surface the accent means "an offer" —
         * the promo card and the loyalty strip both use it — so the one card
         * telling a guest where their dinner is would read as an advertisement.
         * The stage line matters as much as the figure: "20:15" answers when and
         * never answers what, which on a delivery is the actual question.
         */}
        <View
          style={[
            st.eta,
            { backgroundColor: c.surface, borderColor: c.border, borderRadius: size.radiusLg },
          ]}
        >
          <Text style={[sansAt(400, 12), { color: c.fgSubtle }]}>
            {delivering ? t.arriving : t.readyAt}
          </Text>
          {/* `font-size:var(--text-4xl)` — 38, not 30. The one figure the whole
              screen exists to show was drawn a full step down the scale
              (`text.display` is `--text-3xl`), which is why the card read as a
              caption with a time in it. `dc.html:505`. */}
          <Text style={[displayAt(700, 38), text.num, st.eta4xl, { color: c.fg }]}>
            {order.eta}
          </Text>
          <Text style={[text.small, { color: c.fgMuted, marginTop: 4 }]}>
            {states[order.state]}
            {order.courier === null ? '' : ` · ${order.courier.name}`}
          </Text>
        </View>

        {/* --------------------------------------------------------- ladder */}
        {/*
         * `done` is the rung BEHIND the current one, not including it.
         *
         * The design's own `steps` mapping (`dc.html:900-910`) reads
         * `done: i < ORD_STAGE`, and the distinction is the whole grammar of the
         * rail: a finished rung is a green disc with a tick in it, the one the
         * order is on is a solid brand disc with nothing in it, and the rest are
         * hollow rings. This screen passed `index <= reached`, which made the
         * step in progress look finished — a guest was told their dinner had
         * been delivered while the courier was still driving.
         */}
        <View style={st.ladder}>
          {ORDER_LADDER.map((state, index) => (
            <Rung
              key={state}
              state={state}
              at={order.times[state] ?? null}
              done={index < reached}
              current={index === reached}
              last={index === ORDER_LADDER.length - 1}
            />
          ))}
        </View>

        {/* -------------------------------------------------------- courier */}
        {order.courier === null ? null : (
          <View
            style={[
              st.courier,
              { backgroundColor: c.surface, borderColor: c.border, borderRadius: size.radiusLg },
            ]}
          >
            {/* `background:var(--brand-100);color:var(--brand-700)` at 13/700 —
                the design gives the courier a face in the brand, not a grey
                blob in `--bg-muted`. `dc.html:535`. */}
            <View
              style={[st.initials, { backgroundColor: c.brand100, borderRadius: size.radiusPill }]}
            >
              <Text style={[sansAt(700, 13), { color: c.brand700 }]}>{order.courier.initials}</Text>
            </View>

            <View style={st.courierMain}>
              <Text style={[sansAt(600, 13), { color: c.fg }]} numberOfLines={1}>
                {order.courier.name}
              </Text>
              <Text
                style={[sansAt(400, 12), text.num, st.courierSub, { color: c.fgMuted }]}
                numberOfLines={1}
              >
                {order.courier.vehicle}
              </Text>
            </View>

            {/*
             * A 40px round glyph, and no sentence under the card.
             *
             * `dc.html:540-542` draws the dialler as a circle — `width:40px;
             * height:40px;border:1px solid var(--border-strong);border-radius:
             * 50%;color:var(--brand-600)` around an 18px handset — beside the
             * courier's name, not as a full-width button under it. The word
             * "Qo'ng'iroq" and the note that followed said the same thing twice:
             * the masking promise is already spoken by `numberHidden` at the
             * moment it matters, when the call is placed.
             *
             * The number dialled is the restaurant's masking line rather than
             * the courier's own — which is what that promise means, and what a
             * guest can check in their call log afterwards.
             */}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t.callCourier}
              onPress={() => {
                announce(t.numberHidden);
                void Linking.openURL('tel:+998781000000');
              }}
              style={({ pressed }) => [
                st.call,
                {
                  backgroundColor: c.surface,
                  borderColor: c.borderStrong,
                  borderRadius: size.radiusPill,
                },
                pressed && PRESSED,
              ]}
            >
              <Svg width={18} height={18} viewBox="0 0 24 24" fill="none">
                <Path
                  d="M6.5 3h3l1.5 4-2 1.4a11 11 0 0 0 5.6 5.6L16 12l4 1.5v3a2 2 0 0 1-2.2 2A16.5 16.5 0 0 1 3 6.2A2 2 0 0 1 5 4z"
                  stroke={c.brand600}
                  strokeWidth={1.9}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </Svg>
            </Pressable>
          </View>
        )}

        {/* ------------------------------------------------------- contents */}
        {/* `--text-2xs` (11), not `--text-3xs` (10): every uppercase legend on
            this surface is drawn `font-size:var(--text-2xs);font-weight:600;
            letter-spacing:var(--tracking-caps);margin:22px 0 4px`, and
            `text.caps` is the 10px step. `dc.html:546`. */}
        <Text style={[text.label, st.legend, { color: c.fgSubtle }]}>{t.contents}</Text>

        {/*
         * Mapped, not a `FlatList`, and this is the exception the rule allows: a
         * virtualised list nested inside a `ScrollView` throws in React Native,
         * and what is here is one order's own lines — bounded by what a person
         * ate, never a feed. The same goes for the four rungs above.
         */}
        {/*
         * The count is part of the name, not a column of its own.
         *
         * `dc.html:549` puts them in one span — `<span data-num style="color:
         * var(--fg-subtle);font-weight:600">{{l.qty}}×</span> {{l.name}}` — so
         * "2×" sits against the dish it counts and everything after it moves
         * with the text. The 26pt `qty` column here left a gutter the design
         * does not draw and pushed every name inward by the width of a number
         * that is one character wide.
         *
         * The rule under the last line stays, too: the design draws
         * `border-bottom` on every row and gives the total no border of its
         * own — the last line's rule IS the total's rule.
         */}
        <View>
          {lines.map((line) =>
            line.title === '' ? null : (
              <View key={line.key} style={[st.orderLine, { borderColor: c.divider }]}>
                <Text style={[sansAt(400, 13), st.orderName, { color: c.fg }]} numberOfLines={1}>
                  <Text style={[sansAt(600, 13), text.num, { color: c.fgSubtle }]}>
                    {line.quantity}×
                  </Text>{' '}
                  {line.title}
                  {line.note === '' ? null : (
                    <Text style={{ color: c.fgSubtle }}> · {line.note}</Text>
                  )}
                </Text>
                {/* `F(lineTotal)` — the figure grouped, with no currency word:
                    the word is carried once, by the total under it. */}
                <Text style={[sansAt(600, 13), text.num, st.orderTotal, { color: c.fg }]}>
                  {som(line.total, lang, false)}
                </Text>
              </View>
            ),
          )}
        </View>

        <View style={st.grand}>
          <Text style={[sansAt(700, 15), { color: c.fg }]}>{s.total}</Text>
          {/* What it came to as charged. Historical, never recomputed: a total
              re-derived from today's menu is a receipt that changes after the
              fact. */}
          <Text style={[sansAt(700, 15), text.num, { color: c.fg }]}>{som(order.total, lang)}</Text>
        </View>

        {/* --------------------------------------------------------- repeat */}
        {/* `height:48px;margin-top:20px;border:1px solid var(--border-strong);
            font-size:var(--text-sm);font-weight:600` — `dc.html:557`. The
            primitive's default is the 52pt page CTA and its `text.button` is
            15px; this is the quieter one under a receipt. The two beside it
            take the same height so the group reads as one block. */}
        <View style={st.actions}>
          <Button
            kind="secondary"
            style={st.wide}
            height={48}
            textStyle={sansAt(600, 13)}
            onPress={() => {
              for (const line of order.lines) {
                cart.add({
                  dishId: line.dishId,
                  portionId: line.portionId,
                  modifierIds: [],
                  quantity: line.quantity,
                  note: '',
                });
              }

              /*
               * The confirmation stays here rather than jumping to the basket.
               * Sending the guest away would take them off the order they came
               * to check, which is not what "repeat" asked for; the cart tab's
               * count says the same thing without moving anybody.
               */
              announce(t.repeated);
            }}
          >
            {t.repeat}
          </Button>

          {/*
           * The two answers the design's bot asks for after a delivery, on the
           * surface that had neither.
           *
           * The rating appears only once the order is `handed`: asking somebody
           * to score a dinner a courier is still carrying is asking about
           * something that has not happened. The problem route is always on,
           * because the thing that went wrong may be why the ladder has stopped.
           */}
          <View style={st.pair}>
            {order.state === 'handed' ? (
              <Button
                kind="secondary"
                style={st.half}
                height={48}
                textStyle={sansAt(600, 13)}
                onPress={() => announce(p.rated)}
              >
                {p.rate}
              </Button>
            ) : null}

            <Button
              kind="secondary"
              style={st.half}
              height={48}
              textStyle={sansAt(600, 13)}
              onPress={() => setReporting(true)}
            >
              {p.report}
            </Button>
          </View>

          {/* A guest can cancel inside two minutes and can never edit. Saying
              where an edit goes instead beats a disabled button explaining
              nothing. */}
          <Text style={[text.caption, { color: c.fgSubtle }]}>{t.changeNote}</Text>
        </View>
      </ScrollView>

      <ProblemSheet
        about={`№${order.number}${branch === undefined || branch === null ? '' : ` · ${branch}`}`}
        open={reporting}
        onClose={() => setReporting(false)}
        onSent={announce}
      />

      <Notice note={note} />
    </View>
  );
}

/**
 * One rung, with the rail drawn beside it.
 *
 * The connector is a view of its own rather than a border on the row, because
 * the row's height follows the guest's chosen text size and a border would
 * stretch past the dot with it.
 */
function Rung({
  state,
  at,
  done,
  current,
  last,
}: {
  state: OrderState;
  at: string | null;
  done: boolean;
  current: boolean;
  last: boolean;
}) {
  const c = useTheme();
  const { lang } = useLocale();

  // No cast: `copy()` keeps the section's keys, and `OrderState` is exactly that
  // key union — so a state the catalogue forgot to word is a build error.
  const label = copy(ORDER_STATE, lang)[state];
  const note = copy(ORDER_STATE_NOTE, lang)[state];

  /*
   * Three states, three pairs of colours — `dc.html:906-908`.
   *
   *   done     ring and fill  var(--success-500)     with an 11px white tick
   *   current  ring and fill  var(--brand-500)       and nothing inside it
   *   ahead    ring var(--border-strong), fill var(--surface) — a hollow ring
   *
   * What was here was a filled 14px disc in `--accent-500`, and that is not a
   * near miss. On this surface the accent teal means "an offer" — the promo
   * card and the loyalty strip are both drawn in it — so the rail reporting a
   * delivery was wearing the colour reserved for a discount, while the green
   * the design uses to mean "this happened" appeared nowhere on the screen.
   *
   * The connector below a finished rung is `--success-500` too; below the
   * current one it is already `--border`, because nothing has happened there
   * yet.
   */
  const ring = done ? c.success500 : current ? c.brand500 : c.borderStrong;
  const fill = done ? c.success500 : current ? c.brand500 : c.surface;

  return (
    <View style={st.rung}>
      <View style={st.rail}>
        <View
          style={[
            st.dot,
            { backgroundColor: fill, borderColor: ring, borderRadius: size.radiusPill },
          ]}
        >
          {done ? <Check size={11} colour={c.n0} /> : null}
        </View>

        {last ? null : (
          <View style={[st.thread, { backgroundColor: done ? c.success500 : c.border }]} />
        )}
      </View>

      <View style={st.rungBody}>
        <View style={st.rungHead}>
          {/*
           * A rung ahead of the order is dimmed by COLOUR, not by opacity.
           *
           * The design says `color:{{s.fg}}` where `s.fg` is `--fg` up to and
           * including the current rung and `--fg-subtle` past it; the note
           * under it stays `--fg-muted` on every rung. Fading the whole block
           * to 45% took the note with it and put four labels at four different
           * contrast ratios, two of them under what a phone in daylight can
           * hold.
           */}
          <Text style={[sansAt(600, 15), { color: done || current ? c.fg : c.fgSubtle }]}>
            {label}
          </Text>
          {/* The design's own step data carries `t: "—"` for the rung nothing
              has happened on, so the times column never goes ragged. */}
          <Text style={[sansAt(400, 12), text.num, st.rungTime, { color: c.fgSubtle }]}>
            {at === null || at === '' ? '—' : at}
          </Text>
        </View>
        <Text style={[sansAt(400, 12, 1.5), st.rungNote, { color: c.fgMuted }]}>{note}</Text>
      </View>
    </View>
  );
}

/*
 * Every number below is the design's own, copied from
 * `Smart Restaurant Mijoz ilovasi.dc.html` lines 496-558 rather than rounded to
 * the nearest step of `size.*`. Where a `size.*` token happens to BE the
 * design's number it is used by name; where it is not, the literal wins.
 *
 * `1` appears nowhere any more: the design draws
 * `border:1px` and `width:2px`, and a hairline is a third of a point on a
 * modern phone — the ladder's rail was drawn a third of the weight it should
 * be, which is most of why the screen read as washed out.
 */
const st = StyleSheet.create({
  fill: { flex: 1 },
  blank: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: size.sp3 },
  /* `padding:6px 20px 24px` — the 20 is the tab layout's `sceneStyle`, so only
     the vertical pair belongs here. It was `paddingBottom: 40` and nothing on
     top. */
  page: { paddingTop: 6, paddingBottom: 24 },
  head: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: 12,
  },
  headTitle: { flexShrink: 1 },
  headNumber: { flexShrink: 1, textAlign: 'right' },
  demo: {
    marginTop: size.sp3,
    padding: size.sp3,
    borderWidth: 1,
    borderRadius: size.radiusMd,
  },
  /* `margin-top:16px;padding:20px;border:1px;border-radius:var(--radius-lg)`. */
  eta: {
    marginTop: size.sp4,
    paddingVertical: size.sp5,
    paddingHorizontal: size.sp5,
    alignItems: 'center',
    borderWidth: 1,
  },
  eta4xl: { marginTop: 4 },
  ladder: { marginTop: size.sp5 },
  /* `display:flex;gap:14px` between the rail and what it labels. */
  rung: { flexDirection: 'row', gap: 14 },
  /* `width:22px` — the column is exactly as wide as the disc in it. */
  rail: { width: 22, alignItems: 'center' },
  dot: {
    width: 22,
    height: 22,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  /* `width:2px;flex:1;min-height:34px`. */
  thread: { width: 2, flex: 1, minHeight: 34 },
  rungBody: { flex: 1, minWidth: 0, paddingBottom: size.sp4 },
  rungHead: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: 10,
  },
  /* `flex:none` — the clock never gives up room to a long label. */
  rungTime: { flexShrink: 0 },
  rungNote: { marginTop: 3 },
  /* `padding:15px 17px;gap:13px;border-radius:var(--radius-lg)`. The card had
     12 on all four sides and the 10pt `--radius-md`, and no top margin is
     needed: the last rung's own `padding-bottom:16px` is the gap. */
  courier: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 13,
    paddingVertical: 15,
    paddingHorizontal: 17,
    borderWidth: 1,
  },
  initials: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  courierMain: { flex: 1, minWidth: 0 },
  courierSub: { marginTop: 2 },
  /* `width:40px;height:40px;flex:none;border:1px solid var(--border-strong)`. */
  call: {
    width: 40,
    height: 40,
    flexShrink: 0,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  /* `margin:22px 0 4px`. */
  legend: {
    marginTop: 22,
    marginBottom: 4,
    textTransform: 'uppercase',
    letterSpacing: tracking(raw.trackingCaps, size.text2xs),
  },
  /* `padding:11px 0;gap:12px;border-bottom:1px solid var(--divider)`. */
  orderLine: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 12,
    paddingVertical: 11,
    borderBottomWidth: 1,
  },
  orderName: { flex: 1, minWidth: 0 },
  orderTotal: { flexShrink: 0 },
  /* `padding-top:13px` and no rule of its own — the last line supplies it. */
  grand: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: 12,
    paddingTop: 13,
  },
  /* `margin-top:20px` on the repeat button. */
  actions: { marginTop: 20, gap: size.sp2 },
  pair: { flexDirection: 'row', gap: size.sp2 },
  half: { flex: 1 },
  wide: { width: '100%' },
});
