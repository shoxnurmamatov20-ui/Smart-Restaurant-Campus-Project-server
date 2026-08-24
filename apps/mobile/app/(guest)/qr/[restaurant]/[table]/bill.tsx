import { useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { fill } from '@restaurant/surfaces/guest/copy';
import { translate } from '@restaurant/surfaces/guest/menu-data';
import {
  billTotals,
  cashRoundingDelta,
  percentOf,
  roundedForCash,
  splitEvenly,
  SERVICE_PERCENT,
  VAT_PERCENT,
} from '@restaurant/surfaces/money';
import {
  CARD_SCHEMES,
  GOLD_CARD_PERCENT,
  lineTotal,
  orderSubtotal,
  SPLIT_RANGE,
  TABLE_ORDER,
  TABLE_RAILS,
  TABLE_TIPS,
} from '@restaurant/surfaces/guest/table-data';

import { useGuestCopy } from '@/guest/copy';
import { useFlash } from '@/guest/flash';
import { askForBill, useTableOrder } from '@/guest/table';
import { ChevronLeft } from '@/guest/icons';
import { tableScreen, param, tableHref, useGuestBack } from '@/guest/route';
import { useLocale } from '@/lib/locale';
import { som } from '@/lib/money';
import { useTheme } from '@/lib/theme-context';
import { size } from '@/theme';
import { displayAt, sans, sansAt, text } from '@/type';
import { PRESSED } from '@/ui/primitives';

/**
 * The bill — `Mehmon.dc.html`, panel 05 (`dc:388-490`).
 *
 * The one screen on this surface that would move money, and it does not: there
 * is no public payment route. Everything else about it is real — the arithmetic
 * is the server's own, through `@restaurant/surfaces/money`, which mirrors
 * `App\Support\Orders\BillTotals::of()` line for line. The figure a guest reads
 * here is the figure the till would print, and the two cannot drift because
 * neither this file nor its web twin multiplies anything itself.
 *
 * Dine-in, so this is the one guest screen that carries a service charge — the
 * channel decides that, not the screen. The order the rules are applied in is
 * not cosmetic: discount off the food, service on what is left, VAT read **out
 * of** the sum rather than added to it. Charging service on a pre-discount
 * subtotal quietly turns a 5% discount into 4.5%, and the first guest to add up
 * their own bill finds it.
 *
 * Three things sit outside that total, each for its own reason: the **tip**,
 * which belongs to the waiter and never enters revenue; the **cash rounding**,
 * which exists only on the cash rail and is its own line because a guest handed
 * a figure 400 so'm off the one they just read is owed the sentence; and the
 * **split**, which divides what is owed without changing it. `dc:411-422` draws
 * that literally — the summary block is five rows and stops at QQS, and `Jami`
 * is `items + service − discount`, the figure the five rows add up to. All three
 * of the others were rows inside it, so a guest who added the column up got a
 * different number than the one printed under it.
 *
 * The button now does the half that is real. `POST /public/tables/{token}/pay`
 * raises a `bill` call on `branch.{id}.floor` and moves the bill to `topay`, so
 * a waiter walks over with a terminal and every screen in the building draws the
 * table as waiting rather than eating. The rail, the tip and the split ride
 * along as the guest's stated preference for that person to read. What still
 * does not happen is a card being charged — Finance owns that — which is why
 * `Namoyish rejimi · to'lov yuborilmadi` stays above the dock.
 */
export default function GuestBillScreen() {
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
  const back = useGuestBack(`${here}/status`);

  /*
   * The design opens on 5%, not 10% — `dc:584` is `tip: 1` against
   * `TIPS = [0, 5, 10, 15]`. Worth stating, because 10 looks like the obvious
   * default: a screen that pre-selects the second-largest chip is asking the
   * table for a figure the designer did not.
   */
  const [tipPercent, setTipPercent] = useState(5);
  const [railId, setRailId] = useState(TABLE_RAILS[0]?.id ?? 'card');
  /*
   * How many ways, and whether the panel is open — two pieces of state, not one.
   *
   * Behind a button because a guest paying the whole bill should not scroll
   * past a stepper offering to divide it. That is also what makes four a
   * sensible starting number: it is only ever seen by somebody who has already
   * said they want to split.
   */
  const [ways, setWays] = useState<number>(SPLIT_RANGE.start);
  const [splitOpen, setSplitOpen] = useState(false);

  /*
   * The table's own bill, from `GET /public/tables/{token}/order`.
   *
   * The fixture stands in for an API that did not answer, and for a table with
   * nothing open — on this screen the two draw the same way, because a bill
   * screen with no bill has nothing to show either way and says
   * `Namoyish rejimi` under the button in both cases.
   */
  const { state } = useTableOrder(restaurant, table, lang);
  const order = state.status === 'ready' ? state.order : TABLE_ORDER;
  const rail = TABLE_RAILS.find((option) => option.id === railId) ?? TABLE_RAILS[0];
  const subtotal = orderSubtotal(order);

  const bill = billTotals({
    subtotal,
    channel: 'dine_in',
    discount: percentOf(subtotal, GOLD_CARD_PERCENT),
  });

  // The waiter's, on the food after the discount — not on the service charge,
  // which is already the restaurant's own line for the same work.
  const tip = percentOf(bill.subtotal - bill.discount, tipPercent);

  const payable = bill.total + tip;
  const isCash = rail?.isCash === true;
  const rounding = isCash ? cashRoundingDelta(payable) : 0;
  const charged = isCash ? roundedForCash(payable) : payable;

  const split = splitOpen ? splitEvenly(charged, ways) : null;
  const due = split === null ? charged : split.first;

  return (
    <View style={[s.fill, { backgroundColor: c.bg }]}>
      {/* The back control is the phone's own — the design deck is six panels
          side by side and has nowhere to go back to — so it sits above the
          header rather than inside it, and `dc:395` keeps its literal
          `padding:18px 20px 14px` and its rule. */}
      <View style={[s.backStrip, { paddingTop: insets.top }]}>
        <Pressable
          onPress={back}
          accessibilityRole="button"
          style={({ pressed }) => [s.back, pressed && s.pressed]}
        >
          <ChevronLeft colour={c.fgMuted} />
          <Text style={[text.small, { color: c.fgMuted, ...sans(600) }]}>{t.dish.back}</Text>
        </Pressable>
      </View>

      {/* `flex:none` in the design — the title stays put while the bill scrolls
          under it. It was inside `ListHeaderComponent`, so a table scrolling to
          the tip chips lost the word `Hisob` and the rule under it. */}
      <View style={[s.head, { borderColor: c.border }]}>
        <Text style={[s.title, { color: c.fg }]}>{t.bill.title}</Text>
        <Text style={[text.small, text.num, { color: c.fgSubtle, marginTop: 2 }]}>
          {fill(t.bill.table, { table: order.table, guests: order.guests })}
        </Text>
      </View>

      <FlatList
        data={order.lines}
        keyExtractor={(line) => line.id}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={s.page}
        // `dc:401` — `display:grid;gap:11px`. The rows carried a hairline rule
        // each, which turns a bill into a table nobody asked for.
        ItemSeparatorComponent={() => <View style={s.lineGap} />}
        renderItem={({ item }) => (
          <View style={s.line}>
            <Text style={[s.qty, { color: c.fgSubtle }]}>{item.quantity}×</Text>

            <View style={s.grow}>
              <Text style={[s.name, { color: c.fg }]}>{translate(item.name, lang)}</Text>
              {/*
               * What was asked for on this line — the options and the kitchen
               * note. `PublicTableController` has sent both all along and the
               * mapper dropped them, so a guest who asked for no onions could
               * not check their own bill against their own request.
               */}
              {item.options.length === 0 && item.note === '' ? null : (
                <Text style={[s.lineNote, { color: c.fgSubtle }]}>
                  {[...item.options, item.note].filter((part) => part !== '').join(' · ')}
                </Text>
              )}
            </View>

            <Text style={[s.price, { color: c.fg }]}>{som(lineTotal(item), lang, false)}</Text>
          </View>
        )}
        ListFooterComponent={
          <View>
            {/* --------------------------------------------------- totals */}
            {/* Five rows and a rule above them — `dc:411-422`. The order is the
                design's: Taomlar → Xizmat haqi → Chegirma → Jami → QQS. */}
            <View style={[s.totals, { borderColor: c.divider }]}>
              <Sum label={t.bill.items} value={som(bill.subtotal, lang, false)} />

              <Sum
                label={fill(t.bill.service, { percent: SERVICE_PERCENT })}
                value={som(bill.serviceCharge, lang, false)}
              />

              {/*
               * A plain green line, not a checkbox — `dc:414-416`. The tick that
               * switches the card off lives on panel 06 (`dc:535-542`), beside
               * the phone number it saves; here the discount is a fact of the
               * bill, and the 20×20 box inside the summary column made the one
               * row a guest reads as money look like a form field.
               */}
              {bill.discount > 0 ? (
                <Sum
                  label={fill(t.bill.discount, { percent: GOLD_CARD_PERCENT })}
                  value={`−${som(bill.discount, lang, false)}`}
                  colour={c.success600}
                />
              ) : null}

              <View style={[s.grand, { borderColor: c.n900 }]}>
                <Text style={[text.body, { color: c.fg, ...sans(600) }]}>{t.bill.total}</Text>
                <Text style={[s.total, text.num, { color: c.fg }]}>
                  {som(bill.total, lang, false)}
                </Text>
              </View>

              {/* `dc:421` is a `space-between` row, label left and figure right.
                  It was one string — "shundan QQS 12% 30 000 so'm" ran together
                  on the left and read as a sentence rather than as a figure. */}
              <View style={s.sumRow}>
                <Text style={[s.micro, s.grow, { color: c.fgSubtle }]}>
                  {fill(t.bill.vat, { percent: VAT_PERCENT })}
                </Text>
                <Text style={[s.micro, text.num, { color: c.fgSubtle }]}>
                  {som(bill.vatIncluded, lang, false)}
                </Text>
              </View>
            </View>

            {/* ---------------------------------------------------- split */}
            {splitOpen ? (
              <View
                style={[
                  s.split,
                  {
                    backgroundColor: c.brand50,
                    borderColor: c.brand200,
                    borderRadius: size.radiusLg,
                  },
                ]}
              >
                <View style={s.splitHead}>
                  <Text style={[text.body, { color: c.fg, ...sans(600) }]}>{t.bill.split}</Text>
                  <Pressable
                    onPress={() => setSplitOpen(false)}
                    accessibilityRole="button"
                    style={({ pressed }) => [s.close, pressed && s.pressed]}
                  >
                    <Text style={[text.small, { color: c.brand600, ...sans(600) }]}>
                      {t.bill.close}
                    </Text>
                  </Pressable>
                </View>

                <Text style={[s.splitSub, { color: c.fgMuted, marginTop: 5 }]}>
                  {t.bill.splitSub}
                </Text>

                <View style={s.ways}>
                  <Pressable
                    onPress={() => setWays((n) => Math.max(SPLIT_RANGE.min, n - 1))}
                    accessibilityRole="button"
                    accessibilityLabel={t.dish.decrease}
                    // 36×36 in the design (`dc:432`), which is under the 44pt
                    // floor — so the slop carries the tap target and the drawing
                    // keeps its size.
                    hitSlop={8}
                    style={({ pressed }) => [
                      s.wayStep,
                      {
                        backgroundColor: c.surface,
                        borderColor: c.border,
                        borderRadius: size.radiusMd,
                      },
                      pressed && s.pressed,
                    ]}
                  >
                    {/* Dimmed at the floor rather than removed: a control that
                        vanishes at two makes the row jump under the thumb. */}
                    <Text style={[s.wayGlyph, { color: ways > SPLIT_RANGE.min ? c.fg : c.n300 }]}>
                      −
                    </Text>
                  </Pressable>

                  <View style={s.grow}>
                    <Text style={[s.waysNum, s.centred, { color: c.fg }]}>{ways}</Text>
                    <Text style={[s.waysLabel, s.centred, { color: c.fgSubtle }]}>
                      {t.bill.splitWays}
                    </Text>
                  </View>

                  <Pressable
                    onPress={() => setWays((n) => Math.min(SPLIT_RANGE.max, n + 1))}
                    accessibilityRole="button"
                    accessibilityLabel={t.dish.increase}
                    hitSlop={8}
                    style={({ pressed }) => [
                      s.wayStep,
                      {
                        backgroundColor: c.surface,
                        borderColor: c.border,
                        borderRadius: size.radiusMd,
                      },
                      pressed && s.pressed,
                    ]}
                  >
                    <Text style={[s.wayGlyph, { color: c.fg }]}>+</Text>
                  </Pressable>
                </View>

                {split === null ? null : (
                  <View style={[s.splitRows, { borderColor: c.brand200 }]}>
                    {/* The one place the design weights a figure — `dc:443` puts
                        600 on the value while the label stays muted. */}
                    <Sum
                      label={`${t.bill.splitEach} × ${split.ways - 1}`}
                      value={som(split.each, lang, false)}
                      strong
                    />
                    {/* The first cheque, shown only when it actually differs.
                        An identical "first share" row under an even split
                        invites a table to hunt for a difference that is not
                        there. */}
                    {split.first === split.each ? null : (
                      <Sum label={t.bill.splitFirst} value={som(split.first, lang, false)} strong />
                    )}
                  </View>
                )}

                <Text style={[s.micro, { color: c.fgSubtle, marginTop: 10 }]}>
                  {t.bill.splitNote}
                </Text>
              </View>
            ) : null}

            {/* ----------------------------------------------------- rail */}
            <Text style={[text.body, s.railSection, { color: c.fg, ...sans(600) }]}>
              {t.bill.howPay}
            </Text>

            <View style={s.rails}>
              {TABLE_RAILS.map((option) => {
                const on = option.id === railId;

                return (
                  <Pressable
                    key={option.id}
                    onPress={() => setRailId(option.id)}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: on }}
                    style={({ pressed }) => [
                      s.railRow,
                      {
                        backgroundColor: on ? c.brand50 : c.surface,
                        borderColor: on ? c.brand200 : c.border,
                      },
                      pressed && s.pressed,
                    ]}
                  >
                    <View
                      style={[
                        s.radio,
                        { borderColor: on ? c.brand500 : c.n300, borderRadius: size.radiusPill },
                      ]}
                    >
                      {on ? (
                        <View
                          style={[
                            s.radioDot,
                            { backgroundColor: c.brand500, borderRadius: size.radiusPill },
                          ]}
                        />
                      ) : null}
                    </View>

                    <View style={s.grow}>
                      <Text style={[text.body, { color: c.fg, ...sans(600) }]}>{option.label}</Text>
                      {/* A name and a line about it — `dc.html:876-881`. Four
                          bare labels made `Click` and `Payme` read as two
                          spellings of one thing, and gave the cash row no way
                          to say the part that matters: choosing it fetches a
                          waiter rather than settling anything. */}
                      <Text style={[s.micro, { color: c.fgSubtle, marginTop: 1 }]}>
                        {option.sub === 'schemes'
                          ? CARD_SCHEMES
                          : option.sub === 'app'
                            ? t.bill.railApp
                            : t.bill.railWaiter}
                      </Text>
                    </View>
                  </Pressable>
                );
              })}
            </View>

            {/*
             * The rounding, under the rail that causes it.
             *
             * `dc:411-422` has no such row and no such rule: the design's cash
             * rail does not move the figure. Ours does — `roundedForCash()` is
             * the till's own — so the sentence stays, but out of the summary
             * block, which the design keeps to five rows that add up. It reads
             * under the choice that changes the figure, the way the tip amount
             * reads under the tip chips.
             */}
            {rounding === 0 ? null : (
              <Text style={[s.note, text.num, { color: c.fgMuted, marginTop: size.sp2 }]}>
                {fill(t.bill.cashRounded, { amount: som(charged, lang, false) })}
              </Text>
            )}

            {/* ------------------------------------------------------ tip */}
            {/* 20, not the rail block's 22 — `dc:470` against `dc:451`. */}
            <View style={s.tipSection}>
              <View style={s.tipHead}>
                <Text style={[text.body, { color: c.fg, ...sans(600) }]}>{t.bill.tip}</Text>
                <Text style={[s.micro, { color: c.fgSubtle }]}>{t.bill.tipNote}</Text>
              </View>

              <View style={s.tips}>
                {TABLE_TIPS.map((step) => {
                  const on = step === tipPercent;

                  return (
                    <Pressable
                      key={step}
                      onPress={() => {
                        setTipPercent(step);
                        if (step === 0) flash(t.bill.noTip);
                      }}
                      accessibilityRole="radio"
                      accessibilityState={{ selected: on }}
                      style={({ pressed }) => [
                        s.tip,
                        {
                          backgroundColor: on ? c.n900 : c.surface,
                          borderColor: on ? c.n900 : c.border,
                        },
                        pressed && s.pressed,
                      ]}
                    >
                      <Text style={[s.tipLabel, { color: on ? c.n0 : c.fg }]}>
                        {step === 0 ? t.bill.tipNone : `${step}%`}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>

              {/* The one figure on panel 05 that carries the word — `dc:1000`
                  is the only `t.som` on this screen. Everything above it is a
                  bare grouped number (`this.f()`), because eleven repetitions
                  of "so'm" down one column is a column of the same word. */}
              <Text style={[s.note, text.num, { color: c.fgMuted, marginTop: size.sp2 }]}>
                {tip > 0 ? `+${som(tip, lang)}` : t.bill.noTip}
              </Text>
            </View>
          </View>
        }
      />

      {/* Honest, and it stays — but above the dock rather than in it. `dc:484`
          holds two controls and nothing else, and a third line under the split
          toggle read as a caption belonging to that button. */}
      <View style={s.demoStrip}>
        <Text style={[s.micro, s.centred, { color: c.fgSubtle }]}>{t.common.demoPayment}</Text>
      </View>

      {/* The design pins both controls to the bottom of the phone, and the pay
          button is the one thing on this screen a thumb must always reach. */}
      <View
        style={[
          s.dock,
          { backgroundColor: c.bg, borderColor: c.border, paddingBottom: insets.bottom + size.sp5 },
        ]}
      >
        <Pressable
          onPress={() => {
            /*
             * What was paid travels in the route's params, not in state: the
             * rating screen prints a receipt line, and state does not survive
             * the navigation that gets there.
             */
            /*
             * Fire-and-navigate rather than await-and-navigate.
             *
             * The guest has finished with this screen, and making them watch a
             * spinner so the app can confirm what it already told them is the
             * wrong trade. The request is latched per table on the server — it
             * answers `already_open` rather than raising a second call — so a
             * guest who backs up and presses again does not summon two waiters.
             */
            void askForBill(restaurant, table, {
              lang,
              method: rail?.isCash === true ? 'cash' : rail?.sub === 'app' ? 'online' : 'card',
              tipPercent: TABLE_TIPS.includes(tipPercent) ? tipPercent : undefined,
              splitBetween: splitOpen && ways > 1 ? ways : undefined,
            }).catch(() => {
              // Silent: the guest is already on the next screen, and a waiter
              // walks past a table that has finished eating in any case.
            });

            flash(t.common.demoPayment);
            /*
             * As one string rather than `{ pathname, params }`: `here` is built
             * from route params, so `typedRoutes` cannot match it against a
             * file, and the object form's `pathname` accepts only literals it
             * can. `tableScreen()` is the single place a dynamic table path
             * re-enters the typed world — see `src/guest/route.ts`.
             */
            const query = `paid=${encodeURIComponent(String(due))}&rail=${encodeURIComponent(railId)}`;

            router.push(`${tableScreen(here, 'rating')}?${query}` as Href);
          }}
          accessibilityRole="button"
          style={({ pressed }) => [
            s.pay,
            { backgroundColor: c.brand500, borderRadius: size.radiusLg },
            pressed && s.pressed,
          ]}
        >
          <Text style={[s.payLabel, { color: c.n0 }]}>
            {t.bill.pay} {som(due, lang, false)}
          </Text>
        </Pressable>

        <Pressable
          onPress={() => setSplitOpen((open) => !open)}
          accessibilityRole="button"
          accessibilityState={{ expanded: splitOpen }}
          style={({ pressed }) => [
            s.splitToggle,
            { backgroundColor: splitOpen ? c.bgMuted : 'transparent' },
            pressed && s.pressed,
          ]}
        >
          <Text style={[s.splitToggleLabel, { color: splitOpen ? c.fg : c.fgMuted }]}>
            {splitOpen ? t.bill.close : t.bill.split}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

/**
 * One summary line — `dc:412`.
 *
 * The tint is one prop rather than two because the design colours the row, not
 * the halves: `dc:415` puts `--success-600` on the discount line and both its
 * spans inherit it, and it was drawn as a grey label beside a green figure.
 * `strong` is the split card's variant (`dc:441-443`), the only row on this
 * screen where the design weights the value.
 */
function Sum({
  label,
  value,
  colour,
  strong = false,
}: {
  label: string;
  value: string;
  colour?: string;
  strong?: boolean;
}) {
  const c = useTheme();
  const tint = colour ?? c.fgMuted;

  return (
    <View style={s.sumRow}>
      <Text style={[s.sum, s.grow, { color: tint }]}>{label}</Text>
      <Text style={[s.sum, text.num, strong && sans(600), { color: strong ? c.fg : tint }]}>
        {value}
      </Text>
    </View>
  );
}

const s = StyleSheet.create({
  fill: { flex: 1 },
  grow: { flex: 1, minWidth: 0 },
  centred: { textAlign: 'center' },
  backStrip: { paddingHorizontal: size.sp5 },
  back: { flexDirection: 'row', alignItems: 'center', gap: 2, height: 44, marginLeft: -6 },
  head: { paddingTop: 18, paddingHorizontal: size.sp5, paddingBottom: 14, borderBottomWidth: 1 },
  // `dc:396` — 21px, not the 20 of `text.title`, and at `-.022em` rather than
  // the `title` preset's `-.012em`.
  title: displayAt(700, 21, 1.25),
  page: { padding: size.sp5 },
  line: { flexDirection: 'row', alignItems: 'baseline', gap: 10 },
  lineGap: { height: 11 },
  qty: { ...sansAt(400, 13), ...text.num, width: 20 },
  name: sansAt(500, 14),
  /* The options and the note under the dish, at the bill's own 12px. */
  lineNote: { ...sansAt(400, 12, 1.45), marginTop: 2 },
  price: { ...sansAt(400, 14), ...text.num },
  // `dc:411` — the rule that separates what was eaten from what it costs. There
  // was none, so the first sum read as one more bill line.
  totals: { gap: 8, marginTop: 18, paddingTop: 16, borderTopWidth: 1 },
  sum: sansAt(400, 14),
  sumRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  micro: sansAt(400, 12),
  note: sansAt(400, 13),
  grand: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    marginTop: 6,
    paddingTop: size.sp3,
    borderTopWidth: 1,
  },
  total: displayAt(700, 26, 1.12),
  split: {
    marginTop: size.sp5,
    paddingVertical: 15,
    paddingHorizontal: 16,
    borderWidth: 1,
  },
  splitHead: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  splitSub: sansAt(400, 13, 1.55),
  close: { minHeight: 44, justifyContent: 'center', paddingLeft: size.sp3 },
  ways: { flexDirection: 'row', alignItems: 'center', gap: 11, marginTop: 13 },
  wayStep: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  wayGlyph: sansAt(600, 18, 1),
  waysNum: { ...displayAt(700, 22, 1.12), ...text.num },
  waysLabel: { ...sansAt(400, 11), marginTop: 1 },
  splitRows: { gap: 6, marginTop: 13, paddingTop: 12, borderTopWidth: 1 },
  railSection: { marginTop: 22 },
  rails: { gap: size.sp2, marginTop: 11 },
  railRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    minHeight: 56,
    padding: 14,
    borderWidth: 1,
    borderRadius: 13,
  },
  radio: {
    width: 20,
    height: 20,
    borderWidth: 1.8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioDot: { width: 9, height: 9 },
  tipSection: { marginTop: 20 },
  tipHead: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  tips: { flexDirection: 'row', gap: 7, marginTop: 10 },
  tip: {
    flex: 1,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderRadius: 11,
  },
  tipLabel: sansAt(600, 14),
  demoStrip: { paddingHorizontal: size.sp5, paddingBottom: size.sp2 },
  dock: { gap: 9, paddingHorizontal: size.sp5, paddingTop: 14, borderTopWidth: 1 },
  pay: { height: 52, alignItems: 'center', justifyContent: 'center' },
  payLabel: sansAt(600, 16),
  splitToggle: { height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 13 },
  splitToggleLabel: sansAt(600, 14),
  /* `[data-press]:active{transform:scale(.97)}` — the design's own
     press. It faded here, which reads as "disabled for a moment". */
  pressed: PRESSED,
});
