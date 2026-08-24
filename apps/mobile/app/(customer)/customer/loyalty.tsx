import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { copy, LOYALTY_COPY } from '@restaurant/surfaces/customer/copy';
import {
  COUPONS,
  LOYALTY,
  LOYALTY_RULES,
  say,
  type Coupon,
} from '@restaurant/surfaces/customer/data';

import { readShelf, reserveCoupon, type Shelf } from '@/customer/account';
import { Star } from '@/ui/icons';
import { Notice, useNotice } from '@/ui/notice';
import { PRESSED } from '@/ui/primitives';
import { useLocale } from '@/lib/locale';
import { groupDigits } from '@/lib/money';
import { useTheme } from '@/lib/theme-context';
import { size } from '@/theme';
import { display, displayAt, sansAt, text } from '@/type';

/**
 * Loyalty — `Smart Restaurant Mijoz ilovasi.dc.html`, screen 8 (:561–:597).
 *
 * Points at the top, coupons under them, the rules at the bottom, in the order a
 * guest asks the questions: how many have I got, what can I spend, and how did I
 * get them.
 *
 * **The points figure is not money and is deliberately not drawn like one.** A
 * bare number with its own word, never through `som()` — a guest who reads 2 480
 * as so'm expects 2 480 so'm off and is wrong by two orders of magnitude.
 *
 * And it stands alone on its line. The screen used to set "≈ 24 000 so'm" beside
 * the balance, derived from `POINTS_PER`; the design draws one figure there
 * (:567) and answers "what is it worth" at the bottom of the screen instead —
 * rule two is "100 ball = 1 000 so'm chegirma". A second number on the same
 * baseline as a 38px balance reads as part of it, and the one thing this card
 * must not look like is a wallet.
 *
 * ---------------------------------------------------------------------------
 * The shelf is real, and pressing a coupon spends points
 *
 * `GET /api/v1/public/coupons` answers with the restaurant's own shelf, this
 * guest's balance and which coupons they already hold;
 * `POST .../{coupon}/reserve` takes the points and mints a code. Both writes
 * happen in one transaction on the server — points deducted with no coupon
 * written is the failure a guest cannot prove and the restaurant cannot see.
 *
 * With no session the fixture shelf is drawn and the button says where a coupon
 * takes effect, exactly as it did before: a balance nobody is signed in to is
 * not a balance anything can be spent from.
 */

/*
 * The dark card carries its own two whites (:566, :572, :575) instead of
 * reaching for a grey token. `--n-400` and `--n-700` are opaque greys mixed for
 * a light background; on `--n-900` they read as *disabled*, which is what the
 * label, the progress note and the whole unfilled half of the rail looked like.
 * A white at 66% is quieter text on this card; at 16% it is a groove in it.
 */
const ON_CARD = 'rgba(255,255,255,0.66)';
const CARD_TRACK = 'rgba(255,255,255,0.16)';

export default function LoyaltyScreen() {
  const c = useTheme();
  const { lang } = useLocale();
  const insets = useSafeAreaInsets();
  const { note, say: announce } = useNotice();

  const t = copy(LOYALTY_COPY, lang);

  const [shelf, setShelf] = useState<Shelf | null>(null);

  useEffect(() => {
    let live = true;

    void readShelf(lang).then((answer) => {
      if (live && answer !== null) setShelf(answer);
    });

    return () => {
      live = false;
    };
  }, [lang]);

  const points = shelf?.points ?? LOYALTY.points;

  return (
    <View style={st.fill}>
      <ScrollView
        contentContainerStyle={[st.page, { paddingTop: insets.top + 6 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* `--text-2xl` (24px) in Inter Tight (:563) — this was `text.title`,
            the 20px heading the design puts *above a section inside* a screen,
            so the page title and its sections were the same size. */}
        <Text style={[text.screenTitle, { color: c.fg }]}>{t.heading}</Text>

        {/* --------------------------------------------------------- points */}
        {/*
         * The dark card — the design's `--n-900` panel with the gold ramp on it.
         * Not an accent-tinted block: the promo card and the delivery note both
         * use that tint, and the one card meant to feel like a member's card
         * would read as another notice. The star and the gold bar are the two
         * things that make it one.
         *
         * `n900` and `n0` by name rather than `bg`/`fg`, because this card is the
         * same dark in both themes: a members' card that inverts with the phone's
         * appearance stops being a card.
         */}
        <View style={[st.card, { backgroundColor: c.n900 }]}>
          <Text style={[st.cardLabel, { color: ON_CARD }]}>{t.yourPoints}</Text>

          {/* `--text-4xl` (38px) at 700, `margin-top:3px` (:567). It was drawn
              at 30 — the design's `--text-3xl`, one step down. */}
          <Text style={[st.balance, text.num, { color: c.n0 }]}>{groupDigits(points)}</Text>

          <View style={st.tier}>
            <Star size={13} />
            <Text style={[st.tierLine, { color: c.n0 }]}>{t.silverTier}</Text>
          </View>

          {/*
           * A real progress bar with a value a screen reader can read: the bar is
           * the whole of what this card communicates, and "62 percent" is better
           * than silence.
           */}
          <View
            accessibilityRole="progressbar"
            accessibilityValue={{ min: 0, max: 100, now: LOYALTY.progressPercent }}
            accessibilityLabel={t.toGold}
            style={[st.track, { backgroundColor: CARD_TRACK, borderRadius: size.radiusPill }]}
          >
            <View
              style={[
                st.fillBar,
                {
                  width: `${LOYALTY.progressPercent}%`,
                  backgroundColor: c.ratingStar,
                  borderRadius: size.radiusPill,
                },
              ]}
            />
          </View>

          <Text style={[st.toGold, text.num, { color: ON_CARD }]}>{t.toGold}</Text>
        </View>

        {/* -------------------------------------------------------- coupons */}
        <Text style={[st.legend, { color: c.fgSubtle }]}>{t.coupons}</Text>

        {shelf === null
          ? COUPONS.map((coupon) => (
              <CouponRow
                key={coupon.id}
                coupon={coupon}
                use={t.use}
                onUse={() => {
                  /* Nobody is signed in, so there are no points to spend. The
                     old sentence still holds: it says where the coupon takes
                     effect rather than pretending to apply one. */
                  announce(`${say(coupon.name, lang)} · ${t.couponApplies}`);
                }}
              />
            ))
          : shelf.coupons.map((coupon) => (
              <CouponRow
                key={coupon.key}
                coupon={{
                  id: coupon.key,
                  name: coupon.name,
                  note: coupon.note ?? coupon.name,
                  /* The design's third line is a deadline — "31-avgustgacha"
                     (:584). `ShelfCoupon` has no such field, so the live row
                     draws two lines and stops. It used to pass the note through
                     as the expiry as well, which printed the same sentence
                     twice with a `·` between the copies. */
                  expires: null,
                  tone: coupon.tone,
                }}
                use={shelf.held.includes(coupon.id) ? t.couponApplies : t.use}
                onUse={() => {
                  void (async () => {
                    if (shelf.held.includes(coupon.id)) {
                      announce(`${say(coupon.name, lang)} · ${t.couponApplies}`);

                      return;
                    }

                    const taken = await reserveCoupon(lang, coupon.id);

                    if (!taken.ok) {
                      // "Ballar yetarli emas" and "you already hold this one"
                      // are different things to do next, and the API says which
                      // in the reader's language.
                      announce(taken.message ?? t.use, 'problem');

                      return;
                    }

                    setShelf({
                      ...shelf,
                      points: taken.meta.points,
                      held: [...shelf.held, coupon.id],
                    });

                    // The code is the point of the row: it is what gets typed
                    // into the promo field at checkout.
                    announce(`${taken.data.code} · ${t.couponApplies}`);
                  })();
                }}
              />
            ))}

        {/* ---------------------------------------------------------- rules */}
        <Text style={[st.legend, st.legendTight, { color: c.fgSubtle }]}>{t.howItWorks}</Text>

        {/*
         * Numbered 01 · 02 · 03, not bulleted (:593).
         *
         * The design counts these rules in a 22px column of Inter Tight at
         * `--fg-disabled`, and each row is a 12px band closed by a divider. The
         * screen drew a green `•` and no rule at all between the rows, which
         * turns three separate promises — how points are earned, what they are
         * worth, when they expire — into one soft paragraph.
         */}
        {LOYALTY_RULES.map((rule, i) => (
          <View key={rule.en} style={[st.rule, { borderBottomColor: c.divider }]}>
            <Text style={[st.ruleNo, text.num, { color: c.fgDisabled }]}>
              {String(i + 1).padStart(2, '0')}
            </Text>
            <Text style={[st.ruleText, { color: c.fgMuted }]}>{say(rule, lang)}</Text>
          </View>
        ))}
      </ScrollView>

      <Notice note={note} />
    </View>
  );
}

/** The four accents the design gives a coupon rail, kept as a token each. */
function CouponRow({
  coupon,
  use,
  onUse,
}: {
  /* `expires` is nullable here and not in `Coupon`: the fixture carries the
     deadline the design draws, the live shelf does not carry one at all. */
  coupon: Omit<Coupon, 'expires'> & { expires: Coupon['expires'] | null };
  use: string;
  onUse: () => void;
}) {
  const c = useTheme();
  const { lang } = useLocale();

  const rail = { accent: c.accent500, brand: c.brand500, warning: c.warning500 }[coupon.tone];

  return (
    /* `border:1px solid var(--border);border-left:3px solid {{c.color}}` (:580)
       — the rail *is* the left border, which is why the text starts 20px in
       (3 + `padding:15px 17px`) and why the rail curves into the 14px corner
       instead of running past it. It was an absolutely positioned 4px bar: one
       pixel too wide, laid inside the 1px border rather than replacing it, and
       every coupon's text began 2px short of where the design puts it. */
    <View
      style={[
        st.coupon,
        { backgroundColor: c.surface, borderColor: c.border, borderLeftColor: rail },
      ]}
    >
      <View style={st.couponMain}>
        <Text style={[st.couponName, { color: c.fg }]}>{say(coupon.name, lang)}</Text>

        {/* Two lines, at two sizes, in two colours (:583, :584): the condition
            at 12px `--fg-muted`, the deadline at 11px `--fg-subtle` under it.
            They were joined with a `·` at one size, so "3 kun qoldi" — the only
            thing on the row with a clock on it — read as more small print. */}
        <Text style={[st.couponNote, { color: c.fgMuted }]}>{say(coupon.note, lang)}</Text>

        {coupon.expires === null ? null : (
          <Text style={[st.couponExpiry, text.num, { color: c.fgSubtle }]}>
            {say(coupon.expires, lang)}
          </Text>
        )}
      </View>

      {/* `height:34px;padding:0 14px` (:586) — a 44pt-tall pill before, which is
          the touch target and not the button. The reach comes back as hit slop,
          the way every small control in this app takes it. */}
      <Pressable
        onPress={onUse}
        accessibilityRole="button"
        hitSlop={{ top: 5, bottom: 5, left: 6, right: 6 }}
        style={({ pressed }) => [
          st.use,
          { backgroundColor: c.surface, borderColor: c.borderStrong },
          pressed && PRESSED,
        ]}
      >
        <Text style={[st.useLine, { color: c.fg }]}>{use}</Text>
      </Pressable>
    </View>
  );
}

const st = StyleSheet.create({
  fill: { flex: 1 },
  /* `padding:6px 20px 24px` (:562). The 20 across comes from the tab layout's
     `sceneStyle`; the 6 down sits under whatever the notch takes, because no
     header is drawn over this screen to hold it clear. */
  page: { paddingBottom: 24 },
  /* `margin-top:16px;padding:22px` (:565) — it was padded 20 all round. */
  card: { marginTop: size.sp4, padding: 22, borderRadius: size.radiusLg },
  cardLabel: { ...sansAt(400, 12, 1.45) },
  balance: { ...displayAt(700, 38), marginTop: 3 },
  /* `gap:7px;margin-top:12px` (:568). */
  tier: { flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: size.sp3 },
  tierLine: { ...sansAt(600, 13, 1.45) },
  /* `height:5px;margin-top:14px` (:572). */
  track: { height: 5, marginTop: 14, overflow: 'hidden' },
  fillBar: { height: 5 },
  toGold: { ...sansAt(400, 12, 1.45), marginTop: size.sp2 },
  /*
   * `--text-2xs` (11px) at 600, `.08em` uppercase, `margin:22px 0 10px` (:578).
   *
   * Not `text.caps`: that preset is the design's *10px* micro-label and these
   * two section labels are the 11px one, so both legends were drawn a step
   * small. `0.88` is `--tracking-caps` (.08em) at 11px.
   */
  legend: {
    ...sansAt(600, 11, 1.45),
    letterSpacing: 0.88,
    textTransform: 'uppercase',
    marginTop: 22,
    marginBottom: 10,
  },
  /*
   * `margin:22px 0 4px` (:590) — 4px under it because a divider opens the first
   * rule and 10px over a rule reads as a hole in the list.
   *
   * 12 above it, not 22, and that is the design's 22 rather than a departure
   * from it: in a browser this margin collapses against the last coupon's
   * `margin-bottom:10px` (:580) and the gap is `max(10, 22)` = 22. React Native
   * has no margin collapsing, so 22 here would draw 32.
   */
  legendTight: { marginTop: 12, marginBottom: 4 },
  coupon: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 15,
    paddingHorizontal: 17,
    borderWidth: 1,
    borderLeftWidth: 3,
    borderRadius: size.radiusLg,
    marginBottom: 10,
    overflow: 'hidden',
  },
  couponMain: { flex: 1, minWidth: 0 },
  couponName: { ...sansAt(600, 13, 1.45) },
  couponNote: { ...sansAt(400, 12, 1.45), marginTop: 3 },
  couponExpiry: { ...sansAt(400, 11, 1.45), marginTop: 4 },
  use: {
    height: 34,
    flexShrink: 0,
    paddingHorizontal: 14,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderRadius: size.radiusMd,
  },
  useLine: { ...sansAt(600, 12, 1.2) },
  /* `gap:12px;padding:12px 0;border-bottom:1px solid var(--divider)` (:592). */
  rule: { flexDirection: 'row', gap: 12, paddingVertical: 12, borderBottomWidth: 1 },
  /* The counter: 22px wide, Inter Tight 13/700, `--fg-disabled` (:593).
     Spelled out rather than through `displayAt`, which brings
     `--tracking-tight` with it — the balance (:567) asks for that tracking and
     this line is the one place in the file that does not. */
  ruleNo: { ...display(700), fontSize: 13, lineHeight: 15, width: 22, flexShrink: 0 },
  ruleText: { ...sansAt(400, 13, 1.5), flex: 1, minWidth: 0 },
});
