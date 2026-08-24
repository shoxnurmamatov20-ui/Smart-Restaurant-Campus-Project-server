import { useRouter } from 'expo-router';
import { useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { billTotals } from '@restaurant/surfaces/money';
import { CART, copy, MENU, SHARED } from '@restaurant/surfaces/customer/copy';
import { say } from '@restaurant/surfaces/customer/data';

import { useCustomerVenues } from '@/customer/live';
import { DishPhoto } from '@/ui/dish-photo';
import { Button, PRESSED } from '@/ui/primitives';
import { Photo } from '@/ui/icons';
import { Notice, useNotice } from '@/ui/notice';
import { cart, promoDiscount, useCart, useCatalogue, type ResolvedLine } from '@/lib/cart';
import { useLocale } from '@/lib/locale';
import { som } from '@/lib/money';
import { useTheme } from '@/lib/theme-context';
import { size } from '@/theme';
import { sans, sansAt, text } from '@/type';

/**
 * The basket — `Smart Restaurant Mijoz ilovasi.dc.html`, the `at.cart` block
 * (lines 364–428).
 *
 * The screen quotes a price, and the whole of its arithmetic is one call to
 * `billTotals()` — the mirror of `App\Support\Orders\BillTotals::of()`. Nothing
 * here multiplies, discounts or extracts tax on its own. That is not a stylistic
 * rule: a cart that adds up a bill its own way is how a guest sees one number on
 * a phone and another on the printed cheque, and the cashier is the one standing
 * there when it happens.
 *
 * The totals therefore read top to bottom in the order the money is applied —
 * items, delivery, discount, then what is owed — which is also the order the
 * design's own `totals` array is built in (Mijoz:855).
 *
 * ---------------------------------------------------------------------------
 * What this screen used to be, and why it read as a different app
 *
 * It carried two controls the design does not draw here: a delivery/pickup
 * segmented control and a horizontal rail of branch chips. Both belong to the
 * home screen — `cycleBranch` and the mode segment are drawn in the `at.home`
 * block — and the cart's job is to *report* the choice, not to re-ask it. The
 * design says so in one line: `{{branchName}} · {{modeShort}}` at 12px
 * `--fg-subtle` under the heading (Mijoz:370). Two pickers for one decision, on
 * two screens, is how a guest changes the branch here and finds the fee they
 * were quoted on the previous screen no longer applies.
 *
 * The pay button was a sticky bar with a rule and a fill, pulled edge to edge
 * with negative margins. The design has no bar: the button is the last thing in
 * the list, `width:100%;height:52px;margin-top:16px` (Mijoz:424). A bar over a
 * dock is two pieces of chrome stacked on the same thumb.
 */
export default function CartScreen() {
  const c = useTheme();
  const { lang } = useLocale();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const basket = useCart();
  const { note, say: announce } = useNotice();

  const t = copy(CART, lang);
  const s = copy(SHARED, lang);
  const m = copy(MENU, lang);

  const [code, setCode] = useState('');
  const [problem, setProblem] = useState<string | null>(null);

  /*
   * The venues, with the fee each one actually charges.
   *
   * Asked here as well as on the home screen, because a guest can land on this
   * tab first — the branch line below names the venue this basket is priced
   * against, and every figure under it depends on that venue's delivery fee.
   */
  const { state: venueState, retry: retryVenues } = useCustomerVenues(lang);

  useCatalogue(null, venueState.status === 'loading' ? null : venueState.venues);

  const delivering = basket.channel === 'delivery';

  /*
   * Free above the threshold, and the row still renders. A fee that silently
   * disappears reads as a fee that was never charged, and the guest never learns
   * the threshold exists. The store applies both the channel and the threshold,
   * so this screen and the payment screen cannot disagree about carriage.
   */
  const earned = basket.deliveryFee === 0;
  const discount = promoDiscount(basket.promo, basket.subtotal);

  const bill = billTotals({
    subtotal: basket.subtotal,
    channel: delivering ? 'delivery' : 'takeaway',
    discount,
    deliveryFee: basket.deliveryFee,
  });

  /*
   * `{{cartHas}}` / `{{cartEmpty}}`, and they are branches *inside* the screen.
   *
   * The empty basket used to be an early return that drew a centred word on a
   * blank scene — no heading, no count, no branch. The design keeps the heading
   * block above it and swaps only what follows (Mijoz:372), because a guest who
   * lands on an empty cart still needs to read which branch and which mode the
   * next thing they add will be priced against.
   */
  const has = basket.resolved.length > 0;

  return (
    <View style={st.fill}>
      <FlatList
        data={basket.resolved}
        keyExtractor={(entry) => entry.line.key}
        /* `padding:6px 0 24px` (Mijoz:365) — the 6 measured from under the
           status bar, which on a real phone is the inset rather than the
           design's drawn 46px of chrome. The screen had neither: its heading
           started 16px from the top of the display, under the notch. */
        contentContainerStyle={[st.page, { paddingTop: insets.top + 6 }]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        ListHeaderComponent={
          <View style={has ? st.head : undefined}>
            {/* `align-items:baseline;justify-content:space-between` — the count
                sits on the heading's own baseline (Mijoz:366), not on a second
                line under it. */}
            <View style={st.headingRow}>
              <Text style={[text.screenTitle, { color: c.fg }]}>{t.heading}</Text>
              <Text style={[st.meta, text.num, { color: c.fgSubtle }]}>
                {basket.count} {t.positions}
              </Text>
            </View>

            {/* `{{branchName}} · {{modeShort}}` — which branch, and which way it
                comes. The screen printed the mode and a fixture eta instead, so
                the one fact a guest cannot get anywhere else on this screen —
                the venue the basket is priced against — was never shown. No
                column answers "25–35 minutes" either: the promise is
                `promised_at`, computed per basket at the checkout. */}
            <Text style={[st.meta, text.num, { color: c.fgSubtle }]}>
              {`${basket.branch.name} · ${delivering ? s.delivery : s.pickup}`}
            </Text>

            {/* Said out loud when these are the fixtures: a guest reading
                "Chilonzor" on the line above is reading a venue this restaurant
                may not have, at a delivery fee it never set. */}
            {basket.venues.live ? null : (
              <Pressable
                onPress={retryVenues}
                accessibilityRole="button"
                style={({ pressed }) => [
                  st.demo,
                  { backgroundColor: c.warning50, borderColor: c.warning500 },
                  pressed && PRESSED,
                ]}
              >
                <Text style={[text.caption, { color: c.warning700 }]}>{m.demoMenu}</Text>
              </Pressable>
            )}
          </View>
        }
        renderItem={({ item }) => (
          <CartRow entry={item} onRemoved={(name) => announce(`${name} · ${t.removed}`)} />
        )}
        ListEmptyComponent={
          /*
           * `padding:64px 24px;text-align:center` (Mijoz:373).
           *
           * Written out rather than reaching for `Empty`: the shared primitive
           * pads 56/24 and colours its body `--fg-subtle` with a 6px gap, and
           * this block is 64/24 with an `--fg-muted` paragraph, 8 above it and
           * 20 below it before a 46px button. Where a screen and the design
           * disagree the design wins, and the primitive is another agent's file.
           */
          <View style={st.empty}>
            <Text style={[st.emptyHeading, { color: c.fg }]}>{t.emptyHeading}</Text>
            <Text style={[st.emptyBody, { color: c.fgMuted }]}>{t.emptyBody}</Text>
            <Button
              kind="primary"
              height={46}
              style={st.emptyCta}
              textStyle={st.emptyCtaLabel}
              onPress={() => router.push('/customer/menu')}
            >
              {t.emptyCta}
            </Button>
          </View>
        }
        ListFooterComponent={
          /* The whole footer lives inside the design's `{{cartHas}}` branch: a
             promo field, a totals card and a pay button under an empty basket
             are three offers to pay for nothing. */
          has ? (
            <View>
              {/* ----------------------------------------------------- promo */}
              {basket.promo === null ? (
                <View style={st.promoRow}>
                  <TextInput
                    value={code}
                    onChangeText={(next) => {
                      setCode(
                        next
                          .toUpperCase()
                          .replace(/[^A-Z0-9]/g, '')
                          .slice(0, 12),
                      );
                      setProblem(null);
                    }}
                    placeholder={t.promoPlaceholder}
                    placeholderTextColor={c.fgSubtle}
                    accessibilityLabel={t.promoPlaceholder}
                    autoCapitalize="characters"
                    autoCorrect={false}
                    style={[
                      st.promoField,
                      {
                        backgroundColor: c.surface,
                        /* `border:1px solid var(--border-strong)` — a field a
                           guest is meant to type into is drawn a step stronger
                           than a divider, and this one was on `--border`. */
                        borderColor: problem === null ? c.borderStrong : c.danger500,
                        color: c.fg,
                        borderRadius: size.radiusMd,
                      },
                    ]}
                  />

                  <Button
                    kind="secondary"
                    height={44}
                    textStyle={st.promoApply}
                    onPress={async () => {
                      const outcome = await cart.applyPromo(code, lang);
                      const refused =
                        outcome === 'ok'
                          ? null
                          : outcome === 'empty'
                            ? t.promoEmpty
                            : outcome === 'already'
                              ? t.promoAlready
                              : outcome === 'floor'
                                ? t.promoFloor
                                : t.promoUnknown;

                      setProblem(refused);

                      /*
                       * Both, and they are not redundant. The inline note stays
                       * on screen while the guest retypes and is what a screen
                       * reader announces; the notice is what the design does on
                       * every outcome, and it is what a guest looking at the
                       * total rather than at the field will see.
                       */
                      if (refused === null) {
                        announce(`${code.trim()} · ${t.promoApplied}`);
                        setCode('');
                      } else {
                        announce(refused, 'problem');
                      }
                    }}
                  >
                    {t.promoApply}
                  </Button>
                </View>
              ) : (
                <View
                  style={[
                    st.promoOn,
                    {
                      backgroundColor: c.accent50,
                      borderColor: c.accent500,
                      borderRadius: size.radiusMd,
                    },
                  ]}
                >
                  <Text style={[st.promoCode, text.num, { color: c.accent700 }]}>
                    {basket.promo.code}
                  </Text>
                  <Text style={[text.caption, st.promoNote, { color: c.fgSubtle }]}>
                    {basket.promo.percent > 0 ? `−${basket.promo.percent}% · ` : ''}
                    {t.promoApplied}
                  </Text>
                  <Pressable
                    onPress={() => {
                      const gone = basket.promo?.code ?? '';

                      cart.clearPromo();
                      setProblem(null);
                      announce(`${gone} · ${s.remove}`.trim());
                    }}
                    accessibilityRole="button"
                    hitSlop={10}
                    style={({ pressed }) => [pressed && PRESSED]}
                  >
                    <Text style={[st.dropLabel, { color: c.fgMuted }]}>{s.remove}</Text>
                  </Pressable>
                </View>
              )}

              {problem === null ? null : (
                <Text
                  accessibilityLiveRegion="polite"
                  style={[text.caption, { color: c.danger600, marginTop: 8 }]}
                >
                  {problem}
                </Text>
              )}

              {/* ---------------------------------------------------- totals */}
              {/*
               * A card, not four loose lines: `margin-top:20px;padding:16px 18px;
               * border:1px solid var(--border);border-radius:var(--radius-lg);
               * background:var(--bg-subtle)` (Mijoz:411). The screen drew the
               * rows on the page itself, which is the same set of numbers with
               * nothing saying they belong together.
               *
               * Four rows, always four — the design's `totals` has no
               * conditional member. A discount line that only appears once a
               * code has worked is a line nobody knows to look for, and a
               * delivery row that vanishes on pickup takes "bepul" with it: the
               * guest never learns that collecting is what made it free. An em
               * dash is the honest rendering of nothing.
               */}
              <View
                style={[
                  st.totals,
                  {
                    borderColor: c.border,
                    backgroundColor: c.bgSubtle,
                    borderRadius: size.radiusLg,
                  },
                ]}
              >
                <Total label={s.items} value={som(bill.subtotal, lang)} />

                <Total
                  label={delivering ? s.delivery : s.pickup}
                  value={!delivering || earned ? s.free : som(bill.deliveryFee, lang)}
                />

                <Total
                  label={
                    basket.promo === null ? s.discount : `${s.discount} · ${basket.promo.code}`
                  }
                  value={bill.discount > 0 ? `−${som(bill.discount, lang)}` : '—'}
                />

                {/* The design's `kind:"big"` row — `font-size:var(--text-lg);
                    font-weight:700;padding:12px 0 0;border-top:1px solid
                    var(--border)` (Mijoz:847). Both halves at 17: the label was
                    15 and the value 20, so the two ends of one sum were set in
                    two different sizes. */}
                <View style={[st.grand, { borderColor: c.border }]}>
                  <Text style={[st.grandText, { color: c.fg }]}>{s.total}</Text>
                  <Text style={[st.grandText, text.num, { color: c.fg }]}>
                    {som(bill.total, lang)}
                  </Text>
                </View>

                {/* Included, never added. The name of the field says so and the
                    sentence repeats it, because a guest reading "+ QQS" would be
                    reading a 12% surcharge that does not exist. */}
                <Text style={[st.vat, text.num, { color: c.fgSubtle }]}>
                  {t.vatNote} {som(bill.vatIncluded, lang)}
                </Text>
              </View>

              {/*
               * The last thing in the list, not a bar over it.
               *
               * `width:100%;height:52px;margin-top:16px` with the amount as its
               * own span at `opacity:.85` — the design writes no separator, so
               * the "·" this screen used to join them with is gone. The .85 is
               * resolved into the colour rather than set as `opacity`: a nested
               * `<Text>` in React Native carries text properties reliably and
               * view properties only sometimes, and the button's own `color`
               * is the literal `#fff` in both themes.
               */}
              <Button
                kind="primary"
                height={52}
                style={st.pay}
                onPress={() => router.push('/customer/pay')}
              >
                {t.toPayment} <Text style={[text.num, st.payTotal]}>{som(bill.total, lang)}</Text>
              </Button>
            </View>
          ) : null
        }
      />

      {/* The design puts the toast at `bottom:80px` in a frame whose dock is 64
          tall (Mijoz:701); a tab scene already ends where the dock begins, so
          what is left is the 16 above it. It was 84 — clearing a pay bar that
          no longer exists. */}
      <Notice note={note} bottom={16} />
    </View>
  );
}

/**
 * One line: a 60px thumbnail, what it is, and the two controls that change it.
 *
 * The stepper stops at one and does what a stepper does; removing is its own
 * word beside it. A minus button that deletes the row at quantity one is not
 * what a minus button does anywhere else on a phone, and a guest who meant to go
 * from two to one loses the line and the note they typed with it.
 *
 * The shape is the design's `sc-for` over `{{cart}}` (Mijoz:382–401), and it was
 * built the other way round here: no thumbnail at all, the price on a fourth
 * line of its own, and a tall pill stepper stacked over "O'chirish" in a column
 * down the right-hand edge. The design draws a row: name and line total on one
 * baseline, then the two 30px square buttons on the LEFT of the last row with
 * the remove word at the far right of it.
 */
function CartRow({ entry, onRemoved }: { entry: ResolvedLine; onRemoved: (name: string) => void }) {
  const c = useTheme();
  const { lang } = useLocale();
  const t = copy(CART, lang);
  const s = copy(SHARED, lang);

  const extras =
    entry.modifiers.length === 0
      ? t.noExtras
      : entry.modifiers.map((modifier) => say(modifier.name, lang)).join(' · ');

  /* A live line has no portion — a size is a modifier the kitchen prices, so it
     is already in the list above. Printing "O'rta" beside it would name a size
     this restaurant never offered. */
  const configured =
    entry.portion === null ? extras : `${say(entry.portion.name, lang)} · ${extras}`;

  const only = entry.line.quantity === 1;

  return (
    <View style={[st.line, { borderColor: c.divider }]}>
      {/*
       * `width:60px;height:60px;border:1px solid var(--border);border-radius:
       * var(--radius-md);background:var(--bg-muted)` around a 19px mark.
       *
       * The photograph is the dish's own — the line resolves to its dish in
       * `lib/cart`, and the dish carries it. A dish without one draws what the
       * design itself renders in that state: the band at its full height with
       * the picture mark in it, rather than a grey rectangle that reads as a
       * stuck load or a picture nobody took.
       */}
      <View style={[st.thumb, { borderColor: c.border, backgroundColor: c.bgMuted }]}>
        <DishPhoto
          image={entry.dish.image ?? null}
          width={60}
          radius={size.radiusMd - 1}
          fill
          fallback={<Photo size={19} />}
        />
      </View>

      <View style={st.lineMain}>
        <View style={st.lineHead}>
          <Text style={[st.lineName, { color: c.fg }]} numberOfLines={1}>
            {say(entry.dish.name, lang)}
          </Text>
          <Text style={[st.linePrice, text.num, { color: c.fg }]}>
            {som(entry.linePrice, lang)}
          </Text>
        </View>

        <Text style={[st.lineMods, { color: c.fgSubtle }]}>{configured}</Text>

        {/* `color:var(--warning-600)`, upright, unquoted (Mijoz:390). It was
            grey italic inside typographic quotes — a request the kitchen has to
            act on, drawn as an aside somebody once said. */}
        {entry.line.note === '' ? null : (
          <Text style={[st.lineNote, { color: c.warning600 }]}>{entry.line.note}</Text>
        )}

        <View style={st.lineFoot}>
          <View style={st.stepper}>
            <Pressable
              onPress={() => cart.setQuantity(entry.line.key, entry.line.quantity - 1)}
              disabled={only}
              accessibilityRole="button"
              accessibilityLabel="−"
              hitSlop={7}
              style={({ pressed }) => [
                st.step,
                { borderColor: c.borderStrong, backgroundColor: c.surface },
                pressed && PRESSED,
                only && st.dimmed,
              ]}
            >
              <Text style={[st.stepGlyph, { color: c.fg }]}>−</Text>
            </Pressable>

            <Text style={[st.count, text.num, { color: c.fg }]}>{entry.line.quantity}</Text>

            <Pressable
              onPress={() => cart.setQuantity(entry.line.key, entry.line.quantity + 1)}
              accessibilityRole="button"
              accessibilityLabel="+"
              hitSlop={7}
              style={({ pressed }) => [
                st.step,
                { borderColor: c.borderStrong, backgroundColor: c.surface },
                pressed && PRESSED,
              ]}
            >
              <Text style={[st.stepGlyph, { color: c.fg }]}>+</Text>
            </Pressable>
          </View>

          {/* `color:var(--danger-600)` on no background — it was `--fg-subtle`,
              which is the colour of a hint, on the one control that throws
              something away. `padding:0` in the design, so the touch target is
              bought with `hitSlop` rather than with a box that would push the
              word off the row's right edge. */}
          <Pressable
            onPress={() => {
              cart.remove(entry.line.key);
              onRemoved(say(entry.dish.name, lang));
            }}
            accessibilityRole="button"
            hitSlop={10}
            style={({ pressed }) => [pressed && PRESSED]}
          >
            <Text style={[st.dropLabel, { color: c.danger600 }]}>{s.remove}</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

/**
 * A totals row.
 *
 * The design builds all four from one `row()` helper (Mijoz:846) and gives the
 * label and the value the same size, the same weight and the same colour —
 * 13px/500 in `--fg-muted`. This drew the label in `--fg-subtle` at 400 and the
 * value in `--fg` at 600, which reads as a heading with an answer rather than as
 * one line of a sum, and it had an accent green on the discount that the design
 * does not use anywhere in this card.
 */
function Total({ label, value }: { label: string; value: string }) {
  const c = useTheme();

  return (
    <View style={st.total}>
      <Text style={[st.totalText, st.totalLabel, { color: c.fgMuted }]}>{label}</Text>
      <Text style={[st.totalText, text.num, { color: c.fgMuted }]}>{value}</Text>
    </View>
  );
}

const st = StyleSheet.create({
  fill: { flex: 1 },
  /* `padding:6px 0 24px`; the horizontal 20 is the tab scene's own gutter. */
  page: { paddingBottom: 24 },
  /* `padding:14px 20px 0` opens the list block, and each row adds its own 14. */
  head: { paddingBottom: 14 },
  headingRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    paddingBottom: 4,
  },
  /* `font-size:var(--text-xs)` with no weight set — 12/400, not 12/500. */
  meta: { ...sansAt(400, 12) },
  demo: { padding: 12, borderWidth: 1, borderRadius: size.radiusMd, marginTop: 12 },

  empty: { paddingVertical: 64, paddingHorizontal: 24, alignItems: 'center' },
  emptyHeading: { ...sansAt(600, 15), textAlign: 'center' },
  emptyBody: { ...sansAt(400, 13, 1.5), marginTop: 8, marginBottom: 20, textAlign: 'center' },
  /* `height:46px;padding:0 22px` — the primitive's own gutter is 16. */
  emptyCta: { paddingHorizontal: 22 },
  emptyCtaLabel: { ...sansAt(600, 13, 1.2) },

  /* `gap:12px;padding:14px 0;border-bottom:1px solid var(--divider)` — the rule
     is a whole pixel in the design, never a hairline. */
  line: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    paddingVertical: 14,
    borderBottomWidth: 1,
  },
  thumb: {
    width: 60,
    height: 60,
    flexGrow: 0,
    flexShrink: 0,
    borderWidth: 1,
    borderRadius: size.radiusMd,
    alignItems: 'center',
    justifyContent: 'center',
  },
  lineMain: { flex: 1, minWidth: 0 },
  lineHead: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: 10,
  },
  lineName: { ...sansAt(600, 13, 1.4), flexShrink: 1, minWidth: 0 },
  /* `flex:none` — the sum never shrinks to make room for a long dish name. */
  linePrice: { ...sansAt(600, 13, 1.4), flexGrow: 0, flexShrink: 0 },
  lineMods: { ...sansAt(400, 11, 1.45), marginTop: 2 },
  lineNote: { ...sansAt(400, 11, 1.45), marginTop: 3 },
  lineFoot: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    marginTop: 7,
  },
  /* `gap:9px` between three 30px cells, on the left of the row. */
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  step: {
    width: 30,
    height: 30,
    borderWidth: 1,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  /* `font-size:16px;line-height:1` with no weight set. */
  stepGlyph: { ...sans(400), fontSize: 16, lineHeight: 16 },
  count: { ...sansAt(700, 13, 1.2), minWidth: 16, textAlign: 'center' },
  /* `font-size:var(--text-xs);font-weight:600` — both remove words on the
     screen, the line's and the promo chip's. */
  dropLabel: { ...sansAt(600, 12, 1.2) },

  /* `gap:9px;margin-top:18px` — it was 8 and 20. */
  promoRow: { flexDirection: 'row', gap: 9, marginTop: 18 },
  /* `height:44px;padding:0 14px` at 13px. No `lineHeight`: the design sets none
     on the input, and one inside a fixed-height field is what pushes the caret
     off centre on Android. */
  promoField: {
    flex: 1,
    minWidth: 0,
    height: 44,
    paddingHorizontal: 14,
    borderWidth: 1,
    ...sans(400),
    fontSize: 13,
  },
  promoApply: { ...sansAt(600, 13, 1.2) },
  promoOn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    marginTop: 18,
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderWidth: 1,
  },
  promoCode: { ...sansAt(600, 13, 1.4) },
  promoNote: { flex: 1, minWidth: 0 },

  /* `margin-top:20px;padding:16px 18px;border:1px solid var(--border)`. */
  totals: { marginTop: 20, paddingVertical: 16, paddingHorizontal: 18, borderWidth: 1 },
  /* `padding:5px 0;gap:12px` on every row of the sum. */
  total: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: 12,
    paddingVertical: 5,
  },
  totalText: { ...sansAt(500, 13, 1.4) },
  totalLabel: { flexShrink: 1, minWidth: 0 },
  grand: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: 12,
    borderTopWidth: 1,
    paddingTop: 12,
  },
  grandText: { ...sansAt(700, 17, 1.3) },
  /* `font-size:var(--text-2xs);margin-top:10px;line-height:1.5`. */
  vat: { ...sansAt(400, 11, 1.5), marginTop: 10 },

  pay: { marginTop: 16 },
  payTotal: { color: 'rgba(255,255,255,0.85)' },
  dimmed: { opacity: 0.4 },
});
