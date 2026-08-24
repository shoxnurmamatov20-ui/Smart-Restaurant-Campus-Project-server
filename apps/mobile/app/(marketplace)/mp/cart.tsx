import { router } from 'expo-router';
import { useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { VAT_PERCENT, billTotals, percentOf } from '@restaurant/surfaces/money';
import { fill, t } from '@restaurant/surfaces/mp/copy';
import {
  MP_PROMO,
  PAY_RAILS,
  PAY_RAIL_MARKS,
  say,
  type PayRail,
} from '@restaurant/surfaces/mp/data';

import { basket, useBasket, type ResolvedLine } from '@/mp/basket';
import { hasMarketplaceSession, TOKEN_REQUIRED, useMpPlus } from '@/mp/live';
import { SignInSheet } from '@/mp/sign-in-sheet';
import { PRESSED } from '@/ui/primitives';
import { Check } from '@/ui/icons';
import { Notice, useNotice } from '@/ui/notice';
import { useLocale } from '@/lib/locale';
import { som } from '@/lib/money';
import { useMpTheme } from '@/lib/theme-context';
import { display, sans, text } from '@/type';

/**
 * MyPOS, screen 3 — the basket, the payment method and the total, on one page.
 *
 * `Ilova.dc.html:244-306`. One screen rather than a three-step wizard, because a
 * guest who changes their mind about the card after choosing an address should
 * not lose the address. The address itself lives in the home screen's header,
 * where it belongs: it decides which stores can be reached at all, not just
 * where this one order goes.
 *
 * **Two service charges, and only one of them applies here.** The restaurant's
 * ten per cent is dine-in — `chargesService()` refuses it on a delivery — and the
 * three per cent on this summary is the marketplace's own, read from
 * `GET /mp/plus` so the figure on screen is the figure the order will be charged
 * at.
 *
 * **The arithmetic is `@restaurant/surfaces/money` and nothing here multiplies
 * anything.** That module mirrors `App\Support\Orders\BillTotals` line for line,
 * VAT extracted rather than added, and the web cart screen reads the same one. A
 * second calculator on the phone is how a guest sees one total here and another
 * on the receipt, with the courier standing in the doorway.
 *
 * **What this screen computes is a quote; what the order costs is the answer.**
 * `POST /mp/orders` prices the basket again on the server — the promo code, the
 * delivery fee, the service percent and the minimum are all decided there — and
 * a refusal comes back as a code with the sentence in three languages. The
 * refusals get shown as the server wrote them (`marketplace.store_closed`,
 * `dish_unavailable`, `below_minimum`), because a specific reason is what a
 * person can act on; `placeFailed` is only what is left when the server could
 * not be reached at all.
 *
 * **The palette is the marketplace's own** (`useMpTheme`), not the restaurant's.
 * MyPOS is a second product in the same binary — its brand lightens on dark, its
 * "free" green is `--ok-fg`, and the ground under the cart is `--surface`
 * (:95), which in dark is a step lighter than the restaurant's page. Reading the
 * console's palette here drew a MyPOS screen in a restaurant's colours.
 */

/** The action bar's own height — a 52pt button between 12pt of padding (:300). */
const BAR_HEIGHT = 52 + 12 * 2;

/**
 * White on a coloured tile — a literal, not a token.
 *
 * The design writes `color:#fff` on the store mark and on the wallet logo
 * (:247, :279), because both sit on a colour of their own — `#C2410C`, Click's
 * blue — that does not follow the theme. `n0` does follow it: the marketplace
 * palette's `n0` is `#0B0E16` in dark, so reading the token would set the
 * initials in near-black on an orange tile.
 */
const ON_TINT = '#FFFFFF';

export default function MarketplaceCart() {
  const c = useMpTheme();
  const { lang } = useLocale();
  const { note, say: flash } = useNotice();
  const { lines, store, subtotal, rail, promo, discount, promoCode, address } = useBasket();

  const plus = useMpPlus(lang);
  const [signIn, setSignIn] = useState(false);
  const [busy, setBusy] = useState(false);

  /* MyPOS Plus buys free delivery — the threshold is the server's, and it is
     zero today, which is what "at any basket size" in `PLUS_ROWS` means. Read
     rather than assumed, so raising it one day changes one place. */
  const free =
    plus.data.active && plus.data.freeDelivery && subtotal >= plus.data.freeDeliveryMinimum;
  const fee = free ? 0 : (store?.deliveryFee ?? 0);

  const totals = billTotals({ subtotal, channel: 'delivery', deliveryFee: fee });
  const platformService = percentOf(subtotal, plus.data.servicePercent);
  const payable = totals.total + platformService - discount;

  const send = async () => {
    /* One press, one order. The button is not disabled — a disabled button in a
       list that just scrolled reads as broken — but the second press does
       nothing until the first has an answer. */
    if (busy) return;

    if (address === null) {
      flash(t('addrTitle', lang), 'problem');

      return;
    }

    /*
     * Asked before the POST rather than after the 401: a guest with no session
     * gets the sheet instead of a refusal they cannot read, and the paid write
     * is never attempted.
     */
    if (!(await hasMarketplaceSession())) {
      setSignIn(true);

      return;
    }

    setBusy(true);
    const sent = await basket.place(lang, promoCode);
    setBusy(false);

    if (!sent.ok) {
      /* A token that has run out looks like any other refusal in the envelope,
         and it is the one a sentence cannot fix: the guest needs the sheet, not
         an explanation. Everything else is the server's own words, because a
         specific reason is what a person can act on. */
      if (sent.code === TOKEN_REQUIRED) {
        setSignIn(true);

        return;
      }

      flash(sent.message ?? t('placeFailed', lang), 'problem');

      return;
    }

    router.navigate('/mp/track');
    flash(`${t('placed', lang)} · ${sent.data.number}`);
  };

  return (
    <View style={[s.fill, { backgroundColor: c.surface }]}>
      <FlatList
        data={lines}
        keyExtractor={(line) => line.dish.id}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={s.list}
        ListHeaderComponent={
          store === null ? undefined : (
            <View style={[s.shop, { borderBottomColor: c.divider }]}>
              <View style={[s.mark, { backgroundColor: store.tint }]}>
                <Text style={[s.markLine, { color: ON_TINT }]}>{store.initials}</Text>
              </View>

              <View style={s.shopMain}>
                <Text style={[s.shopName, { color: c.fg }]} numberOfLines={1}>
                  {store.name}
                </Text>
                <Text style={[s.shopMeta, text.num, { color: c.fgSubtle }]} numberOfLines={1}>
                  {fill(t('window', lang), { from: store.minutesFrom, to: store.minutesTo })}
                  {store.distanceMetres === null
                    ? ''
                    : ` · ${fill(t('km', lang), { n: store.distanceKm })}`}
                </Text>
              </View>

              <Pressable
                onPress={() => router.navigate(`/mp/store/${store.id}`)}
                accessibilityRole="button"
                /* `height:32px;padding:0 12px;border-radius:9px` — :252. It was a
                   44pt box, which is the reach rule answered with a taller
                   button; the design answers it with a hit slop instead. */
                hitSlop={6}
                style={({ pressed }) => [
                  s.addMore,
                  { borderColor: c.border, backgroundColor: c.surface },
                  pressed && PRESSED,
                ]}
              >
                <Text style={[s.addMoreLine, { color: c.fgMuted }]}>{t('add', lang)}</Text>
              </Pressable>
            </View>
          )
        }
        /*
         * An empty basket is a line inside the cart, not a different screen.
         *
         * `:255-257` keeps the store header, drops the action bar and puts one
         * centred 13px sentence where the lines would be. This screen used to
         * replace the whole page with a title, a body and a "back to
         * restaurants" button — so removing the last dish looked like being
         * thrown out of the shop rather than emptying a basket inside it.
         *
         * The sentence is one line, `t.cartEmpty` (:789). The catalogue keeps it
         * as two keys, so the two clauses are joined here rather than drawn as a
         * heading over a body.
         */
        ListEmptyComponent={
          <Text style={[s.emptyLine, { color: c.fgSubtle }]}>
            {`${t('empty', lang)}. ${t('emptySub', lang)}`}
          </Text>
        }
        renderItem={({ item }) => <Line line={item} lang={lang} />}
        ListFooterComponent={
          <View>
            {/*
             * The address block is an addition, and this is the record of it.
             *
             * The design has no address on the cart (:245-297) because its
             * header carries one — the phone's home screen does too, but a guest
             * arrives here from a push or from the dock without passing it, and
             * `send()` refuses an order with no address. Showing what the order
             * is about to be sent to is cheaper than the refusal.
             */}
            <Text style={[s.microLabel, { color: c.fgSubtle }]}>{t('addrTitle', lang)}</Text>
            <Text style={[s.address, { color: c.fg }]} numberOfLines={2}>
              {address === null ? t('addrSub', lang) : `${address.label} · ${address.address}`}
            </Text>

            {/* ---------------------------------------------- payment */}
            <Text style={[s.microLabel, { color: c.fgSubtle }]}>{t('payLbl', lang)}</Text>

            <View style={s.rails}>
              {PAY_RAILS.map((option) => (
                <RailRow
                  key={option}
                  rail={option}
                  lang={lang}
                  on={option === rail}
                  onPick={() => basket.setRail(option)}
                />
              ))}
            </View>

            {/*
             * The promo control is an addition too.
             *
             * The design shows a code only after it has been applied, as the
             * fourth summary line (`coTotals[3]`, :721) — its mock arrives with
             * one already on. A phone has no other door: there is no keyboard
             * step and no promo screen, so without this row the line can never
             * appear. It borrows the pay option's own geometry (:277) so it
             * reads as part of that stack rather than as a foreign card.
             */}
            <Pressable
              onPress={() => {
                const on = basket.togglePromo();

                flash(on ? t('promoOk', lang) : t('promoNote', lang));
              }}
              accessibilityRole="button"
              accessibilityState={{ selected: promo }}
              style={({ pressed }) => [
                s.promo,
                {
                  borderColor: promo ? c.ok : c.border,
                  backgroundColor: promo ? c.okSoft : c.surface,
                },
                pressed && PRESSED,
              ]}
            >
              <Text style={[s.promoCode, text.num, { color: promo ? c.okFg : c.fg }]}>
                {MP_PROMO.code}
              </Text>
              <Text style={[s.promoAction, { color: promo ? c.okFg : c.brand }]}>
                {promo ? t('promoApplied', lang) : t('promoApply', lang)}
              </Text>
            </Pressable>

            {/* ----------------------------------------------- totals */}
            <View style={[s.totals, { borderTopColor: c.border }]}>
              <Sum label={t('items', lang)} value={som(subtotal, lang, false)} />
              <Sum
                label={t('delivery', lang)}
                value={fee === 0 ? t('freeDelivery', lang) : som(fee, lang, false)}
                tone={fee === 0 ? c.okFg : undefined}
              />
              <Sum
                label={fill(t('service', lang), { percent: plus.data.servicePercent })}
                value={som(platformService, lang, false)}
              />
              {promo ? (
                <Sum
                  label={MP_PROMO.code}
                  value={`− ${som(discount, lang, false)}`}
                  tone={c.okFg}
                  weight={600}
                />
              ) : null}
              <Sum label={t('total', lang)} value={som(payable, lang, false)} big />
            </View>

            {/*
             * One paragraph, which is what `t.cartNote` is (:296, :791).
             *
             * This was three stacked captions — VAT, the service-charge
             * explanation, one-code-per-order — where the design draws a single
             * 11px block, and the second sentence it does draw, that the order
             * goes straight to the kitchen, was on no screen at all.
             *
             * The kitchen is named from the basket. `placeNote` used to bake in
             * the mock's "Osh Xona"; it carries a `{store}` placeholder now, so
             * the sentence names the shop this cart actually belongs to and
             * says nothing at all when there is no shop yet.
             */}
            <Text style={[s.note, { color: c.fgSubtle }]}>
              {[
                fill(t('vatIn', lang), { percent: VAT_PERCENT }),
                store === undefined || store === null
                  ? t('why1H', lang)
                  : fill(t('placeNote', lang), { store: store.name }),
              ].join('. ')}
            </Text>
          </View>
        }
      />

      {/* The bar the thumb reaches for, and it goes with the last dish: `:299`
          hangs it on `cartHas`, so an empty basket has nothing to place. No
          safe-area padding of its own — the dock sits below this view and has
          already spent the bottom inset, so adding it again would float the
          button an inch above the dock. */}
      {lines.length === 0 ? null : (
        <View style={[s.bar, { backgroundColor: c.surface, borderTopColor: c.border }]}>
          <Pressable
            onPress={() => void send()}
            accessibilityRole="button"
            style={({ pressed }) => [s.place, { backgroundColor: c.brand }, pressed && PRESSED]}
          >
            {/* Two spans with `gap:9px`, the amount at `opacity:.85` — :302. It
                was one string at full strength, so the price read as part of the
                sentence instead of as the figure being agreed to. */}
            <Text style={[s.placeLine, { color: ON_TINT }]} numberOfLines={1}>
              {`${t('place', lang)} ·`}
            </Text>
            <Text style={[s.placeSum, text.num, { color: ON_TINT }]} numberOfLines={1}>
              {som(payable, lang)}
            </Text>
          </Pressable>
        </View>
      )}

      <SignInSheet
        open={signIn}
        onClose={() => setSignIn(false)}
        onDone={() => {
          setSignIn(false);
          // Straight on with what they were doing: the sheet was raised by a
          // press on "place the order", not by curiosity about the profile.
          void send();
        }}
        announce={flash}
      />

      {/* Clear of the action bar: 52pt of button plus its 12pt of padding. */}
      <Notice note={note} bottom={BAR_HEIGHT + 12} />
    </View>
  );
}

/**
 * One basket row — `:260-271`.
 *
 * One flex row, not two stacked ones: name and unit on the left, the stepper in
 * the middle, the sum in a 58pt cell at the end. It was drawn as a top row
 * (name, price) over a foot row (unit, stepper), which put the price at the top
 * right of a two-line block — nowhere near the row's end, and nowhere near the
 * column the other sums line up in.
 */
function Line({ line, lang }: { line: ResolvedLine; lang: 'uz' | 'ru' | 'en' }) {
  const c = useMpTheme();

  return (
    <View style={[s.line, { borderBottomColor: c.divider }]}>
      <View style={s.lineMain}>
        {/* `white-space:nowrap;text-overflow:ellipsis` — one line, not two. */}
        <Text style={[s.lineName, { color: c.fg }]} numberOfLines={1}>
          {say(line.dish.name, lang)}
        </Text>
        <Text style={[s.lineUnit, text.num, { color: c.fgSubtle }]} numberOfLines={1}>
          {`${som(line.dish.price, lang, false)} × ${line.quantity}`}
        </Text>
      </View>

      <View style={s.stepper}>
        <Step
          label={t('less', lang)}
          glyph="−"
          onPress={() => basket.setQuantity(line.dish.id, line.quantity - 1)}
        />
        <Text style={[s.qty, text.num, { color: c.fg }]}>{line.quantity}</Text>
        <Step
          label={t('more', lang)}
          glyph="+"
          onPress={() => basket.setQuantity(line.dish.id, line.quantity + 1)}
        />
      </View>

      <Text style={[s.lineSum, text.num, { color: c.fg }]}>{som(line.linePrice, lang, false)}</Text>
    </View>
  );
}

function Step({ label, glyph, onPress }: { label: string; glyph: string; onPress: () => void }) {
  const c = useMpTheme();

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      /* `width:32px;height:32px` — :266. The 44pt box the reach rule asks for is
         a hit slop here, not a bigger button: three 44pt controls in one row
         push the sum off the end of a 390pt screen. */
      hitSlop={6}
      style={({ pressed }) => [
        s.step,
        { borderColor: c.borderStrong, backgroundColor: c.surface },
        pressed && PRESSED,
      ]}
    >
      <Text style={[s.stepGlyph, { color: c.fg }]}>{glyph}</Text>
    </Pressable>
  );
}

/**
 * One payment rail — `:276-286`.
 *
 * The logo tile wears the wallet's own colour, which comes from `PAY_RAIL_MARKS`
 * rather than from the theme — Click's blue belongs to Click. A guest finds the
 * wallet they use by that colour before they read the word beside it.
 */
function RailRow({
  rail,
  lang,
  on,
  onPick,
}: {
  rail: PayRail;
  lang: 'uz' | 'ru' | 'en';
  on: boolean;
  onPick: () => void;
}) {
  const c = useMpTheme();
  const brand = PAY_RAIL_MARKS[rail];

  return (
    <Pressable
      onPress={onPick}
      accessibilityRole="radio"
      accessibilityState={{ selected: on, checked: on }}
      style={({ pressed }) => [
        s.rail,
        {
          borderColor: on ? c.brand : c.border,
          backgroundColor: on ? c.brandSoft : c.surface,
        },
        pressed && PRESSED,
      ]}
    >
      <View
        style={[
          s.radio,
          {
            borderColor: on ? c.brand : c.borderStrong,
            backgroundColor: on ? c.brand : 'transparent',
          },
        ]}
      >
        {on ? <Check size={10} /> : null}
      </View>

      <View style={[s.logo, { backgroundColor: brand.tint }]}>
        <Text style={[s.logoLine, { color: ON_TINT }]}>{brand.logo}</Text>
      </View>

      <View style={s.railMain}>
        <Text style={[s.railLabel, { color: c.fg }]} numberOfLines={1}>
          {t(`pay_${rail}` as 'pay_click', lang)}
        </Text>
        <Text style={[s.railNote, { color: c.fgMuted }]} numberOfLines={1}>
          {t(`payNote_${rail}` as 'payNote_click', lang)}
        </Text>
      </View>
    </Pressable>
  );
}

/**
 * One summary line — `coTotals`, `:289-292`.
 *
 * Three weights on one row shape: 13/500 muted for what was bought, 13/600 in
 * the green for a credit, 21/700 for Jami. The value carries `data-fd` and the
 * label does not, which is why they are two styles rather than one — money is
 * set in Inter Tight, its label in Inter.
 */
function Sum({
  label,
  value,
  tone,
  weight = 500,
  big = false,
}: {
  label: string;
  value: string;
  tone?: string;
  weight?: 500 | 600;
  big?: boolean;
}) {
  const c = useMpTheme();
  const colour = tone ?? (big ? c.fg : c.fgMuted);

  const labelStyle = big ? s.sumLabelBig : weight === 600 ? s.sumLabelStrong : s.sumLabel;
  /* Inter Tight is bundled at 600, 700 and 800. A 500 figure therefore keeps its
     weight in Inter rather than gaining one in the display face. */
  const valueStyle = big ? s.sumValueBig : weight === 600 ? s.sumValueStrong : s.sumLabel;

  return (
    <View style={s.sum}>
      <Text style={[labelStyle, { color: colour }]}>{label}</Text>
      <Text style={[valueStyle, text.num, { color: colour }]}>{value}</Text>
    </View>
  );
}

/*
 * Every number below is the design's own — `MyPOS Marketplace - Ilova.dc.html`,
 * with the line it comes from. This screen was built against a spacing scale
 * (18 → sp5 = 20, 14 → sp3 = 12) and a type ladder with no 14px and no 21px
 * step, so no gutter, no row and no figure on it was the size the design draws.
 * Rules are 1pt: `1` is 0.33 at @3x, which drew every
 * divider on this screen at a third of its weight.
 */
const s = StyleSheet.create({
  fill: { flex: 1 },
  /* The one padded scroll the whole cart lives in — `padding:6px 18px 20px`
     (:245). The gutter belongs to the container, so the dividers under the
     store header and under each line stop where the design stops them. */
  list: { paddingTop: 6, paddingHorizontal: 18, paddingBottom: 20 },

  /* `gap:11px;padding-bottom:14px;border-bottom:1px solid var(--divider)` — :246. */
  shop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    paddingBottom: 14,
    borderBottomWidth: 1,
  },
  /* `36×36;border-radius:10px` — :247. */
  mark: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  /* `font-family:'Inter Tight';font-size:12px;font-weight:800` — :247. It was
     Inter at 700, so the mark was a different face from every other monogram. */
  markLine: { ...display(800), fontSize: 12 },
  shopMain: { flex: 1, minWidth: 0 },
  /* `font-size:15px;font-weight:600` — :249. */
  shopName: { ...sans(600), fontSize: 15, lineHeight: 22 },
  /* `font-size:12px` and no margin above it — :250. */
  shopMeta: { ...sans(400), fontSize: 12, lineHeight: 17 },
  /* `height:32px;padding:0 12px;border:1px solid;border-radius:9px` — :252. */
  addMore: {
    height: 32,
    paddingHorizontal: 12,
    borderRadius: 9,
    borderWidth: 1,
    justifyContent: 'center',
  },
  /* `font-size:12px;font-weight:600` — :252. */
  addMoreLine: { ...sans(600), fontSize: 12, lineHeight: 17 },

  /* `padding:32px 0;text-align:center;font-size:13px;line-height:1.5` — :256. */
  emptyLine: {
    ...sans(400),
    fontSize: 13,
    lineHeight: 20,
    textAlign: 'center',
    paddingVertical: 32,
  },

  /* `gap:12px;padding:14px 0;border-bottom:1px solid var(--divider)` — :260. */
  line: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 14,
    borderBottomWidth: 1,
  },
  lineMain: { flex: 1, minWidth: 0 },
  /* `font-size:14px;font-weight:600` — :263. It was 15px, the body step. */
  lineName: { ...sans(600), fontSize: 14, lineHeight: 20 },
  /* `font-size:12px;margin-top:2px` — :264. */
  lineUnit: { ...sans(400), fontSize: 12, lineHeight: 17, marginTop: 2 },
  /* `gap:8px` — :265. */
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  /* `32×32;border:1px solid var(--border-strong);border-radius:9px` — :266. */
  step: {
    width: 32,
    height: 32,
    borderRadius: 9,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  /* `font-size:16px;line-height:1` — :266. */
  stepGlyph: { ...sans(400), fontSize: 16, lineHeight: 16 },
  /* `width:18px;text-align:center;font-size:14px;font-weight:700` — :267. */
  qty: { width: 18, textAlign: 'center', ...sans(700), fontSize: 14, lineHeight: 20 },
  /* `width:58px;text-align:right;font-size:13px;font-weight:600` — :270. */
  lineSum: { width: 58, textAlign: 'right', ...sans(600), fontSize: 13, lineHeight: 19 },

  /* `font-size:11px;font-weight:600;letter-spacing:.08em;margin:22px 0 9px` —
     :274. It was `text.caps`, which is the 10px step: every section label on
     this screen was drawn a point small. `.08em` at 11px is 0.88. */
  microLabel: {
    ...sans(600),
    fontSize: 11,
    lineHeight: 16,
    letterSpacing: 0.88,
    textTransform: 'uppercase',
    marginTop: 22,
    marginBottom: 9,
  },
  address: { ...sans(400), fontSize: 13, lineHeight: 19 },

  /* `display:grid;gap:8px` — :275. */
  rails: { gap: 8 },
  /* `padding:12px 13px;border:1px solid;border-radius:12px` — :277. The padding
     was 12 on all four sides and the radius 10. */
  rail: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 13,
    borderRadius: 12,
    borderWidth: 1,
  },
  /* `18×18;border-radius:50%;border:1.5px solid` — :278. */
  radio: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  /* `36×24;border-radius:6px` — :279. It was 40 wide with a 4pt radius. */
  logo: { width: 36, height: 24, borderRadius: 6, alignItems: 'center', justifyContent: 'center' },
  /* `font-size:9px;font-weight:800`, and no letter-spacing — :279. It was the
     10px caps preset, so a four-letter wordmark was tracked out past its tile. */
  logoLine: { ...sans(700), fontSize: 9, lineHeight: 13 },
  railMain: { flex: 1, minWidth: 0 },
  /* `font-size:13px;font-weight:600` — :281. */
  railLabel: { ...sans(600), fontSize: 13, lineHeight: 19 },
  /* `font-size:11px;margin-top:1px` — :282. */
  railNote: { ...sans(400), fontSize: 11, lineHeight: 16, marginTop: 1 },

  /* The pay option's own box (:277), one 12pt step below the rail stack. */
  promo: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    marginTop: 12,
    paddingVertical: 12,
    paddingHorizontal: 13,
    borderRadius: 12,
    borderWidth: 1,
  },
  promoCode: { ...sans(600), fontSize: 13, lineHeight: 19 },
  promoAction: { ...sans(600), fontSize: 11, lineHeight: 16 },

  /* `margin-top:20px;padding-top:14px;border-top:1px solid var(--border)` — :288. */
  totals: { marginTop: 20, paddingTop: 14, borderTopWidth: 1 },
  /* `margin-top:8px` on every row, including the first — :290. A `gap` would
     have skipped the first one and pulled the summary 8pt up into its rule. */
  sum: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: 12,
    marginTop: 8,
  },
  sumLabel: { ...sans(500), fontSize: 13, lineHeight: 19 },
  sumLabelStrong: { ...sans(600), fontSize: 13, lineHeight: 19 },
  sumValueStrong: { ...display(600), fontSize: 13, lineHeight: 19 },
  /* `font-size:21px;font-weight:700` — :722. It was `text.title`, 20px at the
     section-heading tracking, which is not a step the design uses here. */
  sumLabelBig: { ...sans(700), fontSize: 21, lineHeight: 30 },
  sumValueBig: { ...display(700), fontSize: 21, lineHeight: 30 },

  /* `font-size:11px;line-height:1.5;margin-top:12px` — :296. It was 12px, 16 up. */
  note: { ...sans(400), fontSize: 11, lineHeight: 17, marginTop: 12 },

  /* `padding:12px 18px;border-top:1px solid var(--border)` — :300. */
  bar: { paddingVertical: 12, paddingHorizontal: 18, borderTopWidth: 1 },
  /* `height:52px;border:0;border-radius:13px;gap:9px` — :301. The shared Button
     draws a 10pt radius and puts its children in one line of text, and this bar
     needs neither. */
  place: {
    height: 52,
    borderRadius: 13,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 9,
  },
  /* `font-size:15px;font-weight:600` — :301. */
  placeLine: { ...sans(600), fontSize: 15, lineHeight: 22 },
  placeSum: { ...sans(600), fontSize: 15, lineHeight: 22, opacity: 0.85 },
});
