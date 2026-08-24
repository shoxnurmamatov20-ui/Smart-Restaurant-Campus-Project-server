import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { fill, t } from '@restaurant/surfaces/mp/copy';
import { MP_LADDER } from '@restaurant/surfaces/mp/data';

import { useBasket } from '@/mp/basket';
import { cancelOrder, needsSignIn, sampleNote, useOrderTrack } from '@/mp/live';
import { Glyph } from '@/mp/icons';
import { SignInSheet } from '@/mp/sign-in-sheet';
import { Empty, PRESSED } from '@/ui/primitives';
import { Star } from '@/ui/icons';
import { Notice, useNotice } from '@/ui/notice';
import { useLocale } from '@/lib/locale';
import { groupDigits, som } from '@/lib/money';
import { useMpTheme } from '@/lib/theme-context';
import { size } from '@/theme';
import { display, sansAt, text, tracking } from '@/type';

/**
 * MyPOS, screen 4 — where the order is.
 *
 * `Ilova.dc.html:308-356`. Five steps, a map, the courier and what was ordered.
 *
 * **Which order.** `?order=` when the history sent the guest here, and otherwise
 * whatever this device last placed; failing both, the newest order still on the
 * ladder — which is what somebody opening "track" out of nowhere is asking
 * about. The query is a parameter rather than a segment on purpose: the path has
 * to stay `/mp/track` for `srcp://mp/track` from a delivery push to land here.
 *
 * **The marketplace's own palette, not the restaurant's** — `useMpTheme()`.
 * MyPOS is a second product in the same binary and its `--sunken` is `#F1F3F7`
 * where the console's is `#F8F9FB`; worse, the console's `surfaceSunken` stays
 * near-white in dark, so the map frame was a white slab on a dark screen. The
 * ladder's tones are the design's `--ok` and `--brand` for the same reason.
 *
 * **The stamps are on the rail, not just the ticks.** A guest looking at
 * "cooking" wants to know whether it started two minutes ago or twenty, and a
 * coloured bar answers neither. The step that has not happened yet carries an em
 * dash rather than a guess, and the times are drawn in the reader's own timezone
 * because the courier is coming to where they are standing. The drawing's rung
 * is two elements — the 4px bar and the label (`:316-318`) — so this third line
 * is a deliberate addition, kept small and subtle rather than removed.
 *
 * **The map is a frame with a caption.** `courier.position` publishes a
 * coordinate, but drawing it needs a map SDK — a new dependency this build does
 * not take — and a decorative picture of a city that is not this city would be
 * worse than an honest placeholder: a guest would try to read a courier's
 * position off it. So it is the design's own empty `image-slot`: a flat panel on
 * `--sunken` at the drawn 196px, with `--is-fg` on the caption (`:63`, `:323`).
 *
 * **The call button raises a flash rather than dialling**, and it has to. The
 * design's promise is that neither party learns the other's number, so
 * `courier` carries a name and a rating and no number at all — masked or
 * otherwise. A button that dialled a rider's own mobile would publish it to
 * every guest they ever delivered to, permanently, and no amount of good
 * intentions takes that back.
 *
 * TODO(integration): needs PBX_MASKED_NUMBER_KEY — see docs/GO-LIVE.md
 */
export default function MarketplaceTrack() {
  const c = useMpTheme();
  const { lang } = useLocale();
  const { note, say: flash } = useNotice();
  const { order: asked } = useLocalSearchParams<{ order?: string }>();
  const { lastOrderNumber } = useBasket();

  const track = useOrderTrack(lang, asked ?? lastOrderNumber);
  const order = track.data;

  const [signIn, setSignIn] = useState(false);
  const [busy, setBusy] = useState(false);

  const cancel = async () => {
    if (busy || order.number === null) return;

    setBusy(true);
    const done = await cancelOrder(order.number, lang);
    setBusy(false);

    if (!done.ok) {
      flash(done.message ?? t('placeFailed', lang), 'problem');

      return;
    }

    flash(t('state_cancelled', lang));
    track.reload();
  };

  const here = MP_LADDER[Math.min(order.reached, MP_LADDER.length - 1)];

  return (
    <View style={s.fill}>
      {/*
       * One scroller with the contents card inside it, rather than a `FlatList`
       * whose header, rows and footer are three siblings. `:341` wraps the
       * title, the lines and the paid footer in a single bordered surface, and
       * a virtualised list cannot draw one border around three slots. Nothing
       * is lost: the rows here are one order's lines, not a feed.
       */}
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={s.list}>
        {track.live ? null : (
          <Pressable
            onPress={() => (needsSignIn(track.problem) ? setSignIn(true) : track.reload())}
            accessibilityRole="button"
            style={s.demo}
          >
            <Text style={[text.caption, { color: c.warnFg }]}>
              {sampleNote(track.problem, lang)}
            </Text>
          </Pressable>
        )}

        <Text style={[s.eyebrow, { color: c.fgSubtle }]}>
          {`${t('orderNo', lang)} ${order.number ?? '—'}`}
        </Text>

        {/* An arrival time when one has been promised, and the step it is on
            when one has not — a heading reading "arriving at —" is worse
            than a heading that says what is actually happening. */}
        <Text style={[s.eta, { color: c.fg }]}>
          {order.eta === null
            ? t(`step_${here ?? 'placed'}` as 'step_placed', lang)
            : fill(t('etaH', lang), { time: order.eta })}
        </Text>

        {/* `:312` draws `t.etaP` — "Kuryer 2.4 km masofada · taxminan 9 daqiqa".
            The distance half has no source on this screen: `Track.courier` is a
            name, a rating and a count, and the km would have to be computed in
            `src/mp/live.ts` from `courier.position` and the delivery address.
            Until it is, the store's name stands where the distance goes rather
            than a number nobody measured. */}
        <Text style={[text.small, { color: c.fgMuted, marginTop: 4 }]}>
          {order.cancelled
            ? t('state_cancelled', lang)
            : `${order.store}${
                order.minutesLeft === null
                  ? ''
                  : ` · ${fill(t('minutes', lang), { n: order.minutesLeft })}`
              }`}
        </Text>

        {/* ------------------------------------------------- ladder */}
        <View style={s.ladder}>
          {MP_LADDER.map((step, index) => {
            const done = index < order.reached;
            const at = index === order.reached;

            return (
              <View key={step} style={s.rung}>
                <View
                  style={[
                    s.bar,
                    {
                      backgroundColor: order.cancelled
                        ? c.border
                        : done
                          ? c.ok
                          : at
                            ? c.brand
                            : c.border,
                    },
                  ]}
                />
                <Text
                  style={[s.rungLabel, { color: at || done ? c.fg : c.fgDisabled }]}
                  numberOfLines={2}
                >
                  {t(`step_${step}` as 'step_placed', lang)}
                </Text>
                <Text style={[s.stamp, text.num, { color: c.fgSubtle }]}>
                  {order.stamps[index] ?? '—'}
                </Text>
              </View>
            );
          })}
        </View>

        {/* ---------------------------------------------------- map */}
        <View style={[s.map, { backgroundColor: c.sunken, borderColor: c.border }]}>
          <Glyph name="pin" colour={c.fgSubtle} size={24} />
          <Text style={[text.small, { color: c.fgSubtle, marginTop: 8 }]}>
            {t('mapSlot', lang)}
          </Text>
        </View>

        {/* ------------------------------------------------ courier */}
        {order.courier === null ? null : (
          <View style={[s.courier, { backgroundColor: c.surface, borderColor: c.border }]}>
            <View style={[s.avatar, { backgroundColor: c.sunken }]}>
              <Text style={[s.initials, { color: c.fgMuted }]}>
                {initialsOf(order.courier.name)}
              </Text>
            </View>

            <View style={s.courierMain}>
              {/* `:330` is one line — "Oybek S. · kuryer". The role word was on
                  the meta row below, which pushed the star and the rating along
                  and made a name line out of a name alone. */}
              <Text style={[s.courierName, { color: c.fg }]}>
                {`${order.courier.name} · ${t('courier', lang).toLowerCase()}`}
              </Text>
              <View style={s.courierMeta}>
                <Star size={11} colour={c.star} />
                <Text style={[s.meta, text.num, { color: c.fgMuted }]}>
                  {order.courier.rating.toFixed(1)}
                </Text>
                <Text style={[s.meta, { color: c.borderStrong }]}>·</Text>
                <Text style={[s.meta, text.num, { color: c.fgMuted }]}>
                  {fill(t('deliveries', lang), {
                    n: groupDigits(order.courier.deliveries),
                  })}
                </Text>
              </View>
            </View>

            {/* 42×42 at `:336`, not the 44 a touch target wants; `hitSlop` buys
                the two points back without moving the drawn square. */}
            <Pressable
              onPress={() => flash(t('callFlash', lang))}
              accessibilityRole="button"
              accessibilityLabel={t('call', lang)}
              hitSlop={2}
              style={({ pressed }) => [s.call, { borderColor: c.borderStrong }, pressed && PRESSED]}
            >
              <Glyph name="phone" colour={c.fg} size={18} />
            </Pressable>
          </View>
        )}

        {/* ------------------------------------------------- cancel */}
        {order.canCancel ? (
          /* Not in the drawing — `:309-355` has no cancel control at all. It is
             here because the server offers `can_cancel`, and a guest who can
             still stop an order should not have to find a support chat to do
             it. Offered on that flag alone: a countdown of this screen's own
             would disagree with it on a slow connection, and the guest would
             press a button the kitchen has already refused. Its radius is the
             call button's 12, borrowed because the design draws no such
             control to copy. */
          <Pressable
            onPress={() => void cancel()}
            accessibilityRole="button"
            style={({ pressed }) => [s.cancel, { borderColor: c.bad }, pressed && PRESSED]}
          >
            <Text style={[s.cancelLabel, { color: c.badFg }]}>{t('helpCancel', lang)}</Text>
          </Pressable>
        ) : null}

        {order.lines.length === 0 && order.number === null ? (
          <Empty title={t('noOrder', lang)} />
        ) : null}

        {/* ------------------------------------------------ contents */}
        <View style={[s.contents, { backgroundColor: c.surface, borderColor: c.border }]}>
          {order.lines.length === 0 ? null : (
            <Text style={[s.contentsH, { color: c.fg }]}>{t('contents', lang)}</Text>
          )}

          {order.lines.map((line) => (
            <View key={line.id} style={[s.line, { borderBottomColor: c.divider }]}>
              <Text style={[s.lineQty, text.num, { color: c.brandDark }]}>{line.quantity}</Text>
              <Text style={[s.lineName, { color: c.fg }]} numberOfLines={1}>
                {line.name}
              </Text>
              <Text style={[s.lineSum, text.num, { color: c.fg }]}>
                {som(line.lineTotal, lang, false)}
              </Text>
            </View>
          ))}

          <View style={[s.paid, { borderTopColor: c.border }]}>
            {/* `:351` reads "Click bilan to'landi" — one sentence naming the
                rail. `paidWith` in `packages/surfaces/src/mp/copy.ts` is a bare
                label ("To'landi") and the web track page renders it as one, so
                turning it into a template is that package's change, not this
                screen's. Recorded rather than forked into a second catalogue. */}
            <Text style={[text.small, { color: c.fgMuted }]}>
              {`${t('paidWith', lang)} · ${order.paidWith}`}
            </Text>
            <Text style={[s.paidTotal, text.num, { color: c.fg }]}>
              {som(order.total, lang, false)}
            </Text>
          </View>
        </View>
      </ScrollView>

      <SignInSheet
        open={signIn}
        onClose={() => setSignIn(false)}
        onDone={() => {
          setSignIn(false);
          track.reload();
        }}
        announce={flash}
      />

      <Notice note={note} bottom={size.sp4} />
    </View>
  );
}

/** `Oybek S.` → `OS`. Two letters, because a round 44pt avatar holds two. */
function initialsOf(name: string): string {
  return name
    .split(/\s+/)
    .map((word) => word.charAt(0))
    .filter((letter) => /\p{L}/u.test(letter))
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

const s = StyleSheet.create({
  fill: { flex: 1 },

  /* `:309` — `padding:6px 18px 20px`. It was the 4pt scale (20/8/24), so every
     card in the column sat two points wide of the drawing and the first line
     started two points low. */
  list: { paddingHorizontal: 18, paddingTop: 6, paddingBottom: 20 },

  demo: { paddingBottom: size.sp3, minHeight: 44 },

  /* `:310` — 11px/600 at `.08em`. `text.caps` is the design's *other* micro
     label, 10px, and it drew the order number a full step small. */
  eyebrow: {
    ...sansAt(600, 11, 1.45),
    letterSpacing: tracking('.08em', 11),
    textTransform: 'uppercase',
  },

  /* `:311` — 27px/700 Inter Tight at `-.024em`. `text.display` is 30px at
     `-.022em`, a heading three points too large for this screen. */
  eta: {
    ...display(700),
    fontSize: 27,
    lineHeight: 39,
    letterSpacing: tracking('-.024em', 27),
    marginTop: 5,
  },

  /* `:315` — `gap:5px;margin-top:18px`. */
  ladder: { flexDirection: 'row', gap: 5, marginTop: 18 },
  rung: { flex: 1, minWidth: 0 },
  bar: { height: 4, borderRadius: 999 },

  /* `:318` — 10px/600 at `line-height:1.25`, `margin-top:7px`. It was
     `text.caption`, 12px at 500, and five labels at 12px across a phone
     wrapped where the drawing does not. */
  rungLabel: { ...sansAt(600, 10, 1.25), marginTop: 7 },
  /* The rail's own addition (see the docblock): the same 10px, one weight
     lighter, so it reads under the label rather than beside it. */
  stamp: { ...sansAt(500, 10, 1.25), marginTop: 2 },

  /* `:323` — `height:196px;border-radius:16px;margin-top:18px`, and a 1px
     rule: the design never draws a sub-pixel one, and `hairlineWidth` is a
     third of a point at @3x. */
  map: {
    height: 196,
    marginTop: 18,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },

  /* `:327` — `border-radius:16px;padding:15px 16px;margin-top:14px`. */
  courier: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 13,
    marginTop: 14,
    paddingVertical: 15,
    paddingHorizontal: 16,
    borderRadius: 16,
    borderWidth: 1,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  /* `:328` — Inter Tight 14/700. It was Inter 13 with a bold asked for on top. */
  initials: { ...display(700), fontSize: 14 },
  courierMain: { flex: 1, minWidth: 0 },
  courierName: sansAt(600, 14, 1.45),
  /* `:331` — `gap:6px;font-size:11px;margin-top:2px`. */
  courierMeta: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 },
  meta: sansAt(400, 11, 1.45),
  /* `:336` — `width:42px;height:42px;border-radius:12px`. */
  call: {
    width: 42,
    height: 42,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancel: {
    minHeight: 44,
    marginTop: 14,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelLabel: sansAt(600, 13, 1.45),

  /* `:341` — `border-radius:16px;padding:16px 18px;margin-top:14px`. The title,
     the lines and the paid footer are one card in the drawing; they were three
     bare blocks at the page gutter. */
  contents: {
    marginTop: 14,
    paddingVertical: 16,
    paddingHorizontal: 18,
    borderRadius: 16,
    borderWidth: 1,
  },
  /* `:342` — Inter Tight 15/700 at `-.014em`, not Inter 15 with a raw
     `fontWeight` on it. */
  contentsH: {
    ...display(700),
    fontSize: 15,
    lineHeight: 22,
    letterSpacing: tracking('-.014em', 15),
  },
  /* `:344-347` — `padding:10px 0;gap:10px`, a 1px divider, and a quantity
     column 18 wide in `--brand-dark`. */
  line: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 10,
    paddingVertical: 10,
    borderBottomWidth: 1,
  },
  lineQty: { ...sansAt(700, 13, 1.45), width: 18 },
  lineName: { ...sansAt(500, 13, 1.45), flex: 1, minWidth: 0 },
  lineSum: sansAt(600, 13, 1.45),
  /* `:350` — `margin-top:12px;padding-top:10px`. */
  paid: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: 12,
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: 1,
  },
  /* `:352` — 17px/700 in Inter Tight and no tracking of its own. `text.title`
     is 20px at `-.012em`, which made the total shout over the card's heading. */
  paidTotal: { ...display(700), fontSize: 17, lineHeight: 25, letterSpacing: 0 },
});
