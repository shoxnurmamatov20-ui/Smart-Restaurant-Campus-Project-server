import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { fill } from '@restaurant/surfaces/guest/copy';
import { translate } from '@restaurant/surfaces/guest/menu-data';
import {
  lineTotal,
  orderCount,
  TABLE_LADDER,
  TABLE_ORDER,
  type TableLine,
  type TableStep,
} from '@restaurant/surfaces/guest/table-data';

import { clearBasket, setQuantity, useBasket } from '@/guest/basket';
import { CallWaiter } from '@/guest/call-waiter';
import { useFlash } from '@/guest/flash';
import { refusalMessage, sendTableOrder, useTableOrder } from '@/guest/table';
import { useGuestCopy } from '@/guest/copy';
import { Check, ChevronLeft } from '@/guest/icons';
import { param, tableHref, useGuestBack } from '@/guest/route';
import { useLocale } from '@/lib/locale';
import { som } from '@/lib/money';
import { useTheme } from '@/lib/theme-context';
import { size } from '@/theme';
import { sans, sansAt, displayAt, text, tracking } from '@/type';
import { Button, PRESSED } from '@/ui/primitives';

/**
 * Where the table's food is — `Mehmon.dc.html`, panel 04 (`:324-387`).
 *
 * Three bands, and the design is explicit about which of them move: a title bar
 * at `flex:none` (`:330`), a scroller between them (`:335`), and a `flex:none`
 * footer holding the two buttons (`:381`). This screen used to put all three
 * inside one `FlatList`, so the title scrolled off the top and a guest had to
 * scroll past their whole order to reach "call the waiter" — the one control on
 * the screen somebody presses when something is wrong.
 *
 * Two lists, deliberately apart. Above: what the kitchen already has, with the
 * rung each line is on. Below: what this table has chosen and **not yet told
 * anybody**. A guest must be able to tell "the tea is being made" from "I have
 * picked a tea and nobody knows", and one list holding both says neither. The
 * design draws only the first, because its mock has no send step; the second is
 * drawn as a secondary block of the same section — same 11px caps heading
 * (`:365`), same 11px row gap (`:366`), same rule above it (`:364`).
 *
 * `GET /api/v1/public/tables/{token}/order` fills the upper list; a pull on the
 * ladder refreshes it, and a Reverb frame on `branch.{id}.orders` is the
 * improvement that would remove the pull. The lower list is local and always
 * has been — it is a basket, and a basket nobody has been told about lives on
 * the phone that holds it.
 *
 * Three answers, drawn three ways. A table with an open bill draws it. A live
 * table with nothing open draws the ladder empty — a guest who has just sat
 * down must not be shown four courses somebody else ate. An API that did not
 * answer falls back to `TABLE_ORDER` and says `Namoyish rejimi`, which is the
 * same fallback the menu screen uses one step back.
 */
export default function GuestStatusScreen() {
  const c = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { lang } = useLocale();
  const { t } = useGuestCopy();

  const params = useLocalSearchParams<{ restaurant: string; table: string }>();
  const restaurant = param(params.restaurant);
  const table = param(params.table);
  const here = tableHref({ restaurant, table });
  const back = useGuestBack(here);

  const basket = useBasket(`${restaurant}:${table}`);
  const flash = useFlash();
  const { state, refresh } = useTableOrder(restaurant, table, lang);
  const [sending, setSending] = useState(false);

  /*
   * The fixture stands in for an API that did not answer, and only for that.
   * `empty` is a real table with nothing open and keeps its own shape — see the
   * file note.
   */
  const order = state.status === 'ready' ? state.order : TABLE_ORDER;
  const live = state.status === 'ready' || state.status === 'empty';

  const send = () => {
    if (sending || basket.lines.length === 0) return;

    setSending(true);

    sendTableOrder(
      restaurant,
      table,
      basket.lines.map((line) => ({
        // The dish id from `GET /public/menu`, carried in the basket since the
        // menu screen was wired.
        menu_item_id: Number(line.dishId),
        quantity: line.quantity,
        /* The catalogue's own choice ids, where the kitchen asked a question.
           Empty for a dish it asks nothing about — see `kitchenNote` for what
           happens to the fallback add-ons instead. */
        modifier_choice_ids: line.choiceIds.map(Number),
        note: kitchenNote(line),
      })),
      { lang },
    )
      .then(() => {
        /*
         * Emptied only on success. A send that failed and cleared would leave a
         * guest with no list, no food and nothing to retry — the worst outcome
         * available on this screen.
         */
        clearBasket(`${restaurant}:${table}`);
        flash(t.status.sent);
        // The lines just moved from "chosen" to "the kitchen has them".
        refresh();
      })
      .catch((error: unknown) => {
        // The API's own sentence where there is one: "Manti hozir mavjud emas"
        // names the dish and says what to do; a generic failure does not.
        flash(refusalMessage(error, lang) ?? t.status.empty);
      })
      .finally(() => setSending(false));
  };

  /*
   * How far the ladder has got, read from the clocks rather than from the
   * lines.
   *
   * A rung with a time on it has happened; the last one with a time is where
   * the table is now. Deriving it from the slowest line instead — which is what
   * `orderStep()` answers — puts the table back on "accepted" while the kitchen
   * is visibly cooking, because one green tea has not been started. That is a
   * real question and it is answered per line, underneath, where it belongs.
   */
  const reached = TABLE_LADDER.reduce(
    (last, step, index) => (order.reachedAt[step] === null ? last : index),
    0,
  );

  return (
    <View style={[s.fill, { backgroundColor: c.bg, paddingTop: insets.top }]}>
      {/*
       * `:330-333` — `flex:none;padding:18px 20px 14px;border-bottom:1px solid
       * var(--border)`, pinned above the scroller.
       *
       * The chevron is folded into that bar rather than sitting in a row above
       * it. The design has no back control at all — it is a browser mock, and
       * the browser has one — but a phone must carry its own, and a separate
       * row would push the title 44pt down the screen the design starts it at.
       */}
      <View style={[s.bar, { borderColor: c.border }]}>
        <Pressable
          onPress={back}
          accessibilityRole="button"
          accessibilityLabel={t.dish.back}
          hitSlop={14}
          style={({ pressed }) => [s.back, pressed && PRESSED]}
        >
          <ChevronLeft colour={c.fgMuted} />
        </Pressable>

        <View style={s.grow}>
          <Text style={[s.barTitle, { color: c.fg }]}>{t.status.title}</Text>
          <Text style={[s.barSub, text.num, { color: c.fgSubtle }]}>
            {fill(t.status.order, { number: order.number })} ·{' '}
            {fill(t.status.lines, { count: orderCount(order) })}
          </Text>
        </View>
      </View>

      <FlatList
        data={order.lines}
        keyExtractor={(line) => line.id}
        showsVerticalScrollIndicator={false}
        /* `:335` — `flex:1;min-height:0;padding:20px`. The band between the two
           pinned ones, and the only one that moves; the footer below it carries
           the home indicator itself. */
        style={s.fill}
        contentContainerStyle={s.page}
        /* `:366` — `display:grid;gap:11px`, and no dividers. Every line used to
           carry a hairline under it, which drew a four-row table where the
           design draws a list. */
        ItemSeparatorComponent={RowGap}
        ListHeaderComponent={
          <View>
            {/*
             * The card the whole screen is built around — `:336-342`.
             * On the warning ramp, which here is not an alarm but "in hand":
             * it is the one card on this surface that changes colour when the
             * kitchen finishes.
             */}
            <View style={[s.eta, { backgroundColor: c.warning50, borderColor: c.border }]}>
              <View style={s.etaHead}>
                <View style={[s.dot, { backgroundColor: c.warning500 }]} />
                {/* `:339` — 13px at `.05em`. This read `text.caps`, which is
                    the design's 10px micro-label: a third smaller than the
                    line the card is titled with. */}
                <Text style={[s.etaLabel, { color: c.warning600 }]}>{t.status.cooking}</Text>
              </View>

              <Text style={[text.display, text.num, { color: c.fg, marginTop: 8 }]}>
                {t.status.about} {order.etaMinutes} {t.status.minutes}
              </Text>

              <Text style={[s.etaReady, text.num, { color: c.fgMuted }]}>
                {fill(t.status.readyBy, { time: order.readyBy })}
              </Text>
            </View>

            {/*
             * Every rung carries its clock — `:345-361`. Five words tell a
             * guest the kitchen accepted the order; only the clock says it did
             * so twenty minutes ago, which is the question they opened the
             * screen with. Rungs still to come say "pending" rather than a
             * guessed time.
             */}
            <View style={s.ladder}>
              {TABLE_LADDER.map((step, index) => (
                <Rung
                  key={step}
                  label={t.status.steps[step]}
                  at={order.reachedAt[step] ?? t.status.pending}
                  state={index < reached ? 'done' : index === reached ? 'now' : 'ahead'}
                  last={index === TABLE_LADDER.length - 1}
                />
              ))}
            </View>

            {/* `:364-366` — `margin-top:6px;padding-top:18px;border-top:1px
                solid var(--divider)`, and 12 down to the first line. */}
            <View style={[s.section, { borderColor: c.divider }]}>
              <Text style={[s.sectionHead, { color: c.fgSubtle }]}>{t.status.yourOrder}</Text>
            </View>
          </View>
        }
        renderItem={({ item }) => <KitchenLine line={item} />}
        ListFooterComponent={
          <View>
            {/* The basket: what the table has chosen and nobody has been told.
                Its own heading, because two lists called "Buyurtmangiz" on one
                screen name the very distinction the screen exists to draw. */}
            <View style={[s.section, { borderColor: c.divider }]}>
              <Text style={[s.sectionHead, { color: c.fgSubtle }]}>{t.status.basket}</Text>
            </View>

            {basket.lines.length === 0 ? (
              /* `:375` — the design's own empty line for this section:
                 `padding:14px 0;font-size:14px;line-height:1.55`. */
              <Text style={[s.sectionEmpty, { color: c.fgSubtle }]}>{t.status.empty}</Text>
            ) : (
              <View style={s.basket}>
                {/*
                 * Mapped rather than a second `FlatList`: React Native refuses
                 * a virtualised list inside another one, and this is a handful
                 * of rows a guest added by hand rather than a catalogue.
                 */}
                {basket.lines.map((line) => (
                  <View key={line.key} style={s.basketRow}>
                    <View style={s.grow}>
                      <Text style={[s.lineName, { color: c.fg }]}>{line.name}</Text>

                      {/*
                       * `:370` and `:867` — what was chosen, under the name, at
                       * 12px/400: the modifier names and then the guest's note
                       * in curly quotes, joined with ` · `. The quotes are the
                       * design's own and they earn their keep: "achchiq emas"
                       * beside "qazi" is a second add-on until it is quoted.
                       */}
                      {line.options.length === 0 && line.note === '' ? null : (
                        <Text style={[s.lineNote, { color: c.fgSubtle }]}>
                          {[...line.options, line.note === '' ? '' : `“${line.note}”`]
                            .filter((part) => part !== '')
                            .join(' · ')}
                        </Text>
                      )}
                    </View>

                    {/*
                     * `:313-317` — one bordered group at `border-radius:12px;
                     * padding:3px`, holding two 36pt squares at `border-radius:
                     * 9px` with a 26-wide figure between them. This was two
                     * separately outlined 36pt boxes at radius 6, which is a
                     * control the design does not draw anywhere.
                     */}
                    <View style={[s.stepper, { borderColor: c.border }]}>
                      <Pressable
                        onPress={() =>
                          setQuantity(`${restaurant}:${table}`, line.key, line.quantity - 1)
                        }
                        accessibilityRole="button"
                        accessibilityLabel={t.dish.decrease}
                        style={({ pressed }) => [s.step, pressed && PRESSED]}
                      >
                        {/*
                         * `--fg-muted`, not the design's `{{decFg}}` ramp. That
                         * ramp greys the minus at one because the design's
                         * stepper floors there; this one removes the line, and
                         * a control that greys out the move it is about to make
                         * tells the guest it is dead.
                         */}
                        <Text style={[text.stepper, { color: c.fgMuted }]}>−</Text>
                      </Pressable>

                      <Text style={[s.stepValue, text.num, { color: c.fg }]}>{line.quantity}</Text>

                      <Pressable
                        onPress={() =>
                          setQuantity(`${restaurant}:${table}`, line.key, line.quantity + 1)
                        }
                        accessibilityRole="button"
                        accessibilityLabel={t.dish.increase}
                        style={({ pressed }) => [
                          s.step,
                          { backgroundColor: c.n100 },
                          pressed && PRESSED,
                        ]}
                      >
                        <Text style={[text.stepper, { color: c.fg }]}>+</Text>
                      </Pressable>
                    </View>

                    <Text style={[s.linePrice, text.num, s.money, { color: c.fg }]}>
                      {som(line.unitPrice * line.quantity, lang, false)}
                    </Text>
                  </View>
                ))}

                {/*
                 * The one control that turns a list into an order.
                 *
                 * Disabled while in flight, and not for tidiness: the client
                 * mints a fresh idempotency key per request, so two taps are
                 * two orders — and the server cannot tell them apart, because
                 * a table ordering the same two teas twice genuinely happens.
                 *
                 * `:237` for the shape — the guest surface's own docked CTA is
                 * `height:52px;border:0;border-radius:14px`.
                 */}
                <Button onPress={send} disabled={sending} style={s.send}>
                  {sending ? t.status.sending : t.status.send}
                </Button>
              </View>
            )}

            {/*
             * The demo line, and only when it is true.
             *
             * A live table has real lines, a real ladder and a send button that
             * actually reaches a kitchen — telling that guest they are looking
             * at a demonstration is the one sentence on this screen that would
             * be a lie. It stays for the fallback, which is exactly the case it
             * was written for.
             */}
            {live ? null : (
              <Text style={[text.caption, s.demo, { color: c.fgSubtle }]}>
                {t.common.demoPayment}
              </Text>
            )}
          </View>
        }
      />

      {/*
       * `:381-383` — `flex:none;padding:14px 20px 20px;border-top:1px solid
       * var(--border);display:grid;gap:9px`, holding two 46pt buttons at
       * `border-radius:13px`. These sat at the bottom of the scroller, so the
       * guest who wanted a waiter had to scroll their whole dinner to find one.
       */}
      <View style={[s.dock, { borderColor: c.border, paddingBottom: 20 + insets.bottom }]}>
        <CallWaiter variant="button" tenant={restaurant} table={table} />

        <Button
          kind="secondary"
          height={46}
          style={[s.dockButton, { borderColor: c.border }]}
          onPress={() => router.push(`${here}/menu`)}
        >
          {t.status.addMore}
        </Button>

        {/*
         * Demoted, not deleted. The design's footer holds exactly two buttons
         * and the bill is reached from panel 01 (`:113-140`), so a third one
         * filled in the brand outranked both of them. A phone that arrived here
         * by push has no panel 01 behind it, so the route stays — as the quiet
         * third line it is.
         */}
        <Button kind="ghost" height={44} onPress={() => router.push(`${here}/bill`)}>
          {t.scan.payBill}
        </Button>
      </View>
    </View>
  );
}

/** `:366` — the 11px between order lines, as a `FlatList` separator. */
function RowGap() {
  return <View style={s.rowGap} />;
}

/**
 * What the kitchen is told, in words.
 *
 * The guest's own note, and — only for a dish the kitchen asks nothing about —
 * the fallback add-ons they ticked. Those have no catalogue row and therefore
 * no id and no price the server can charge, so words on the docket is the only
 * place they can honestly land: a "qazi qo'shing" the pass never hears is worse
 * than one the bill does not carry. A dish with real `modifier_groups` sends
 * ids instead, and repeating them here would print every modifier twice.
 *
 * Trimmed to the request's own ceiling. `items.*.note` is `max:200`, and a
 * refusal there fails the WHOLE basket — one long note would cost a table its
 * dinner.
 */
function kitchenNote(line: {
  options: readonly string[];
  choiceIds: readonly string[];
  note: string;
}): string | null {
  const said = [line.choiceIds.length === 0 ? line.options.join(', ') : '', line.note]
    .filter((part) => part.trim() !== '')
    .join(' · ')
    .slice(0, 200);

  return said === '' ? null : said;
}

/**
 * One rung of the ladder — `:347-360`.
 *
 * Three states rather than two: done, where the table is now, and still to come.
 * The middle one is the answer the guest is looking for and a two-state ladder
 * hides it — everything reached looks alike, so "accepted twenty minutes ago"
 * and "being cooked right now" read the same.
 */
function Rung({
  label,
  at,
  state,
  last,
}: {
  label: string;
  at: string;
  state: 'done' | 'now' | 'ahead';
  last: boolean;
}) {
  const c = useTheme();

  const ring = state === 'done' ? c.success500 : state === 'now' ? c.warning500 : c.n200;

  return (
    <View style={s.rung}>
      <View style={s.rungRail}>
        <View
          style={[
            s.rungDot,
            {
              borderColor: ring,
              backgroundColor: state === 'done' ? c.success500 : 'transparent',
              borderRadius: size.radiusPill,
            },
          ]}
        >
          {state === 'done' ? <Check size={11} colour={c.n0} weight={3.6} /> : null}
        </View>

        {last ? null : (
          <View
            style={[s.rungLine, { backgroundColor: state === 'ahead' ? c.n150 : c.success500 }]}
          />
        )}
      </View>

      <View style={s.rungBody}>
        <Text
          style={[
            text.body,
            {
              color: state === 'ahead' ? c.fgSubtle : c.fg,
              ...sans(state === 'now' ? 700 : 500),
            },
          ]}
        >
          {label}
        </Text>
        <Text style={[text.small, text.num, { color: c.fgSubtle, marginTop: 1 }]}>{at}</Text>
      </View>
    </View>
  );
}

/**
 * A line the kitchen already has — `:368-371`.
 *
 * A line that has been served says nothing under its name — it is on the table
 * and the guest can see it. One still waiting says which rung it is on, which
 * is the whole reason the lines carry their own step.
 *
 * The design's sub-line here is `{{l.m}}` (`:370`, built at `:867`) — the
 * modifiers chosen and the guest's note. This list cannot draw them: it comes
 * from `GET /public/tables/{token}/order`, and `TableLine` in
 * `packages/surfaces/guest/table-data.ts` carries id, name, quantity, price and
 * step and nothing else, even though the wire payload has `note` on the line.
 * Until that type carries them, the rung stands in the slot at the design's own
 * sub-line type — 12px/400 in `--fg-subtle` — rather than the slot standing
 * empty. The basket below draws the real thing, because it holds it.
 */
function KitchenLine({ line }: { line: TableLine }) {
  const c = useTheme();
  const { lang } = useLocale();
  const { t } = useGuestCopy();

  const pending: TableStep[] = ['sent', 'accepted', 'cooking', 'ready'];

  return (
    <View style={s.kitchenRow}>
      <Text style={[s.lineQty, text.num, { color: c.fgSubtle }]}>{line.quantity}×</Text>

      <View style={s.grow}>
        <Text style={[s.lineName, { color: c.fg }]}>{translate(line.name, lang)}</Text>
        {pending.includes(line.step) ? (
          <Text style={[s.lineNote, { color: c.fgSubtle }]}>
            {t.status.steps[line.step]} · {t.status.pending}
          </Text>
        ) : null}
      </View>

      {/* `:370` — `{{l.p}}` is `f(...)`, a bare grouped figure. Every line said
          "so'm" as well, which the design prints once on the bill and never on
          a line. */}
      <Text style={[s.linePrice, text.num, { color: c.fg }]}>
        {som(lineTotal(line), lang, false)}
      </Text>
    </View>
  );
}

const s = StyleSheet.create({
  fill: { flex: 1 },
  grow: { flex: 1, minWidth: 0 },

  /* `:330` — `padding:18px 20px 14px;border-bottom:1px solid var(--border)`. */
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    paddingTop: 18,
    paddingHorizontal: 20,
    paddingBottom: 14,
    borderBottomWidth: 1,
  },
  back: { width: 26, height: 26, alignItems: 'center', justifyContent: 'center', marginLeft: -5 },
  /* `:331` — `font-size:21px;font-weight:700;letter-spacing:-.022em` in the
     display face. `text.title` is 20px at `-.012em`, one step short of it. */
  barTitle: displayAt(700, 21, 1.25),
  /* `:332` — `font-size:13px;margin-top:2px`. */
  barSub: { ...sansAt(400, 13, 1.45), marginTop: 2 },

  /* `:335` — the scroller's `padding:20px`. */
  page: { padding: 20 },

  /* `:336` — `padding:18px;border:1px solid var(--border);border-radius:16px`.
     The radius was `size.radiusXl` (20); the design draws 16 here and 20 is a
     visibly rounder card. */
  eta: { padding: 18, borderWidth: 1, borderRadius: 16 },
  /* `:337` */
  etaHead: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  /* `:338` */
  dot: { width: 9, height: 9, borderRadius: size.radiusPill },
  /* `:339` — `font-size:13px;font-weight:600;letter-spacing:.05em;uppercase`. */
  etaLabel: {
    ...sansAt(600, 13),
    letterSpacing: tracking('0.05em', 13),
    textTransform: 'uppercase',
  },
  /* `:342` — `font-size:13px;margin-top:3px`. */
  etaReady: { ...sansAt(400, 13, 1.45), marginTop: 3 },

  /* `:345` — `margin-top:20px`. */
  ladder: { marginTop: 20 },
  /* `:347-358` — `gap:14`, a 22-wide rail, a 22pt dot at `border:2px`, and
     `padding-bottom:18px` on the body. */
  rung: { flexDirection: 'row', gap: 14 },
  rungRail: { width: 22, alignItems: 'center' },
  rungDot: {
    width: 22,
    height: 22,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rungLine: { width: 2, flex: 1, minHeight: 22 },
  rungBody: { flex: 1, paddingBottom: 18 },

  /* `:364-366` — the section rule, then 12 down to the first row. */
  section: { marginTop: 6, paddingTop: 18, paddingBottom: 12, borderTopWidth: 1 },
  /* `:365` — `font-size:11px;font-weight:600;letter-spacing:.08em;uppercase`.
     `text.caps` is the 10px micro-label, which is a different step. */
  sectionHead: {
    ...sansAt(600, 11, 1.25),
    letterSpacing: tracking('0.08em', 11),
    textTransform: 'uppercase',
  },
  /* `:375` — `padding:14px 0;font-size:14px;line-height:1.55`. */
  sectionEmpty: { ...sansAt(400, 14, 1.55), paddingVertical: 14 },

  /* `:368-371` — `align-items:baseline;gap:10px`, a 20-wide quantity column,
     the name at 14px/500 and the figure at 14px/400. No rule under any of it. */
  kitchenRow: { flexDirection: 'row', alignItems: 'baseline', gap: 10 },
  rowGap: { height: 11 },
  lineQty: { ...sansAt(400, 13, 1.45), width: 20 },
  lineName: sansAt(500, 14, 1.45),
  /* `:370` — the sub-line: `font-size:12px;font-weight:400;margin-top:1px`. */
  lineNote: { ...sansAt(400, 12, 1.5), marginTop: 1 },
  linePrice: sansAt(400, 14, 1.45),

  /* The basket, drawn as a second block of the same section: `:366`'s 11px
     between rows, and the row itself centred because it carries a stepper. */
  basket: { gap: 11 },
  basketRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  money: { textAlign: 'right' },

  /* `:313-316` — the grouped stepper. */
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    padding: 3,
    borderWidth: 1,
    borderRadius: 12,
  },
  step: { width: 36, height: 36, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  /* `:315` — `width:26px;text-align:center;font-size:15px;font-weight:600`. */
  stepValue: { ...sansAt(600, 15, 1.2), width: 26, textAlign: 'center' },
  /* `:237` — the guest surface's docked CTA is `border-radius:14px` at 52. */
  send: { marginTop: 12, borderRadius: 14 },

  /* `:381` — `padding:14px 20px 20px;border-top:1px solid var(--border);
     gap:9px`. The bottom inset is added on top of the design's 20. */
  dock: { paddingTop: 14, paddingHorizontal: 20, gap: 9, borderTopWidth: 1 },
  /* `:382-383` — `height:46px;border:1px solid var(--border);
     border-radius:13px`. The primitive's secondary uses `--border-strong`. */
  dockButton: { borderRadius: 13 },

  demo: { marginTop: 20 },
});
