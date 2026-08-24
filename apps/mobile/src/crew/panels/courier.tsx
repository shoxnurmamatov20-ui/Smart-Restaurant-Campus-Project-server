import { useMemo, useState } from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';

import { COURIER_COPY, copy, fill, FLASH, SHARED } from '@restaurant/surfaces/crew/copy';
import {
  COURIER_CASH,
  COURIER_TODAY,
  DROPS,
  ROUTE_STOPS,
  ROUTE_SUMMARY,
  say,
  type Drop,
  type Lang,
  type RouteStop,
} from '@restaurant/surfaces/crew/data';

import { som } from '../../lib/money';
import { useTheme } from '../../lib/theme-context';
import { raw, size } from '../../theme';
import { display, sans, sansAt, text, tracking } from '../../type';
import { Button, Empty } from '../../ui/primitives';
import { Chip, Note, NotWired, Panel, SectionLabel } from '../bits';
import { DOCK_HEIGHT } from '../chrome';
import { useFlash } from '../flash';
import { useCrewChecklist, useRiderRound } from '../live';
import { enqueue } from '../queue';

/**
 * A courier's three screens: what is in the bag, where it goes, whose money it is.
 *
 * Drawn from `docs/design/source/Smart Restaurant Xodimlar ilovasi.dc.html` —
 * `mfAt.deliver` (403-440), `mfAt.route` (441-466) and `mfAt.cash` (468-486).
 * Every number below is that file's, not a rounded step off a scale: where the
 * two disagreed the file won, which is this repository's rule.
 *
 * The state of a drop lives here rather than in the fixture, because two of the
 * three figures above the list are derived from it — marking one delivered has
 * to move the counter, or the screen argues with itself two rows apart.
 */
export function DeliveriesPanel({ lang }: { lang: Lang }) {
  const t = copy(COURIER_COPY, lang);
  const f = copy(FLASH, lang);
  const shared = copy(SHARED, lang);
  const flash = useFlash();

  const [states, setStates] = useState<Readonly<Record<string, Drop['state']>>>(() =>
    Object.fromEntries(DROPS.map((drop) => [drop.id, drop.state])),
  );

  const left = useMemo(
    () => DROPS.filter((drop) => states[drop.id] !== 'delivered').length,
    [states],
  );

  function advance(drop: Drop) {
    const now = states[drop.id];
    const next = now === 'new' ? 'picked' : 'delivered';

    setStates((current) => ({ ...current, [drop.id]: next }));
    /*
     * No verb, for the reason `calls.tsx` gives at length.
     *
     * `delivery_status` is real and takes `order_id` — the numeric key of the
     * bill — plus one of four words. `DROPS` is a fixture: its ids are `p1`,
     * `p2`, and `number` is the string printed on the bag (`#2841`), not a key.
     * The entry used to send `{ drop, number, status }`, none of which the
     * server reads, so every one of them came back `payload_incomplete` and
     * told a courier their delivery had not been recorded.
     */
    enqueue(next === 'picked' ? t.pick : t.deliver, `${drop.number} · ${say(drop.address, lang)}`);
    flash(next === 'picked' ? f.dropPicked : f.dropDelivered);
  }

  return (
    <FlatList
      data={DROPS}
      keyExtractor={(drop) => drop.id}
      contentContainerStyle={s.page}
      showsVerticalScrollIndicator={false}
      ListHeaderComponent={
        <View>
          <StatStrip
            cells={[
              { label: say(COURIER_TODAY.left, lang), value: String(left) },
              { label: say(COURIER_TODAY.done, lang), value: COURIER_TODAY.doneCount },
              { label: say(COURIER_TODAY.distance, lang), value: COURIER_TODAY.distanceValue },
            ]}
          />

          {/*
           * `dc.html:411` goes straight from the strip to the first card, and
           * the caps label that used to stand here has no `{{mf.*}}` behind it
           * at all — it was invented. Gone.
           *
           * The disclosure stays, and deliberately: `advance()` above has no
           * verb to send, so a courier who presses "Yetkazdim" and walks away
           * would otherwise believe the restaurant had been told. A screen may
           * look unlike the drawing; it may not claim work it did not do.
           */}
          <View style={s.wired}>
            <NotWired>{shared.notWired}</NotWired>
          </View>
        </View>
      }
      ListEmptyComponent={<Empty title={t.noDrops} />}
      renderItem={({ item }) => (
        <DropCard
          drop={item}
          state={states[item.id] ?? item.state}
          lang={lang}
          labels={t}
          onAdvance={() => advance(item)}
        />
      )}
    />
  );
}

/**
 * The three figures above the drop list — `dc.html:404-411`.
 *
 * One joined strip, not a grid of tiles. The design draws
 * `grid-template-columns:repeat(3,1fr);gap:1px` over a `--divider` ground with
 * one border around the whole thing; `TileGrid` is a two-up wrap, so three
 * figures came out as two filled `bg-subtle` boxes and an orphan on a row of
 * its own — a shape this screen does not contain.
 *
 * The gap IS the rule: the container paints `divider` and each cell repaints
 * itself `surface` on top, which is exactly how the CSS grid renders it. Do not
 * "tidy" the 1 into a border on the cells — the corners are clipped by
 * `overflow:hidden` and a cell border would show through them.
 */
function StatStrip({ cells }: { cells: readonly { label: string; value: string }[] }) {
  const c = useTheme();

  return (
    <View style={[s.strip, { backgroundColor: c.divider, borderColor: c.border }]}>
      {cells.map((cell) => (
        <View key={cell.label} style={[s.cell, { backgroundColor: c.surface }]}>
          <Text style={[s.cellLabel, { color: c.fgSubtle }]} numberOfLines={1}>
            {cell.label}
          </Text>
          <Text style={[s.cellValue, text.num, { color: c.fg }]} numberOfLines={1}>
            {cell.value}
          </Text>
        </View>
      ))}
    </View>
  );
}

function DropCard({
  drop,
  state,
  lang,
  labels,
  onAdvance,
}: {
  drop: Drop;
  state: Drop['state'];
  lang: Lang;
  labels: {
    stateNew: string;
    statePicked: string;
    stateDelivered: string;
    collect: string;
    paid: string;
    pick: string;
    deliver: string;
  };
  onAdvance: () => void;
}) {
  const c = useTheme();

  const badge =
    state === 'delivered'
      ? { word: labels.stateDelivered, tone: 'success' as const }
      : state === 'picked'
        ? { word: labels.statePicked, tone: 'brand' as const }
        : { word: labels.stateNew, tone: 'warning' as const };

  /*
   * `border-left:3px solid {{d.color}}` — `dc.html:413`, coloured per state at
   * `:1678`, `:1683` and `:1688`: brand while the bag is on the bike, warning
   * while it is still on the counter, `n-400` once it is gone. The card carried
   * no edge, so all three states drew the same card and the one thing a courier
   * scans a list for — what is still owed — was invisible.
   */
  const edge = state === 'picked' ? c.brand500 : state === 'new' ? c.warning500 : c.n400;

  /*
   * `d.payBg` runs to three tints, not two. Money already taken by card is
   * `success-50` ("nothing to ask for"), cash still to collect is `warning-50`,
   * and cash already collected goes quiet. Paid was drawing neutral — the same
   * grey as collected — which is the one pair a courier must not confuse.
   */
  const pay = state === 'delivered' ? 'neutral' : drop.collectCash ? 'warning' : 'success';

  return (
    <Panel edge={edge} style={s.card}>
      <View style={s.head}>
        {/*
         * `font-family:var(--font-mono);font-size:var(--text-xs);font-weight:600;
         * color:var(--fg-muted)` — `dc.html:415`. It was 13px in full `fg`,
         * which made the bag number compete with the address below it. The
         * design's mono face is not bundled here (`src/type.ts` explains why
         * `text.num` is Inter's tabular figures and not a typewriter), so the
         * size, weight and colour are the design's and the face is Inter.
         */}
        <Text style={[s.no, text.num, { color: c.fgMuted }]}>{drop.number}</Text>
        <Chip tone={badge.tone}>{badge.word}</Chip>
      </View>

      {/* `font-size:var(--text-md);font-weight:600;line-height:1.35;margin-top:7px`
          — `dc.html:418`. This is the card's biggest line and it was drawn at
          12px in `fg-muted`: the one thing a courier actually reads was styled
          as metadata under the number. */}
      <Text style={[s.address, { color: c.fg }]}>{say(drop.address, lang)}</Text>

      {/*
       * Where the bag came from and when — "Chilonzor filialidan olindi · 09:38"
       * at `font-size:12px;color:var(--fg-muted);margin-top:3px` (`dc.html`, the
       * `DROPS` fixture's `from`).
       *
       * The `Drop` type had no field for it, so no card carried it: a courier
       * with four bags in the box could not tell which branch this one came out
       * of, or how long it had been in the car.
       */}
      <Text style={[s.from, { color: c.fgMuted }]}>{say(drop.from, lang)}</Text>

      {/* `margin-top:10px;padding-top:10px;border-top:1px solid var(--divider)`
          — `dc.html:420`. The money is its own block behind a rule, and the pay
          chip sits on a second line under the total (`display:inline-block;
          margin-top:8px`, `:425`). All three were crushed onto one row. */}
      <View style={[s.money, { borderTopColor: c.divider }]}>
        <View style={s.moneyRow}>
          <Text style={[s.total, text.num, { color: c.fg }]}>{som(drop.total, lang, false)}</Text>
          <Text style={[s.km, text.num, { color: c.fgSubtle }]}>{drop.distance}</Text>
        </View>

        {/*
         * Whether this money is the courier's to collect is the single most
         * consequential fact on the card — handing over a prepaid order and
         * asking for cash is the mistake this line exists to prevent — so it is a
         * word rather than an icon.
         *
         * `md` for the heavier chip the design gives this one alone —
         * `padding:4px 9px;font-weight:700` at `:425`, against `3px 8px;600` for
         * the status chip above it. The pair is deliberate: the status is what
         * the round already knows, the pay word is what the courier must do.
         */}
        <View style={s.pay}>
          <Chip tone={pay} size="md">
            {drop.collectCash ? labels.collect : labels.paid}
          </Chip>
        </View>
      </View>

      {/*
       * What the guest asked for — "do not ring, knock instead", "also asked for
       * a printed receipt". The design gives it its own line at the foot of the
       * card, and it is the half of a delivery a courier cannot work out from an
       * address.
       */}
      <Text style={[s.guestNote, { color: c.fgMuted }]}>{say(drop.note, lang)}</Text>

      {state === 'delivered' ? null : (
        /* `height:46px;margin-top:12px;font-size:var(--text-sm)` — `dc.html:432`
           and `:435`. A page CTA is 52 and this is not one; the label is 13, not
           the button preset's 15. */
        <Button
          kind={state === 'picked' ? 'primary' : 'secondary'}
          height={46}
          style={s.action}
          textStyle={s.actionLine}
          onPress={onAdvance}
        >
          {state === 'picked' ? labels.deliver : labels.pick}
        </Button>
      )}
    </Panel>
  );
}

/* ------------------------------------------------------------------ route */

export function RoutePanel({ lang }: { lang: Lang }) {
  const c = useTheme();
  const t = copy(COURIER_COPY, lang);

  return (
    <FlatList
      data={ROUTE_STOPS}
      keyExtractor={(stop) => stop.id}
      contentContainerStyle={s.page}
      showsVerticalScrollIndicator={false}
      ListHeaderComponent={
        /*
         * Two bare figure columns on one line, ruled off — `dc.html:442-451`.
         * They were `Tile`s: filled `bg-subtle` boxes with 14px corners, which
         * is a card, and there is no card here. The caps label that followed
         * them is not in the design either, and was dropped with them.
         */
        <View style={[s.routeHead, { borderBottomColor: c.divider }]}>
          <View>
            <Text style={[s.figureLabel, { color: c.fgSubtle }]}>{t.routeLeft}</Text>
            <Text style={[s.figure, text.num, { color: c.fg }]}>{ROUTE_SUMMARY.distance}</Text>
          </View>

          <View style={s.right}>
            <Text style={[s.figureLabel, { color: c.fgSubtle }]}>{t.routeTime}</Text>
            <Text style={[s.figure, text.num, { color: c.fg }]}>
              {say(ROUTE_SUMMARY.minutes, lang)}
            </Text>
          </View>
        </View>
      }
      renderItem={({ item, index }) => <Stop stop={item} index={index} lang={lang} />}
      ListFooterComponent={<Note>{t.routeNote}</Note>}
    />
  );
}

/**
 * One stop on the round — `dc.html:452-464`.
 *
 * A flat row under a rule, not a card, and it opens with a **numbered 24px
 * disc**. That number is the whole point of the screen: a round is an order,
 * and the previous drawing — bordered cards with a "Keyingi" chip on one of
 * them — said which stop is next while saying nothing about what follows it.
 * The brand-filled disc is what marks the next stop, so the chip is gone with
 * the card.
 */
function Stop({ stop, index, lang }: { stop: RouteStop; index: number; lang: Lang }) {
  const c = useTheme();

  return (
    <View style={[s.stop, { borderBottomColor: c.divider }]}>
      <View style={[s.disc, { backgroundColor: stop.next ? c.brand500 : c.bgMuted }]}>
        <Text style={[s.discLine, text.num, { color: stop.next ? c.n0 : c.fgMuted }]}>
          {index + 1}
        </Text>
      </View>

      <View style={s.main}>
        <Text style={[s.stopName, { color: c.fg }]}>{say(stop.name, lang)}</Text>
        <Text style={[s.stopKind, { color: c.fgMuted }]}>{say(stop.kind, lang)}</Text>
      </View>

      <View style={s.right}>
        <Text style={[s.eta, text.num, { color: c.fg }]}>{stop.eta}</Text>
        <Text style={[s.stopKm, text.num, { color: c.fgSubtle }]}>{stop.distance}</Text>
      </View>
    </View>
  );
}

/* ------------------------------------------------------------------- cash */

/**
 * What a courier is carrying, which is the till's money until somebody counts it.
 *
 * `COURIER_COPY.cashNote` is the sentence that decides how they think about the
 * notes in their pocket for the rest of the shift, so it sits under the button
 * rather than in a help screen.
 */
export function CashPanel({ lang }: { lang: Lang }) {
  const c = useTheme();
  const t = copy(COURIER_COPY, lang);
  const f = copy(FLASH, lang);
  const flash = useFlash();

  /*
   * Two reads, because the answer is two facts read together: what is still out
   * (`deliveries/mine`) and whether this person already declared today
   * (`staff.actions`). From one alone the button either offers a second
   * declaration or hides the first.
   */
  const round = useRiderRound();
  const ticks = useCrewChecklist();

  const [handedIn, setHandedIn] = useState(false);

  /*
   * Only the drops that owe money. A card payment already reached the
   * restaurant, and putting it on a hand-over list would have a cashier
   * counting notes nobody collected.
   */
  const rows = round.live
    ? round.data
        .filter((drop) => drop.collectTiyin > 0)
        .map((drop) => ({
          number: drop.number,
          where: { uz: drop.where, ru: drop.where, en: drop.where },
          amount: drop.collectTiyin,
        }))
    : COURIER_CASH.rows;

  /* Summed from the rows rather than stored: a hero card that announced a total
     the list beneath it did not add up to is the first figure a courier stops
     believing. */
  const onHand = round.live ? rows.reduce((sum, row) => sum + row.amount, 0) : COURIER_CASH.onHand;

  const declared = ticks.live && ticks.data.declaredTiyin !== null;
  const sendable = round.live && onHand > 0;

  return (
    <FlatList
      data={rows}
      keyExtractor={(row) => row.number}
      contentContainerStyle={s.page}
      showsVerticalScrollIndicator={false}
      ListHeaderComponent={
        <View>
          {/* `border:1px solid var(--border);border-radius:var(--radius-lg);
              padding:17px 18px` — `dc.html:469`. It was a filled `bg-subtle`
              box at 20px corners with 19 all round: the design's one bordered
              white card on this screen had been drawn as a tinted panel. */}
          <View style={[s.onHand, { backgroundColor: c.surface, borderColor: c.border }]}>
            <Text style={[s.onHandLabel, { color: c.fgSubtle }]}>{t.onHand}</Text>
            <Text style={[text.display, text.num, s.onHandValue, { color: c.fg }]}>
              {som(onHand, lang, false)}
            </Text>
            {/* `{n}` is the courier's own delivered count. Unfilled, the screen
                printed the placeholder itself — "so'm · {n} buyurtma" — directly
                under the figure a rider hands to a cashier. */}
            <Text style={[s.onHandNote, { color: c.fgSubtle }]}>
              {fill(t.onHandNote, { n: rows.length })}
            </Text>
          </View>

          <SectionLabel>{t.collected}</SectionLabel>
        </View>
      }
      renderItem={({ item }) => (
        /* `padding:12px 0;border-bottom:1px solid var(--divider)` — `dc.html:476`.
           The rule belongs to the row, not to the gap between two of them: the
           design draws one under the last row as well, and a separator cannot. */
        <View style={[s.cashRow, { borderBottomColor: c.divider }]}>
          <View style={s.main}>
            {/* The emphasis was inverted here: the bag number was 13px/600 in
                full `fg` and the address 12px `fg-subtle`. `dc.html:478-479`
                has it the other way round — the number is quiet mono 12px
                `fg-muted`, the address is the line you read. */}
            <Text style={[s.cashNo, text.num, { color: c.fgMuted }]}>{item.number}</Text>
            <Text style={[s.cashWhere, { color: c.fg }]} numberOfLines={1}>
              {say(item.where, lang)}
            </Text>
          </View>
          <Text style={[s.cashAmount, text.num, { color: c.fg }]}>
            {som(item.amount, lang, false)}
          </Text>
        </View>
      )}
      ListFooterComponent={
        <View>
          {/* `height:48px;margin-top:18px` — `dc.html:483`. */}
          <Button
            height={48}
            style={s.cashAction}
            textStyle={s.actionLine}
            disabled={handedIn || declared}
            onPress={() => {
              setHandedIn(true);

              if (!sendable) {
                // A fixture round has nothing real to declare, and a rider who
                // collected nothing has nothing to hand over — a row saying "0"
                // would read as a hand-over that happened when none did.
                flash(f.notRecorded, 'problem');

                return;
              }

              /*
               * `cash_handover` — the tenth verb. It writes to `staff.actions`
               * and nowhere else: the money moves when a cashier counts it into
               * a drawer against their own shift, and a rider who could post
               * that movement would be declaring cash into a till nobody
               * counted. What the journal gives the cashier is the other side
               * of the reconciliation.
               */
              enqueue(t.handIn, som(onHand, lang), {
                kind: 'cash_handover',
                payload: { amount_tiyin: onHand, drops: rows.length },
              });

              flash(f.cashHandedIn);
            }}
          >
            {handedIn || declared ? t.handedIn : t.handIn}
          </Button>

          <Note>{t.cashNote}</Note>
        </View>
      }
    />
  );
}

/*
 * `padding:16px 18px 108px` on the scroller — `dc.html:143`.
 *
 * Where the design declares no `line-height`, none is set here either: CSS
 * `normal` and an unset RN `lineHeight` are both "whatever the face measures",
 * and inventing a ratio is how a 15px line ends up 3px taller than the drawing.
 */
const s = StyleSheet.create({
  page: { paddingHorizontal: 18, paddingTop: size.sp4, paddingBottom: DOCK_HEIGHT + size.sp6 },

  /* deliver -------------------------------------------------------------- */
  strip: {
    flexDirection: 'row',
    gap: 1,
    borderWidth: 1,
    borderRadius: size.radiusLg,
    overflow: 'hidden',
  },
  cell: { flex: 1, minWidth: 0, paddingVertical: 13, paddingHorizontal: 12 },
  cellLabel: { ...sans(400), fontSize: size.text3xs },
  /* No `letterSpacing`: `dc.html:408` is the one display figure on these three
     screens with no `--tracking-*` on it, and `displayAt` would add one. */
  cellValue: { ...display(700), fontSize: size.textLg, marginTop: 3 },
  wired: { marginTop: 12 },
  /* `margin-top:10px` — `dc.html:413`, on every card including the first. It
     was `marginBottom`, which left the strip and the first card touching and
     hung a 10px tail off the last one. `Panel` draws the design's own
     `padding:15px 16px`, so nothing here restates it. */
  card: { marginTop: 10 },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  no: { ...sans(600), fontSize: size.textXs },
  address: { ...sansAt(600, size.textMd, 1.35), marginTop: 7 },
  /* `font-size:12px;margin-top:3px` — where the bag was picked up. */
  from: { ...sansAt(400, 12, 1.45), marginTop: 3 },
  /* The guest's own instruction, at the foot of the card. */
  guestNote: { ...sansAt(400, 12, 1.45), marginTop: 10 },
  money: { marginTop: 10, paddingTop: 10, borderTopWidth: 1 },
  moneyRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: 12,
  },
  total: { ...display(700), fontSize: size.textLg },
  km: { ...sans(400), fontSize: size.textXs },
  pay: { marginTop: 8, alignItems: 'flex-start' },
  action: { marginTop: 12 },
  actionLine: { ...sansAt(600, size.textSm, 1.2) },

  /* route ---------------------------------------------------------------- */
  routeHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
    paddingBottom: 14,
    borderBottomWidth: 1,
  },
  figureLabel: { ...sans(400), fontSize: size.text2xs },
  figure: {
    ...display(700),
    fontSize: size.textXl,
    letterSpacing: tracking(raw.trackingSnug, size.textXl),
    marginTop: 3,
  },
  right: { alignItems: 'flex-end' },
  stop: { flexDirection: 'row', gap: 13, paddingVertical: 14, borderBottomWidth: 1 },
  disc: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  discLine: { ...sansAt(700, size.text2xs, 1.2) },
  main: { flex: 1, minWidth: 0 },
  stopName: { ...sansAt(600, size.textSm, 1.35) },
  stopKind: { ...sans(400), fontSize: size.textXs, marginTop: 2 },
  eta: { ...sans(600), fontSize: size.textSm },
  stopKm: { ...sans(400), fontSize: size.text2xs, marginTop: 2 },

  /* cash ----------------------------------------------------------------- */
  onHand: {
    borderWidth: 1,
    borderRadius: size.radiusLg,
    paddingVertical: 17,
    paddingHorizontal: 18,
  },
  onHandLabel: { ...sans(400), fontSize: size.textXs },
  onHandValue: { marginTop: 5 },
  onHandNote: { ...sans(400), fontSize: size.text2xs, marginTop: 3 },
  cashRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  cashNo: { ...sans(400), fontSize: size.textXs },
  cashWhere: { ...sans(500), fontSize: size.textSm, marginTop: 2 },
  cashAmount: { ...sans(600), fontSize: size.textSm },
  cashAction: { marginTop: 18 },
});
