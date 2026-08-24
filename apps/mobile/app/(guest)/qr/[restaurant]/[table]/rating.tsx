import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { fill } from '@restaurant/surfaces/guest/copy';
import { GOLD_CARD_PERCENT, railLabel } from '@restaurant/surfaces/guest/table-data';

import { sendFeedback } from '@/customer/account';
import { useGuestCopy } from '@/guest/copy';
import { useFlash } from '@/guest/flash';
import { Check, ChevronRight, Receipt, Star } from '@/guest/icons';
import { param, tableHref } from '@/guest/route';
import { useLocale } from '@/lib/locale';
import { som, somWord } from '@/lib/money';
import { useTheme } from '@/lib/theme-context';
import { size } from '@/theme';
import { displayAt, sans, sansAt, text } from '@/type';
import { PRESSED } from '@/ui/primitives';

/** How long a comment may be — `dc.html:1023`, `slice(0, 300)`. */
const COMMENT_MAX = 300;

/**
 * After paying: the receipt line, then the rating — `Mehmon.dc.html`, panel 06.
 *
 * In that order because it is the order the guest cares about. The first thing
 * somebody who has just paid wants is confirmation that they have; the rating is
 * a favour they may or may not do, and putting it above the confirmation reads
 * as a toll gate.
 *
 * **Everything below the stars waits for a star** — `dc.html:524` wraps it all
 * in `sc-if rated`. The screen used to ask for stars, six tags, a sentence and a
 * phone number at once, which is the shape a guest closes: they came to pay, the
 * meal is over, and a form is not what "was it good?" looks like. One tap
 * answers the question; the rest appears because they answered.
 *
 * **It is sent now.** `POST /api/v1/public/feedback` takes a review with no
 * account behind it — a guest at a table has none, and a complaint form that
 * demands one collects fewer complaints, which reads on a dashboard as a better
 * week. The stars are the score, the tags and the comment are the text, and the
 * tenant comes from the sticker's own URL rather than from this build's
 * default: a guest scanning a table is at whatever restaurant the sticker
 * belongs to.
 *
 * The screen does not wait for the answer. It thanks the guest and returns them
 * to the table, because they are standing up to leave and a network error is
 * not something they can act on.
 */
export default function GuestRatingScreen() {
  const c = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const flash = useFlash();
  const { lang } = useLocale();
  const { t } = useGuestCopy();

  const params = useLocalSearchParams<{
    restaurant: string;
    table: string;
    paid?: string;
    rail?: string;
  }>();

  const here = tableHref({ restaurant: param(params.restaurant), table: param(params.table) });

  /*
   * A missing or malformed amount becomes `null` rather than `NaN` or zero, and
   * the receipt block disappears with it: somebody who reached this route
   * directly has not paid anything, and "0 so'm paid" is a worse answer than no
   * answer at all.
   */
  const parsed = Number.parseInt(param(params.paid), 10);
  const paid = Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  const rail = param(params.rail);

  const [stars, setStars] = useState(0);
  const [tags, setTags] = useState<readonly string[]>([]);
  const [comment, setComment] = useState('');

  /*
   * One tick, and it starts ticked — `dc.html:584` holds `loyalty: true` in the
   * panel's state and `dc.html:639` spends that same flag:
   * `discount = S.loyalty ? items * 0.05 : 0`. So this box is not a second
   * question; it IS the gold-card line on the bill, and the design answers it
   * "yes" until the guest says otherwise. It defaulted to false here, which
   * meant the bill applied the 5% and this screen showed the same offer
   * unticked — one flag, two answers, in two taps of each other.
   *
   * The other half is still open: `bill.tsx` keeps its own `gold` flag, and the
   * two are one piece of state only once the flag moves above both screens.
   */
  const [loyalty, setLoyalty] = useState(true);
  const [receipt, setReceipt] = useState(false);

  return (
    <View style={[s.fill, { backgroundColor: c.bg }]}>
      <ScrollView
        style={s.fill}
        contentContainerStyle={[s.page, { paddingTop: insets.top + 28 }]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {paid === null ? null : (
          <View>
            {/*
             * Payment received — `dc.html:499-505`. On the success ramp with a
             * check, not on the brand: the brand is what this platform uses for
             * "here is an offer", and a settled bill is the one moment on the
             * surface that has genuinely succeeded. A guest scanning for
             * reassurance reads the green tick before they read any words.
             */}
            <View style={[s.tick, { backgroundColor: c.success50, borderRadius: 16 }]}>
              <Check size={26} colour={c.success600} weight={2.6} />
            </View>

            <Text style={[displayAt(700, 26, 1.12), { color: c.fg, marginTop: size.sp4 }]}>
              {t.rating.paid}
            </Text>

            <Text
              style={[sansAt(400, 14, 1.6), text.num, { color: c.fgMuted, marginTop: size.sp2 }]}
            >
              {fill(t.rating.paidLine, {
                amount: som(paid, lang, false),
                currency: somWord(lang),
                method: rail === '' ? '—' : railLabel(rail),
              })}
            </Text>

            {/*
             * Four radii on this panel and not one of them is the scale's 10:
             * this button 13 (`dc.html:505`), the comment field 13 (`:533`),
             * the loyalty card 13 (`:535`) and its tick box 5 (`:536`).
             */}
            <Pressable
              onPress={() => {
                /*
                 * There is no fiscal driver behind this — `soliq.uz` receives a
                 * cheque from the OFD integration the platform has not written.
                 * The button says what it did instead of handing over an empty
                 * PDF, and it latches so it cannot claim two downloads.
                 */
                if (receipt) return;

                setReceipt(true);
                flash(t.rating.receiptDone);
              }}
              accessibilityRole="button"
              accessibilityState={{ disabled: receipt }}
              style={({ pressed }) => [
                s.receipt,
                { borderColor: c.border, borderRadius: 13 },
                pressed && PRESSED,
                receipt && s.done,
              ]}
            >
              <Receipt colour={c.brand600} />
              <Text style={[sansAt(500, 14), s.grow, { color: c.fg }]}>
                {receipt ? t.rating.receiptDone : t.rating.receipt}
              </Text>
              {/* The row ends in a chevron — `dc.html:508`. Without it the line
                  reads as a statement rather than as somewhere to go. */}
              <ChevronRight size={16} colour={c.fgSubtle} />
            </Pressable>
          </View>
        )}

        <View style={[s.rate, { borderColor: c.divider }, paid === null && s.rateAlone]}>
          {/* 17px in the body face — `dc.html:512`. It was 20px Inter Tight with
              tracking, which is the console's section heading, not this one. */}
          <Text style={[sansAt(600, 17, 1.25), { color: c.fg }]}>{t.rating.title}</Text>
          <Text style={[text.small, { color: c.fgSubtle, marginTop: 4 }]}>{t.rating.sub}</Text>

          {/*
           * Five 52pt tiles with the design's own star path — `dc.html:515-521`.
           * A drawn glyph in `--rating-star`, never the `★` character, which
           * inherits the button's colour and renders at whatever weight the
           * platform font happens to carry it at.
           */}
          <View style={s.stars}>
            {[1, 2, 3, 4, 5].map((value) => {
              const on = value <= stars;

              return (
                <Pressable
                  key={value}
                  onPress={() => setStars(value)}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: value === stars }}
                  accessibilityLabel={t.rating.stars[value - 1]}
                  style={({ pressed }) => [
                    s.star,
                    {
                      /* An unlit tile is `--n-50` — `dc.html:920`. It was
                         `--n-100`, one step darker, and five grey-100 tiles read
                         as five disabled buttons. */
                      backgroundColor: on ? c.warning50 : c.bgSubtle,
                      borderRadius: size.radiusLg,
                    },
                    pressed && PRESSED,
                  ]}
                >
                  <Star colour={on ? c.ratingStar : c.n300} fill={on ? c.ratingStar : 'none'} />
                </Pressable>
              );
            })}
          </View>

          {/* The word for the score, only once one is given. A default of "Fine"
              under five grey stars is a rating the guest did not give. */}
          <Text style={[sansAt(600, 14), s.starLabel, { color: c.fg }]}>
            {stars === 0 ? '' : t.rating.stars[stars - 1]}
          </Text>

          {stars === 0 ? null : (
            <View>
              <Text style={[sansAt(600, 14), { color: c.fg, marginTop: size.sp5 }]}>
                {t.rating.whatGood}
              </Text>

              {/* Chips, because a guest holding a phone at a table will tap three
                  and will not type a sentence. A rating with "Tez keldi" on it
                  tells a manager which shift did well; a bare number does not. */}
              <View style={s.tags}>
                {t.rating.tags.map((tag) => {
                  const on = tags.includes(tag);

                  return (
                    <Pressable
                      key={tag}
                      onPress={() =>
                        setTags((current) =>
                          on ? current.filter((entry) => entry !== tag) : [...current, tag],
                        )
                      }
                      accessibilityRole="button"
                      accessibilityState={{ selected: on }}
                      /* 36pt tall, exactly — `dc.html:529` — and the eight points
                         a thumb still wants are given back as hit slop, not as a
                         taller box: at 44 the row stood half again as deep as the
                         drawing and pushed the comment field off the fold. */
                      hitSlop={{ top: 4, bottom: 4 }}
                      style={({ pressed }) => [
                        s.tag,
                        {
                          backgroundColor: on ? c.n900 : c.surface,
                          borderColor: on ? c.n900 : c.border,
                          borderRadius: size.radiusPill,
                        },
                        pressed && PRESSED,
                      ]}
                    >
                      <Text style={[text.small, { color: on ? c.n0 : c.fg, ...sans(600) }]}>
                        {tag}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>

              <TextInput
                value={comment}
                onChangeText={setComment}
                maxLength={COMMENT_MAX}
                multiline
                placeholder={t.rating.commentPlaceholder}
                placeholderTextColor={c.fgSubtle}
                style={[
                  sansAt(400, 14, 1.55),
                  s.comment,
                  { color: c.fg, borderColor: c.border, borderRadius: 13 },
                ]}
              />

              <Pressable
                onPress={() => setLoyalty((on) => !on)}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: loyalty }}
                style={({ pressed }) => [
                  s.keep,
                  {
                    /* Unticked, the card sits on `--n-25` — `dc.html:1027` — a
                       shade above the page and below `--n-50`, so it reads as an
                       offer left open rather than as a field switched off. */
                    backgroundColor: loyalty ? c.brand50 : c.n25,
                    borderColor: loyalty ? c.brand200 : c.border,
                    borderRadius: 13,
                  },
                  pressed && PRESSED,
                ]}
              >
                <View
                  style={[
                    s.box,
                    {
                      borderColor: loyalty ? c.brand500 : c.n300,
                      backgroundColor: loyalty ? c.brand500 : 'transparent',
                      borderRadius: 5,
                    },
                  ]}
                >
                  {loyalty ? <Check size={11} colour={c.n0} /> : null}
                </View>

                <Text style={[sansAt(400, 13, 1.55), s.grow, { color: c.fgMuted }]}>
                  {fill(t.rating.loyalty, { percent: GOLD_CARD_PERCENT })}
                </Text>
              </Pressable>
            </View>
          )}
        </View>
      </ScrollView>

      {/*
       * Send and skip are docked — `dc.html:548-550`: the panel scrolls at
       * `flex:1` and the pair below it is `flex:none;padding:14px 20px 20px`
       * with a rule on top. They used to ride in the scroll flow, so a guest who
       * typed three lines pushed the send button off the bottom of the screen
       * that was asking them to press it.
       */}
      <View
        style={[
          s.dock,
          { backgroundColor: c.bg, borderColor: c.border, paddingBottom: insets.bottom + 20 },
        ]}
      >
        <Pressable
          onPress={() => {
            /*
             * The tags and the comment together, because the console draws one
             * comment column. The tags are already words a person wrote — "Sekin
             * xizmat", "Mazali" — so they read as a sentence rather than as a
             * taxonomy nobody entered.
             */
            const said = [tags.join(', '), comment.trim()]
              .filter((part) => part !== '')
              .join(' — ');

            void sendFeedback(
              lang,
              {
                score: stars,
                comment: said === '' ? undefined : said,
                /* The sticker names the table by a token rather than by its id on
                   every route but this one; a numeric segment is the id and
                   anything else is left off rather than guessed at. */
                table_id: /^\d+$/.test(param(params.table))
                  ? Number(param(params.table))
                  : undefined,
              },
              param(params.restaurant),
            );

            flash(fill(t.rating.thanks, { stars }));
            router.replace(here);
          }}
          disabled={stars === 0}
          accessibilityRole="button"
          accessibilityState={{ disabled: stars === 0 }}
          style={({ pressed }) => [
            s.send,
            {
              backgroundColor: stars === 0 ? c.bgMuted : c.brand500,
              borderRadius: size.radiusLg,
            },
            pressed && PRESSED,
          ]}
        >
          {/* Shut until a star is given, and the reason is the row directly above
              it: the question has not been answered yet. */}
          <Text style={[sansAt(600, 16), { color: stars === 0 ? c.fgDisabled : c.n0 }]}>
            {t.rating.send}
          </Text>
        </Pressable>

        <Pressable
          onPress={() => {
            flash(t.rating.skipped);
            router.replace(here);
          }}
          accessibilityRole="button"
          style={({ pressed }) => [s.skip, pressed && PRESSED]}
        >
          {/* "Later" is always there and costs nothing — a forced rating is a
              false rating and tells a manager nothing. */}
          <Text style={[sansAt(500, 14), { color: c.fgSubtle }]}>{t.rating.skip}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  fill: { flex: 1 },
  /* `padding:28px 22px` — `dc.html:498`. */
  page: { paddingHorizontal: 22, paddingBottom: 28 },
  grow: { flex: 1, minWidth: 0 },
  tick: { width: 52, height: 52, alignItems: 'center', justifyContent: 'center' },
  receipt: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    marginTop: size.sp5,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderWidth: 1,
  },
  done: { opacity: 0.6 },
  rate: { marginTop: 28, paddingTop: size.sp6, borderTopWidth: 1 },
  rateAlone: { marginTop: 0, paddingTop: 0, borderTopWidth: 0 },
  stars: { flexDirection: 'row', gap: 10, marginTop: size.sp4 },
  star: { width: 52, height: 52, alignItems: 'center', justifyContent: 'center' },
  starLabel: { minHeight: 20, marginTop: size.sp3 },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: size.sp2, marginTop: 11 },
  tag: {
    height: 36,
    justifyContent: 'center',
    paddingHorizontal: 14,
    borderWidth: 1,
  },
  comment: {
    /* Three rows at the design's own 14/1.55 plus its 14px of padding —
       `dc.html:533`, `rows="3"`. */
    minHeight: 94,
    marginTop: 18,
    padding: 14,
    borderWidth: 1,
    textAlignVertical: 'top',
  },
  keep: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    marginTop: size.sp4,
    paddingHorizontal: 15,
    paddingVertical: 13,
    borderWidth: 1,
  },
  box: {
    width: 18,
    height: 18,
    borderWidth: 1.6,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  dock: { gap: 9, paddingHorizontal: size.sp5, paddingTop: 14, borderTopWidth: 1 },
  send: { height: 52, alignItems: 'center', justifyContent: 'center' },
  skip: { height: 42, alignItems: 'center', justifyContent: 'center' },
});
