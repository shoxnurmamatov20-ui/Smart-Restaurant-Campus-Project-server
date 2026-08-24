import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  billTotals,
  cashRoundingDelta,
  percentOf,
  roundedForCash,
} from '@restaurant/surfaces/money';
import { AUTH, copy, PAY, SHARED } from '@restaurant/surfaces/customer/copy';
import {
  ADDRESS_NOTE,
  CASH_ROUNDING,
  PAYMENT_RAILS,
  SAVED_ADDRESSES,
  say,
  TIP_STEPS,
} from '@restaurant/surfaces/customer/data';
import { placeOrderPayloadFrom } from '@restaurant/surfaces/customer/order';

import { listAddresses, placeOrder, readProfile, type Address } from '@/customer/account';
import { customerTenant } from '@/customer/live';
import { PRESSED } from '@/ui/primitives';
import { Chevron } from '@/ui/icons';
import { Notice, useNotice } from '@/ui/notice';
import { cart, promoDiscount, useCart } from '@/lib/cart';
import { useLocale } from '@/lib/locale';
import { som } from '@/lib/money';
import { isOnlineRail, leaveForProvider, openInvoice, returnUrl } from '@/lib/pay';
import { useTheme } from '@/lib/theme-context';
import { raw, size, type Colour } from '@/theme';
import { sansAt, text, tracking } from '@/type';

/**
 * Payment — `Smart Restaurant Mijoz ilovasi.dc.html`, screen 6 (`at.pay`, :428).
 *
 * Three things are decided here and each is a different kind of number:
 *
 *   · the **bill**, which `billTotals()` alone computes — the same call and the
 *     same inputs as the cart screen, so the figure cannot change between the
 *     two without the basket changing;
 *   · the **tip**, which is not part of the bill at all. It goes to the courier
 *     and never enters the restaurant's revenue, so it is added after the total
 *     rather than inside it. Folding it in would put a courier's tip into a Z
 *     report and onto a VAT return, which is somebody's tax problem;
 *   · the **rounding**, which exists only when the rail is cash. Its own line,
 *     never quietly folded in — a guest handed a figure 400 so'm off the one
 *     they just read is owed the sentence explaining it.
 *
 * Pushed over the tabs with no dock of its own, which the layout declares: a
 * person about to pay is in the middle of one thing.
 *
 * ---------------------------------------------------------------------------
 * What this screen looked like against what the design draws
 *
 * The shape was wrong in three places, and each of them was the difference
 * between a checkout and a form:
 *
 *   · **Where it goes was a radio list.** The design (:438–455) draws ONE card
 *     — `margin-top:18px;padding:15px 17px;border:1px solid var(--border);
 *     border-radius:var(--radius-lg)` — with the caps label inside it, the
 *     chosen line, its courier note, and a `height:32px` "O'zgartirish" button
 *     on the right. The screen listed every saved address as a radio row under
 *     a legend, so the first thing a guest read at checkout was a decision they
 *     had already made. The picking now lives behind that button, in a sheet.
 *   · **The payment rows read right to left.** The design (:460–469) is tag →
 *     name/note → dot: the 34×24 brand chip first, the 19×19 radio last. This
 *     drew the dot first and the chip second, so the one column the eye scans
 *     to tell Uzcard from Payme was in the middle of the row.
 *   · **The button was in a sticky bar.** The design (:488) puts it inline
 *     after the totals at `height:54px;margin-top:16px`, with `{{t.placeNote}}`
 *     centred under it. A bar pinned over the dock covered the tab bar the
 *     layout deliberately leaves visible on this screen.
 *
 * ---------------------------------------------------------------------------
 * The button places the order now, and the money is the server's arithmetic
 *
 * `POST /api/v1/public/orders` takes ids, quantities, a name, a number, an
 * address and the promo WORD — and prices every line through the kitchen's own
 * catalogue, applies the code itself, computes the fee from the branch's
 * setting and answers with a bill number. Nothing that is money goes up. The
 * figures on this screen are a preview of that arithmetic, which is why they
 * are computed by the same `billTotals()` the server's `BillTotals::of()`
 * mirrors — and why a promo the cart showed and the server refused is said out
 * loud rather than quietly charged.
 *
 * Then one of two endings. A cash or card-at-the-door order is already on a
 * pass — the API fired the dockets inside the same transaction — so tracking is
 * the next screen. An online one is NOT: it waits at `draft` with
 * `payment_state = 'pending'`, no docket anywhere, until a provider says the
 * money landed. So the phone is handed to the provider's own app and comes back
 * through the deep link.
 */

/**
 * The chip each rail wears, as the design's own method table writes it (:1068).
 *
 * Every rail carries its own pair there — `bg: "var(--brand-100)", fg:
 * "var(--brand-700)"` for the cards, `--accent-100`/`--accent-700` for Click,
 * `--bg-muted`/`--fg-muted` for cash — and this screen painted all four in the
 * muted pair. That is the CASH chip: Uzcard, Click and Payme all wore the "hand
 * it to the courier" colour, and the tag, which is the only mark that separates
 * a card from a wallet at a glance, said nothing at all.
 *
 * Token names rather than values, because a hex here would be the light theme's
 * hex on a dark screen.
 */
const RAIL_CHIP: Readonly<Record<string, { bg: Colour; fg: Colour }>> = {
  card: { bg: 'brand100', fg: 'brand700' },
  click: { bg: 'accent100', fg: 'accent700' },
  payme: { bg: 'brand100', fg: 'brand700' },
  cash: { bg: 'bgMuted', fg: 'fgMuted' },
};

export default function PayScreen() {
  const c = useTheme();
  const { lang } = useLocale();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const basket = useCart();
  const { note, say: announce } = useNotice();

  const t = copy(PAY, lang);
  const s = copy(SHARED, lang);
  const a = copy(AUTH, lang);

  const [railId, setRailId] = useState(PAYMENT_RAILS[0]?.id ?? 'card');
  const [addressId, setAddressId] = useState(
    (SAVED_ADDRESSES.find((address) => address.primary) ?? SAVED_ADDRESSES[0])?.id ?? '',
  );
  const [tipPercent, setTipPercent] = useState(0);
  const [placing, setPlacing] = useState(false);

  /*
   * Which list the "O'zgartirish" button opened, or none.
   *
   * The design's card shows one address and one branch and its own Change
   * control does nothing but flash a sentence (:1086). Here both are real —
   * `setAddressId` picks the courier's destination and `cart.setBranch` is a
   * basket write — so the rows the card replaced moved into a sheet rather than
   * being deleted. A checkout that shows the chosen line and hides the other
   * four is the design's whole point; losing the ability to change it would not
   * be.
   */
  const [picking, setPicking] = useState<'address' | 'branch' | null>(null);

  /*
   * Who is ordering, and where to.
   *
   * Null until the profile answers, and null forever for a guest who never
   * signs in — which is a supported way to order here. The number is then typed
   * on this screen, because the API needs one: a courier rings it, and the
   * tracking endpoint is guarded by its last four digits. What the screen must
   * NOT do is send a fixture address to a courier, so `place()` refuses a
   * delivery with no live address rather than dispatching one to "Chilonzor 9".
   */
  const [me, setMe] = useState<{ name: string; phone: string } | null>(null);
  const [addresses, setAddresses] = useState<readonly Address[] | null>(null);
  const [digits, setDigits] = useState('');

  useEffect(() => {
    let live = true;

    void (async () => {
      const profile = await readProfile(lang);

      if (!live || profile === null) return;

      setMe({ name: profile.name ?? '', phone: profile.phone });

      const book = await listAddresses(lang);

      if (!live || book === null) return;

      setAddresses(book);
      setAddressId((current) =>
        book.some((address) => String(address.id) === current)
          ? current
          : String((book.find((address) => address.is_default) ?? book[0])?.id ?? ''),
      );
    })();

    return () => {
      live = false;
    };
  }, [lang]);

  const delivering = basket.channel === 'delivery';
  const rail = PAYMENT_RAILS.find((option) => option.id === railId);
  const cash = rail?.isCash === true;

  const bill = billTotals({
    subtotal: basket.subtotal,
    channel: delivering ? 'delivery' : 'takeaway',
    discount: promoDiscount(basket.promo, basket.subtotal),
    /*
     * The venue's own fee, from `GET /api/v1/public/branches` through the cart
     * store — not the fixture's flat 12 000. The server recomputes it from the
     * same branch setting when it prices the bill, so the figure read here is
     * the figure charged.
     */
    deliveryFee: basket.deliveryFee,
  });

  /*
   * The tip is a percentage of the food, taken **before** the discount and never
   * on the delivery fee, then rounded to a whole 1 000 so'm.
   *
   * All three parts are the design's — `tipVal = round(sub * pct / 100 / 1000) *
   * 1000`, where `sub` is the pre-discount subtotal. A discount that cut the
   * courier's tip would be cutting it for a ride of the same distance, and an
   * exact 10% of 154 000 offers somebody 15 400 so'm: a number nobody carries,
   * and this is cash into a hand. The rounding step reuses `CASH_ROUNDING`
   * rather than declaring a second thousand.
   */
  const tip = delivering
    ? Math.round(percentOf(bill.subtotal, tipPercent) / CASH_ROUNDING) * CASH_ROUNDING
    : 0;

  const payable = bill.total + tip;
  const rounding = cash ? cashRoundingDelta(payable) : 0;
  const charged = cash ? roundedForCash(payable) : payable;

  /*
   * An empty basket cannot be paid for, and arriving here with one means a back
   * button after an order was placed. Sent away from an effect rather than
   * during the render: navigating while rendering updates the router mid-tree,
   * which React refuses in development. `placing` guards the one moment the
   * basket is legitimately empty — the order that just emptied it is on its way
   * to the tracking screen, and bouncing to the cart would race it there.
   */
  const empty = basket.resolved.length === 0;

  useEffect(() => {
    if (empty && !placing) router.replace('/customer/cart');
  }, [empty, placing, router]);

  /*
   * Who to ring, and what to call them.
   *
   * The signed-in number when there is one, the typed one otherwise. Nine
   * digits after `+998`, which is every Uzbek mobile — the prefix is drawn
   * beside the field rather than typed into it for the reason the sign-in
   * screen gives: asking for it produces `+998` twice about as often as it
   * produces a correct number.
   */
  const phone = me?.phone ?? (digits.length === 9 ? `+998${digits}` : '');
  const address = (addresses ?? []).find((option) => String(option.id) === addressId) ?? null;

  /*
   * The guest's own address book when they are signed in, and the design's
   * samples when they are not.
   *
   * Both are drawn and only one can be ordered to: `place()` refuses a delivery
   * with no live address rather than sending a courier to a fixture. Drawing
   * nothing for a signed-out guest would be a checkout with an empty card and
   * no explanation.
   */
  const sampling = addresses === null || addresses.length === 0;
  const sample = SAVED_ADDRESSES.find((option) => option.id === addressId) ?? null;

  /* `{{t.addrLine}}` (:442) is the street, not the "Uy" / "Ish" label — that one
     belongs to the list, and the list is now behind the Change button. */
  const addressLine =
    address?.full_line ?? (sampling && sample !== null ? say(sample.line, lang) : null);

  /* `{{t.addrSub}}` (:443) — "Domofon 17 · 4-qavat · lift bor", the note the
     courier is given. It was never drawn on this screen at all; the catalogue
     has carried it since the profile screen was built, attached to the primary
     address exactly as `profile.tsx` draws it. */
  const addressSub =
    address?.note ?? (sampling && sample?.primary === true ? say(ADDRESS_NOTE, lang) : null);

  /*
   * Why this basket cannot be sent, in one sentence, before it is tried.
   *
   * Three reasons, checked in the order a guest can act on: a sample catalogue
   * is nothing they can fix, a missing number is a field on this screen, a
   * missing address means signing in. Drawn under the totals rather than
   * flashed after the tap — a button that refuses with no reason beside it is
   * the one thing worse than a button that fails.
   */
  const blocked = !basket.orderable
    ? // Two ways a basket cannot be sent and two different things to do about
      // it: nothing, when the catalogue itself is a sample; and one tap each,
      // when the catalogue is real and the lines predate it.
      basket.menu.live
      ? t.staleBasket
      : t.sampleMenu
    : phone === ''
      ? t.phoneNeeded
      : delivering && address === null
        ? t.addressNeeded
        : null;

  if (empty && !placing) return null;

  /**
   * Turn the basket into a bill, and take the guest to whatever comes next.
   *
   * The basket is spent either way once the server has answered. Held on to, a
   * guest who lands back here from a provider would order the same dinner
   * twice.
   */
  async function place(): Promise<void> {
    if (blocked !== null) {
      announce(blocked, 'problem');

      return;
    }

    const payload = placeOrderPayloadFrom({
      channel: basket.channel,
      branchId: basket.branchId,
      lines: basket.resolved.map((entry) => entry.line),
      // A name is required and a number is a name of sorts: the kitchen prints
      // whatever this says on the docket, and a stranger who never signed in
      // has given us one identifier.
      name: me !== null && me.name !== '' ? me.name : phone,
      phone,
      address: address?.full_line ?? null,
      addressNote: address?.note ?? null,
      promoCode: basket.promo?.code ?? null,
      railId,
      source: 'app',
    });

    if (payload === null) {
      announce(t.sampleMenu, 'problem');

      return;
    }

    setPlacing(true);

    const answer = await placeOrder(lang, payload);

    if (!answer.ok) {
      setPlacing(false);
      // The server's own sentence in the reader's language when there is one —
      // "Manti hozir mavjud emas" is worth a great deal more than "rejected".
      announce(answer.message ?? t.rejected, 'problem');

      return;
    }

    const order = answer.data;

    cart.markPlaced(order.number, phone);
    cart.clear();

    /*
     * Whatever the guest has to be told on the next screen.
     *
     * A notice raised here dies with this screen — `useNotice` is per screen,
     * deliberately, so a message from the basket cannot appear over the payment
     * screen — so the one sentence that must survive the navigation rides in
     * the route instead. The rail failing outranks a promo that was refused:
     * one means the food is not being cooked.
     */
    let carried: string | null = basket.promo !== null && order.promo === null ? 'promo' : null;

    if (isOnlineRail(railId)) {
      try {
        const invoice = await openInvoice({
          orderId: order.id,
          orderNumber: order.number,
          railId,
          tenant: customerTenant(),
          // `srcp://customer/order` — the app is still running behind the
          // provider's, so coming back is a foreground, not a cold start.
          returnUrl: returnUrl('customer/order'),
        });

        if (!(await leaveForProvider(invoice))) carried = 'rail';
      } catch {
        // The rail refused — switched off for this tenant, a rotated key, no
        // signal. The order exists and is unpaid, which the tracking screen can
        // say; this screen cannot, because it is about to be gone.
        carried = 'rail';
      }
    }

    router.replace(
      carried === null
        ? '/customer/order'
        : { pathname: '/customer/order', params: { note: carried } },
    );
  }

  /** The sign-in / "they live in the profile" dead end, `GAPS.md §4.2 Y3`. */
  const addressHint = (
    <Pressable
      onPress={() => {
        // The notice lives on this screen, under the sheet — so the sheet
        // closes first or the sentence is raised where nobody can read it.
        setPicking(null);

        if (me === null) router.push('/customer/sign-in');
        else announce(t.addressesInProfile);
      }}
      accessibilityRole="button"
      style={({ pressed }) => [st.hint, pressed && PRESSED]}
    >
      <Text style={[st.hintText, { color: c.fgSubtle }]}>
        {me === null ? t.signInForAddresses : t.addressesInProfile}
      </Text>
    </Pressable>
  );

  return (
    <View style={st.fill}>
      <ScrollView
        contentContainerStyle={[st.page, { paddingTop: insets.top + 6 }]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/*
         * `display:flex;align-items:center;gap:12px` (:430) — a 34×34 bordered
         * square holding a 17px chevron, and the screen title BESIDE it.
         *
         * The word "Orqaga" is not in the design and it cost two lines: the
         * chevron and the word on one, "To'lov" on the next, which pushed the
         * whole checkout down by a heading's height on a 844pt screen.
         */}
        <View style={st.head}>
          <Pressable
            onPress={() => (router.canGoBack() ? router.back() : router.replace('/customer/cart'))}
            accessibilityRole="button"
            accessibilityLabel={s.back}
            style={({ pressed }) => [
              st.iconButton,
              { backgroundColor: c.surface, borderColor: c.border },
              pressed && PRESSED,
            ]}
          >
            <Chevron direction="left" size={17} colour={c.fg} />
          </Pressable>

          <Text style={[text.title, { color: c.fg }]} numberOfLines={1}>
            {t.heading}
          </Text>
        </View>

        {/* ---------------------------------------------------- where it goes */}
        {/*
         * One card, `margin-top:18px;padding:15px 17px` at `--radius-lg` on
         * `--surface` (:438 delivery, :449 pickup), with the caps label INSIDE
         * it. The legend used to sit above a list of radio rows, which is a
         * picker; the design draws an answer.
         */}
        <View style={[st.card, { backgroundColor: c.surface, borderColor: c.border }]}>
          <View style={st.cardHead}>
            <View style={st.cardMain}>
              <Text style={[st.caps, { color: c.fgSubtle }]}>
                {delivering ? t.addressHeading : t.pickupHeading}
              </Text>

              <Text style={[st.cardLine, { color: c.fg }]}>
                {delivering ? (addressLine ?? t.addressNeeded) : basket.branch.name}
              </Text>

              {/* Delivery gets the courier's note; pickup gets `{{t.pickSub}}`
                  (:453), which is the promise the branch makes — both at
                  `--text-xs` in `--fg-muted`, 3px under the line. */}
              {delivering ? (
                addressSub === null ? null : (
                  <Text style={[st.cardSub, text.num, { color: c.fgMuted }]}>{addressSub}</Text>
                )
              ) : (
                <Text style={[st.cardSub, text.num, { color: c.fgMuted }]}>{t.pickupNote}</Text>
              )}
            </View>

            {/*
             * `height:32px;padding:0 12px` on `--border-strong` (:445).
             *
             * The design draws it only on the delivery card, because its own
             * branch never changes. `cart.setBranch` is a basket write this
             * screen has always offered, so the pickup card carries the same
             * control rather than losing it.
             */}
            <Pressable
              onPress={() => setPicking(delivering ? 'address' : 'branch')}
              accessibilityRole="button"
              style={({ pressed }) => [
                st.change,
                { backgroundColor: c.surface, borderColor: c.borderStrong },
                pressed && PRESSED,
              ]}
            >
              <Text style={[st.changeText, { color: c.fg }]}>{s.change}</Text>
            </Pressable>
          </View>
        </View>

        {/* --------------------------------------------------- who is ordering */}
        {/* Only when nobody signed in. A signed-in guest's number is on their
            account and asking for it again is asking somebody to prove
            something they have already proved. The design's pay screen has no
            such field, so the field itself is the design's (:123): `height:52px;
            padding:0 15px` on `--border-strong`, a 1×22 rule after the prefix,
            and both halves at `--text-lg` 600. */}
        {me === null ? (
          <>
            <Text style={[st.caps, st.legend, { color: c.fgSubtle }]}>{a.phoneLabel}</Text>

            <View style={[st.phone, { backgroundColor: c.surface, borderColor: c.borderStrong }]}>
              <Text style={[st.phonePrefix, text.num, { color: c.fgSubtle }]}>+998</Text>
              <View style={[st.phoneRule, { backgroundColor: c.divider }]} />
              <TextInput
                value={groupPhone(digits)}
                onChangeText={(next) => setDigits(next.replace(/\D/g, '').slice(0, 9))}
                keyboardType="number-pad"
                textContentType="telephoneNumber"
                placeholder="90 123 45 67"
                placeholderTextColor={c.fgSubtle}
                accessibilityLabel={a.phoneLabel}
                style={[st.phoneField, text.num, { color: c.fg }]}
              />
            </View>
          </>
        ) : null}

        {/* --------------------------------------------------------- the rail */}
        {/* `margin:22px 0 9px` on the caps label, `display:grid;gap:9px` on the
            rows (:457) — it was 20 above, 8 below and 8 between. */}
        <Text style={[st.caps, st.legend, { color: c.fgSubtle }]}>{t.methodHeading}</Text>

        <View style={st.grid}>
          {PAYMENT_RAILS.map((option) => (
            <Choice
              key={option.id}
              on={option.id === railId}
              onPress={() => setRailId(option.id)}
              title={say(option.label, lang)}
              note={say(option.note, lang)}
              tag={option.tag}
              chip={RAIL_CHIP[option.id]}
            />
          ))}
        </View>

        {cash ? <Text style={[st.note, { color: c.fgSubtle }]}>{t.cashRounding}</Text> : null}

        {/* ---------------------------------------------------------- the tip */}
        {delivering ? (
          <>
            <Text style={[st.caps, st.legend, { color: c.fgSubtle }]}>{t.tipHeading}</Text>

            {/*
             * `flex:1;height:42px;border:1px solid var(--border);border-radius:
             * var(--radius-md);background:var(--surface)` (:476), turning
             * `--brand-500` with white text when chosen — `[data-chip][data-on]`
             * at :63. They were pill-shaped, borderless and sat on `--bg-muted`,
             * which is the design's DISABLED surface: the whole tip row read as
             * four controls nobody could press.
             */}
            <View style={st.tips}>
              {TIP_STEPS.map((step) => {
                const on = step === tipPercent;

                return (
                  <Pressable
                    key={step}
                    onPress={() => setTipPercent(step)}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: on }}
                    style={({ pressed }) => [
                      st.tip,
                      {
                        backgroundColor: on ? c.brand500 : c.surface,
                        borderColor: on ? c.brand500 : c.border,
                      },
                      pressed && PRESSED,
                    ]}
                  >
                    <Text style={[st.tipText, { color: on ? c.n0 : c.fgMuted }]}>
                      {step === 0 ? t.tipNone : `${step}%`}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            <Text style={[st.note, { color: c.fgSubtle }]}>{t.tipNote}</Text>
          </>
        ) : null}

        {/* -------------------------------------------------------- the total */}
        {/*
         * `margin-top:20px;padding:16px 18px;border:1px solid var(--border);
         * border-radius:var(--radius-lg);background:var(--bg-subtle)` (:481).
         *
         * The same card the cart's totals sit in, and the reason the two
         * screens have one is that they show the same arithmetic: a guest reads
         * the figure twice and has to recognise it the second time. Here it was
         * a bare stack of rows on the page background.
         */}
        <View style={[st.totals, { backgroundColor: c.bgSubtle, borderColor: c.border }]}>
          <Line label={s.items} value={som(bill.subtotal, lang)} />

          {/* No tone on the discount: `row()` (:846) gives every line but the
              last the same `--fg-muted` at 500, and a green figure here was an
              invention this screen made on its own. */}
          {bill.discount > 0 ? (
            <Line label={s.discount} value={`−${som(bill.discount, lang)}`} />
          ) : null}

          <Line
            label={delivering ? s.delivery : s.pickup}
            value={bill.deliveryFee === 0 ? s.free : som(bill.deliveryFee, lang)}
          />

          {/* The tip row is always drawn on a delivery and prints "—" at zero: a
              row that appears only once a chip is tapped is a row nobody knew
              they could have. */}
          {delivering ? <Line label={t.tipHeading} value={tip > 0 ? som(tip, lang) : '—'} /> : null}

          {rounding === 0 ? null : (
            <Line
              label={t.rounding}
              value={`${rounding > 0 ? '+' : '−'}${som(Math.abs(rounding), lang)}`}
            />
          )}

          {/* `kind === "big"`: 17px at 700 in `--fg`, `padding:12px 0 0` over a
              `1px solid var(--border)` rule. The label was 15px and the figure
              was 20px display — two different sizes on one line. */}
          <View style={[st.grand, { borderColor: c.border }]}>
            <Text style={[st.grandText, { color: c.fg }]}>{t.toPay}</Text>
            <Text style={[st.grandText, text.num, { color: c.fg }]}>{som(charged, lang)}</Text>
          </View>
        </View>

        {/* The reason, above the button that will not work without it. */}
        {blocked === null ? null : (
          <Text
            accessibilityLiveRegion="polite"
            style={[st.foot, st.reason, { color: c.danger600 }]}
          >
            {blocked}
          </Text>
        )}

        {/*
         * `width:100%;height:54px;margin-top:16px` (:488), two spans with
         * `gap:9px` and the figure at `opacity:.85`.
         *
         * Written out rather than handed to `<Button>`: that primitive wraps its
         * children in a single `<Text>`, and a gap between two runs of text does
         * not exist inside one — the screen was drawing "Buyurtma berish · 163
         * 000 so'm" with a middle dot the design never draws.
         */}
        <Pressable
          onPress={() => void place()}
          disabled={placing || blocked !== null}
          accessibilityRole="button"
          accessibilityState={{ disabled: placing || blocked !== null }}
          style={({ pressed }) => [
            st.place,
            { backgroundColor: c.brand500 },
            blocked !== null && st.placeAfterReason,
            pressed && PRESSED,
            (placing || blocked !== null) && st.dim,
          ]}
        >
          <Text style={[text.button, { color: c.n0 }]} numberOfLines={1}>
            {placing ? t.placing : t.place}
          </Text>

          {placing ? null : (
            <Text style={[text.button, text.num, st.figure, { color: c.n0 }]} numberOfLines={1}>
              {som(charged, lang)}
            </Text>
          )}
        </Pressable>

        {/* `margin-top:10px;line-height:1.5;text-align:center` at `--text-2xs`
            (:492) — it was left-aligned at 12px inside the totals block. */}
        <Text style={[st.foot, { color: c.fgSubtle }]}>{t.placeNote}</Text>
      </ScrollView>

      {/*
       * What the Change button opens.
       *
       * A `Modal` rather than a route, for `dish-sheet.tsx`'s reason: the web
       * build keeps the whole checkout at `/customer/pay`, and a native segment
       * with no browser counterpart is a deep link that 404s.
       */}
      <Modal
        visible={picking !== null}
        animationType="slide"
        onRequestClose={() => setPicking(null)}
      >
        <View style={[st.fill, { backgroundColor: c.bg, paddingTop: insets.top + 6 }]}>
          <View style={[st.head, st.gutter]}>
            <Pressable
              onPress={() => setPicking(null)}
              accessibilityRole="button"
              accessibilityLabel={s.back}
              style={({ pressed }) => [
                st.iconButton,
                { backgroundColor: c.surface, borderColor: c.border },
                pressed && PRESSED,
              ]}
            >
              <Chevron direction="down" size={17} colour={c.fg} />
            </Pressable>

            <Text style={[text.title, { color: c.fg }]} numberOfLines={1}>
              {picking === 'branch' ? t.pickupHeading : t.addressHeading}
            </Text>
          </View>

          <ScrollView
            contentContainerStyle={[st.gutter, st.sheetBody, { paddingBottom: insets.bottom + 24 }]}
          >
            <View style={st.grid}>
              {picking === 'branch'
                ? basket.venues.branches.map((branch) => (
                    <Choice
                      key={branch.id}
                      on={branch.id === basket.branchId}
                      onPress={() => {
                        cart.setBranch(branch.id);
                        setPicking(null);
                      }}
                      title={branch.name}
                      note={branch.address}
                    />
                  ))
                : (addresses ?? []).map((option) => (
                    <Choice
                      key={option.id}
                      on={String(option.id) === addressId}
                      onPress={() => {
                        setAddressId(String(option.id));
                        setPicking(null);
                      }}
                      title={option.label}
                      note={option.full_line}
                    />
                  ))}

              {picking === 'address' && sampling
                ? SAVED_ADDRESSES.map((option) => (
                    <Choice
                      key={option.id}
                      on={option.id === addressId}
                      onPress={() => {
                        setAddressId(option.id);
                        setPicking(null);
                      }}
                      title={say(option.label, lang)}
                      note={say(option.line, lang)}
                    />
                  ))
                : null}
            </View>

            {picking === 'address' ? addressHint : null}
          </ScrollView>
        </View>
      </Modal>

      <Notice note={note} bottom={insets.bottom + 84} />
    </View>
  );
}

/** "90 123 45 67" — the grouping the sign-in screen's own field produces. */
function groupPhone(digits: string): string {
  return [digits.slice(0, 2), digits.slice(2, 5), digits.slice(5, 7), digits.slice(7, 9)]
    .filter(Boolean)
    .join(' ');
}

/**
 * One selectable row — a payment rail, an address, a branch.
 *
 * `display:flex;align-items:center;gap:13px;padding:14px 15px` (:460), and the
 * order of the three children is the design's: **tag, then the words, then the
 * dot**. This drew the dot first and the tag second, which put the one mark
 * that identifies a rail in the middle of the row and the radio where a
 * left-to-right reader looks for a logo.
 *
 * `accessibilityRole="radio"` with a state rather than a plain button: a guest
 * paying with VoiceOver has to hear which of four rails is chosen, and the mark
 * at the end is the only other thing that says so.
 */
function Choice({
  on,
  onPress,
  title,
  note,
  tag,
  chip,
}: {
  on: boolean;
  onPress: () => void;
  title: string;
  note: string;
  tag?: string;
  chip?: { bg: Colour; fg: Colour };
}) {
  const c = useTheme();

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ selected: on }}
      style={({ pressed }) => [
        st.choice,
        {
          // `[data-opt][data-on="true"]` (:64) — `--brand-50` behind a
          // `--brand-500` edge, `--surface` behind `--border` otherwise.
          backgroundColor: on ? c.brand50 : c.surface,
          borderColor: on ? c.brand500 : c.border,
        },
        pressed && PRESSED,
      ]}
    >
      {/* `width:34px;height:24px;border-radius:5px` at `--text-3xs` 700 (:461).
          It was 36×32 at `--radius-sm` with 12px type — a chip half again as
          tall as the design's, in the wrong colour. */}
      {tag === undefined ? null : (
        <View style={[st.tag, { backgroundColor: c[chip?.bg ?? 'bgMuted'] }]}>
          <Text style={[st.tagText, { color: c[chip?.fg ?? 'fgMuted'] }]}>{tag}</Text>
        </View>
      )}

      <View style={st.choiceMain}>
        <Text style={[st.choiceTitle, { color: c.fg }]} numberOfLines={1}>
          {title}
        </Text>
        <Text style={[st.choiceNote, { color: c.fgSubtle }]} numberOfLines={1}>
          {note}
        </Text>
      </View>

      {/* `width:19px;height:19px;border:1.6px` around a `7px` white pip (:466).
          It was 20×20 around a 10px brand-coloured one, on no fill at all — so
          a chosen rail showed a blue dot inside a blue ring instead of the
          design's filled disc. */}
      <View
        style={[
          st.mark,
          {
            borderColor: on ? c.brand500 : c.borderStrong,
            backgroundColor: on ? c.brand500 : 'transparent',
          },
        ]}
      >
        {on ? <View style={[st.markOn, { backgroundColor: c.n0 }]} /> : null}
      </View>
    </Pressable>
  );
}

/** A totals row — `row()` at :846, the plain kind: 13px at 500 in `--fg-muted`. */
function Line({ label, value }: { label: string; value: string }) {
  const c = useTheme();

  return (
    <View style={st.line}>
      <Text style={[st.lineText, { color: c.fgMuted }]}>{label}</Text>
      <Text style={[st.lineText, text.num, { color: c.fgMuted }]}>{value}</Text>
    </View>
  );
}

const st = StyleSheet.create({
  fill: { flex: 1 },
  /* `padding:6px 20px 24px` (:429) — the gutter is the tab layout's
     `sceneStyle`, so only the vertical half is set here. It was 40 at the
     bottom to clear a sticky bar that no longer exists. */
  page: { paddingBottom: 24 },
  gutter: { paddingHorizontal: size.sp5 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  iconButton: {
    width: 34,
    height: 34,
    borderWidth: 1,
    borderRadius: size.radiusMd,
    alignItems: 'center',
    justifyContent: 'center',
  },
  card: {
    marginTop: 18,
    paddingVertical: 15,
    paddingHorizontal: 17,
    borderWidth: 1,
    borderRadius: size.radiusLg,
  },
  cardHead: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
  },
  cardMain: { flex: 1, minWidth: 0 },
  cardLine: { ...sansAt(600, 13, 1.4), marginTop: 6 },
  cardSub: { ...sansAt(400, 12, 1.45), marginTop: 3 },
  change: {
    height: 32,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderRadius: size.radiusMd,
    alignItems: 'center',
    justifyContent: 'center',
  },
  changeText: sansAt(600, 12, 1.2),
  /* The section label is `--text-2xs` — 11px — not the 10px `text.caps`: every
     caps heading in `at.pay` (:440, :457, :473) is a point larger than the one
     preset that carries uppercase. */
  caps: {
    ...sansAt(600, 11, 1.25),
    letterSpacing: tracking(raw.trackingCaps, 11),
    textTransform: 'uppercase' as const,
  },
  legend: { marginTop: 22, marginBottom: 9 },
  /* `display:grid;gap:9px` — a container gap, not a margin on every row: a
     margin on the last one pushes the next heading 9px past its own 22. */
  grid: { gap: 9 },
  choice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 13,
    paddingVertical: 14,
    paddingHorizontal: 15,
    borderWidth: 1,
    borderRadius: size.radiusMd,
  },
  tag: { width: 34, height: 24, borderRadius: 5, alignItems: 'center', justifyContent: 'center' },
  tagText: { ...sansAt(700, 10, 1.2), letterSpacing: tracking(raw.trackingWide, 10) },
  choiceMain: { flex: 1, minWidth: 0 },
  choiceTitle: sansAt(600, 13, 1.45),
  choiceNote: { ...sansAt(400, 11, 1.45), marginTop: 2 },
  mark: {
    width: 19,
    height: 19,
    borderWidth: 1.6,
    borderRadius: size.radiusPill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  markOn: { width: 7, height: 7, borderRadius: size.radiusPill },
  /* `font-size:var(--text-2xs);margin-top:8px;line-height:1.5` (:479). */
  note: { ...sansAt(400, 11, 1.5), marginTop: 8 },
  hint: { minHeight: 44, justifyContent: 'center' },
  hintText: { ...sansAt(400, 12, 1.45), textDecorationLine: 'underline' as const },
  phone: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    height: 52,
    paddingHorizontal: 15,
    borderWidth: 1,
    borderRadius: size.radiusMd,
  },
  phonePrefix: sansAt(600, 17, 1.2),
  phoneRule: { width: 1, height: 22 },
  phoneField: {
    flex: 1,
    minWidth: 0,
    padding: 0,
    height: 52,
    ...sansAt(600, 17, 1.2),
    letterSpacing: tracking(raw.trackingWide, 17),
  },
  tips: { flexDirection: 'row', gap: 8 },
  tip: {
    flex: 1,
    height: 42,
    borderWidth: 1,
    borderRadius: size.radiusMd,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tipText: sansAt(600, 13, 1.2),
  totals: {
    marginTop: 20,
    paddingVertical: 16,
    paddingHorizontal: 18,
    borderWidth: 1,
    borderRadius: size.radiusLg,
  },
  /* `padding:5px 0` on every row, `12px 0 0` over a rule on the last. */
  line: { flexDirection: 'row', justifyContent: 'space-between', gap: 12, paddingVertical: 5 },
  lineText: sansAt(500, 13, 1.45),
  grand: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
    paddingTop: 12,
    borderTopWidth: 1,
  },
  grandText: sansAt(700, 17, 1.3),
  place: {
    height: 54,
    marginTop: 16,
    borderRadius: size.radiusMd,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 9,
    paddingHorizontal: size.sp4,
  },
  /* The reason takes the 16 and leaves the button the design's inner 10. */
  placeAfterReason: { marginTop: 10 },
  figure: { opacity: 0.85 },
  dim: { opacity: 0.45 },
  foot: { ...sansAt(400, 11, 1.5), textAlign: 'center' as const, marginTop: 10 },
  reason: { marginTop: 16 },
  sheetBody: { paddingTop: 18 },
});
