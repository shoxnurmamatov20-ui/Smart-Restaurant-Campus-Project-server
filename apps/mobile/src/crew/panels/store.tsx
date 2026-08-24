import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { copy, fill, FLASH, SHARED, STORE_COPY } from '@restaurant/surfaces/crew/copy';
import {
  say,
  STORE_TODAY,
  type CrewRole,
  type Delivery,
  type Lang,
  type StockRow,
} from '@restaurant/surfaces/crew/data';
import { realId } from '@restaurant/surfaces/crew/live';

import { som } from '../../lib/money';
import { useTheme } from '../../lib/theme-context';
import { raw, size } from '../../theme';
import { display, sans, text, tracking } from '../../type';
import { Button, Empty, PRESSED } from '../../ui/primitives';
import { DemoLine, Hero, Intro, NotWired, Note, Panel } from '../bits';
import { DOCK_HEIGHT } from '../chrome';
import { useDeliveries, useShelf } from '../live';
import { useFlash } from '../flash';
import { enqueue } from '../queue';

/* ============================================================
   Receiving — what is arriving today, and what is at the door
   ============================================================ */

export function ReceivingPanel({ lang, role }: { lang: Lang; role: CrewRole }) {
  const c = useTheme();
  const t = copy(STORE_COPY, lang);
  const f = copy(FLASH, lang);
  const shared = copy(SHARED, lang);
  const flash = useFlash();
  const router = useRouter();

  const [started, setStarted] = useState<readonly string[]>([]);

  /*
   * No fixture behind the vans, and that is deliberate.
   *
   * `receive_confirm` names a purchase order by number and raises the
   * supplier's debt — the heaviest entry this app can queue. A sample delivery
   * carries a word id, so confirming one books nothing while telling a
   * storekeeper the stock is in and the invoice is owed.
   */
  const vans = useDeliveries();

  return (
    <FlatList
      data={vans.data}
      keyExtractor={(item) => item.id}
      contentContainerStyle={s.page}
      showsVerticalScrollIndicator={false}
      ListHeaderComponent={
        <View>
          {vans.live ? null : (
            <DemoLine text={t.demoShelf} problem={vans.problem} onRetry={vans.reload} />
          )}
          <Hero
            label={say(STORE_TODAY.label, lang)}
            value={som(STORE_TODAY.value, lang, false)}
            stats={STORE_TODAY.stats.map((stat) => ({
              value: stat.value,
              label: say(stat.label, lang),
            }))}
          />

          {/*
           * A **dashed** placeholder, not a solid secondary button.
           *
           * `Smart Restaurant Xodimlar ilovasi.dc.html:263` —
           * `height:52px;border:1px dashed var(--border-strong);border-radius:
           * var(--radius-lg);background:var(--bg-subtle)` with a 19×19 barcode
           * glyph at `gap:9`. The dash is the whole message: this is the empty
           * frame the scanner fills, not another thing to press. It was a solid
           * 44-tall `Button` with no icon, which read as a peer of "start
           * receiving" — and receiving a delivery is not scanning a code.
           */}
          <Pressable
            accessibilityRole="button"
            onPress={() => router.push(`/crew/${role}/more/scan`)}
            style={({ pressed }) => [
              s.scanCta,
              {
                borderColor: c.borderStrong,
                backgroundColor: c.bgSubtle,
                borderRadius: size.radiusLg,
              },
              pressed && PRESSED,
            ]}
          >
            <Barcode colour={c.fgMuted} />
            <Text style={[text.small, s.scanLine, { color: c.fgMuted }]} numberOfLines={1}>
              {t.scan}
            </Text>
          </Pressable>

          {/* `--text-2xs`, `margin:20px 0 9px` — …dc.html:267. */}
          <Text style={[s.caps, { color: c.fgSubtle }]}>{t.today}</Text>
          <NotWired>{shared.notWired}</NotWired>
        </View>
      }
      ListEmptyComponent={<Empty title={t.noDeliveries} />}
      renderItem={({ item }) => (
        <DeliveryCard
          delivery={item}
          lang={lang}
          started={started.includes(item.id)}
          labels={t}
          onStart={() => {
            setStarted((current) => [...current, item.id]);
            /*
             * No verb, for the reason `calls.tsx` gives at length.
             *
             * `receive_confirm` is real and takes `purchase_order_id`, which
             * `Receiving::confirm()` uses to raise stock on every line and grow
             * the supplier's debt — the heaviest entry in the queue. `DELIVERIES`
             * is a fixture whose ids are `v1`, `v2`, and the old payload sent
             * `{ delivery, supplier }`: neither key is read, so the entry came
             * back `payload_incomplete` while the screen said the receiving had
             * started.
             */
            enqueue(t.receiveStarted, item.supplier);
            flash(f.receivingStarted);
          }}
        />
      )}
      ListFooterComponent={<Note>{t.receivingNote}</Note>}
    />
  );
}

/** The design's 19×19 barcode outline — `stroke-width:1.75`, …dc.html:264. */
function Barcode({ colour }: { colour: string }) {
  return (
    <Svg width={19} height={19} viewBox="0 0 24 24" fill="none">
      <Path
        d="M3 8V5.5A1.5 1.5 0 0 1 4.5 4H7"
        stroke={colour}
        strokeWidth={1.75}
        strokeLinecap="round"
      />
      <Path
        d="M17 4h2.5A1.5 1.5 0 0 1 21 5.5V8"
        stroke={colour}
        strokeWidth={1.75}
        strokeLinecap="round"
      />
      <Path
        d="M21 16v2.5a1.5 1.5 0 0 1-1.5 1.5H17"
        stroke={colour}
        strokeWidth={1.75}
        strokeLinecap="round"
      />
      <Path
        d="M7 20H4.5A1.5 1.5 0 0 1 3 18.5V16"
        stroke={colour}
        strokeWidth={1.75}
        strokeLinecap="round"
      />
      <Path d="M3 12h18" stroke={colour} strokeWidth={1.75} strokeLinecap="round" />
    </Svg>
  );
}

function DeliveryCard({
  delivery,
  lang,
  started,
  labels,
  onStart,
}: {
  delivery: Delivery;
  lang: Lang;
  started: boolean;
  labels: {
    enRoute: string;
    arrived: string;
    tomorrow: string;
    lines: string;
    receive: string;
    receiveStarted: string;
  };
  onStart: () => void;
}) {
  const c = useTheme();

  /*
   * The three tints are the design's own, and two of them were both wrong and
   * swapped: `…dc.html:1497–1499` gives *en route* `warning-50 / warning-700`,
   * *arrived* `brand-50 / brand-700` and *tomorrow* `bg-muted / fg-muted`. The
   * screen painted arrived green and en route blue, so the one van the
   * storekeeper has to walk to looked like the one still on the motorway.
   *
   * Drawn here rather than through `bits.Chip` because the drawing gives this
   * chip its own literals — `font-size:10px;font-weight:600;padding:3px 8px` —
   * and its own 700-weight colour ramp, which the shared tone map does not have.
   */
  const status =
    delivery.status === 'arrived'
      ? { word: labels.arrived, bg: c.brand50, fg: c.brand700 }
      : delivery.status === 'en-route'
        ? { word: labels.enRoute, bg: c.warning50, fg: c.warning700 }
        : { word: labels.tomorrow, bg: c.bgMuted, fg: c.fgMuted };

  return (
    <Panel style={s.card}>
      <View style={s.head}>
        <Text style={[text.small, s.title, { color: c.fg }]} numberOfLines={1}>
          {delivery.supplier}
        </Text>
        <View style={[s.chip, { backgroundColor: status.bg, borderRadius: size.radiusPill }]}>
          <Text style={[s.chipLine, { color: status.fg }]}>{status.word}</Text>
        </View>
      </View>

      <View style={s.money}>
        {/* `--text-lg` (17) in the display face, not `--text-xl` — …dc.html:275. */}
        <Text style={[s.amount, text.num, { color: c.fg }]}>
          {som(delivery.amount, lang, false)}
        </Text>
        <Text style={[text.caption, text.num, { color: c.fgSubtle }]}>
          {fill(labels.lines, { n: delivery.lines })}
        </Text>
      </View>

      <Text style={[text.caption, s.note, { color: c.fgMuted }]}>{say(delivery.note, lang)}</Text>

      {/*
       * Everything except tomorrow's van carries the button. `d.open` is
       * `!deliv[d.id] && d.id !== "v3"` (…dc.html:1502) and `v3` is the
       * `Ertaga` line — so the van still on the road gets one too. That is the
       * storekeeper's own order of work: receiving is *opened* against the
       * document so the lines can be scanned as the pallets come off, rather
       * than started once the driver is already standing at the door. Only
       * goods that are not coming today have nothing to open, and the screen
       * used to show a control on exactly one of the three cards.
       */}
      {delivery.status === 'tomorrow' ? null : started ? (
        <View style={[s.done, { backgroundColor: c.success50, borderRadius: size.radiusMd }]}>
          <Text style={[text.caption, s.doneLine, { color: c.success700 }]}>
            {labels.receiveStarted}
          </Text>
        </View>
      ) : (
        <Button style={s.accept} height={44} onPress={onStart}>
          {labels.receive}
        </Button>
      )}
    </Panel>
  );
}

/* ============================================================
   Counting — the system quantity is hidden, and that is the design
   ============================================================ */

export function CountPanel({ lang }: { lang: Lang }) {
  const c = useTheme();
  const t = copy(STORE_COPY, lang);
  const f = copy(FLASH, lang);
  const flash = useFlash();

  const [counts, setCounts] = useState<Readonly<Record<string, string>>>({});
  const [saved, setSaved] = useState(false);

  /*
   * The shelf itself, because a count is submitted against `ingredient_id`.
   *
   * Empty when the server refuses rather than the design's rows: every line on
   * this sheet is a form, and a storekeeper counting a fixture has counted
   * nothing — the entries come back `unknown_ingredient` one by one.
   */
  const shelf = useShelf(lang);

  const done = useMemo(
    () => shelf.data.filter((item) => (counts[item.id] ?? '').trim() !== '').length,
    [counts, shelf.data],
  );

  /* `inc`/`dec` as the design writes them: `Math.max(0, (cq || 0) ± 1)`. The
     `toFixed` keeps 12.5 + 1 from arriving as 13.500000000000002. */
  const step = (id: string, by: number) =>
    setCounts((current) => {
      const now = Number.parseFloat((current[id] ?? '').replace(',', '.'));
      const next = Math.max(0, (Number.isFinite(now) ? now : 0) + by);

      return { ...current, [id]: String(Number(next.toFixed(2))) };
    });

  return (
    <FlatList
      data={shelf.data}
      keyExtractor={(item) => item.id}
      contentContainerStyle={s.page}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
      /* One muted paragraph and nothing else above the list — …dc.html:287. The
         `{done}/{total}` caps line was this screen's invention, and it turned a
         sheet somebody works down into a task with a score. */
      ListHeaderComponent={
        <View>
          {shelf.live ? null : (
            <DemoLine text={t.demoShelf} problem={shelf.problem} onRetry={shelf.reload} />
          )}
          <Intro>{t.hidden}</Intro>
        </View>
      }
      renderItem={({ item }) => (
        <View style={s.countRow}>
          <View style={s.main}>
            <Text style={[text.small, s.title, { color: c.fg }]} numberOfLines={1}>
              {say(item.name, lang)}
            </Text>
            <Text style={[s.meta, { color: c.fgSubtle, marginTop: 2 }]}>
              {say(item.unit, lang)}
            </Text>
          </View>

          {/*
           * A stepper, which is what the drawing draws: a 36×36 `−`, a 46px
           * figure at `--text-lg` in the display face, a 36×36 `+`, `gap:8`
           * (…dc.html:295–297). It was a 96×44 field with a decimal keypad.
           *
           * The figure stays a `TextInput` — styled as the design's bare span,
           * with no border and no ground of its own — because a storekeeper
           * counts 12.5 kilos and a stepper alone cannot say that. Untouched
           * lines show the design's `0` as a full-strength placeholder, so
           * "not counted yet" and "counted, none left" stay different answers.
           */}
          <View style={s.stepper}>
            <StepKey
              glyph="−"
              label={`− ${say(item.name, lang)}`}
              disabled={saved}
              onPress={() => step(item.id, -1)}
            />

            <TextInput
              value={counts[item.id] ?? ''}
              onChangeText={(value) =>
                // Digits and one separator. A storekeeper types 12.5 kilos on a
                // keypad that also offers a comma, and a field that accepted
                // letters would collect the unit twice.
                setCounts((current) => ({
                  ...current,
                  [item.id]: value.replace(/[^\d.,]/g, '').slice(0, 8),
                }))
              }
              keyboardType="decimal-pad"
              editable={!saved}
              placeholder="0"
              placeholderTextColor={c.fg}
              accessibilityLabel={say(item.name, lang)}
              style={[s.qty, text.num, { color: c.fg }]}
            />

            <StepKey
              glyph="+"
              label={`+ ${say(item.name, lang)}`}
              disabled={saved}
              onPress={() => step(item.id, 1)}
            />
          </View>
        </View>
      )}
      ItemSeparatorComponent={() => <View style={[s.rule, { backgroundColor: c.divider }]} />}
      ListFooterComponent={
        <View>
          <Button
            style={s.save}
            height={48}
            disabled={saved || done === 0}
            onPress={() => {
              setSaved(true);

              /*
               * One entry per line, not one for the sheet.
               *
               * `count_submit` posts a variance against a single
               * `ingredient_id`; a sheet-shaped entry has nothing the server
               * can apply. Until this list read the shelf there was no id to
               * name at all and the queue carried a verbless row — visible,
               * unsendable, and honest about it.
               *
               * `Math.round` because the whole ledger is whole units:
               * `stock_movements.quantity` is an integer column and
               * `recordCount()` takes an int, so 12.5 kg reaches the server as
               * 12 whatever the sheet allows somebody to type. Rounding loses
               * at most half a unit; the cast the server does loses up to one,
               * always downward.
               */
              for (const item of shelf.data) {
                const typed = (counts[item.id] ?? '').trim().replace(',', '.');

                if (typed === '') continue;

                const counted = Number.parseFloat(typed);
                const id = realId(item.id);

                if (!Number.isFinite(counted) || counted < 0 || id === null) continue;

                enqueue(t.countSaved, say(item.name, lang), {
                  kind: 'count_submit',
                  payload: { ingredient_id: id, counted: Math.round(counted) },
                });
              }

              flash(f.countSaved);
            }}
          >
            {saved ? t.countSaved : t.finish}
          </Button>

          <Note>{t.countNote}</Note>
        </View>
      }
    />
  );
}

/** One half of the stepper — `36×36`, `border-radius:10px`, a 17px glyph. */
function StepKey({
  glyph,
  label,
  disabled,
  onPress,
}: {
  glyph: string;
  label: string;
  disabled: boolean;
  onPress: () => void;
}) {
  const c = useTheme();

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        s.step,
        { borderColor: c.borderStrong, backgroundColor: c.surface },
        pressed && PRESSED,
        disabled && s.off,
      ]}
    >
      <Text style={[s.stepGlyph, { color: c.fg }]}>{glyph}</Text>
    </Pressable>
  );
}

/* ============================================================
   Stock — days of cover, which is not the same as quantity
   ============================================================ */

export function StockPanel({ lang }: { lang: Lang }) {
  const c = useTheme();
  const t = copy(STORE_COPY, lang);

  // Sorted by urgency rather than by size, which is the screen's whole argument:
  // ninety-six bottles is the largest number on the page and the second-least
  // urgent thing on it.
  /*
   * The same read as the count sheet, sorted by urgency rather than by size —
   * which is this tab's whole argument: ninety-six bottles is the largest
   * number on the page and the second-least urgent thing on it.
   */
  const shelf = useShelf(lang);
  const rows = useMemo(() => [...shelf.data].sort((a, b) => a.days - b.days), [shelf.data]);

  /* The bare list, and only the bare list — …dc.html:305–315 draws no label
     above it and no sentence under it, and the two this screen added had no
     `{{mf.*}}` behind them to come from. */
  return (
    <FlatList
      data={rows}
      keyExtractor={(row) => row.id}
      contentContainerStyle={s.page}
      showsVerticalScrollIndicator={false}
      renderItem={({ item }) => <StockLine row={item} lang={lang} daysTemplate={t.days} />}
      ItemSeparatorComponent={() => <View style={[s.rule, { backgroundColor: c.divider }]} />}
    />
  );
}

function StockLine({
  row,
  lang,
  daysTemplate,
}: {
  row: StockRow;
  lang: Lang;
  daysTemplate: string;
}) {
  const c = useTheme();

  // Under a day and a half is a shift that runs out mid-service; under three is
  // an order that has to go today. The thresholds are the design's, and so are
  // both halves of each pair — the cover chip is `11px/700` on `4px 9px`, a
  // different chip from the delivery status pill above (…dc.html:312).
  const chip =
    row.days < 1.5
      ? { bg: c.danger50, fg: c.danger700 }
      : row.days < 3
        ? { bg: c.warning50, fg: c.warning700 }
        : { bg: c.bgMuted, fg: c.fgMuted };

  return (
    <View style={s.stockRow}>
      <View style={s.main}>
        <Text style={[text.small, s.title, { color: c.fg }]} numberOfLines={1}>
          {say(row.name, lang)}
        </Text>
        <Text style={[s.meta, text.num, { color: c.fgSubtle, marginTop: 2 }]}>{row.onHand}</Text>
      </View>

      {/* `STORE_COPY.days` already carries the word — "{n} kun" / "{n} дн." */}
      <View style={[s.cover, { backgroundColor: chip.bg, borderRadius: size.radiusPill }]}>
        <Text style={[s.coverLine, text.num, { color: chip.fg }]}>
          {fill(daysTemplate, { n: row.days })}
        </Text>
      </View>
    </View>
  );
}

/* ============================================================
   The barcode screen lives next door

   `./scan.tsx` — it is a camera, a lookup and a count sheet, and folding three
   hundred lines of viewfinder into the file that also draws receiving and stock
   cover would make the one screen with a device permission the hardest one to
   find. `more/[screen].tsx` imports it directly.
   ============================================================ */

const s = StyleSheet.create({
  page: { paddingHorizontal: 18, paddingTop: size.sp4, paddingBottom: DOCK_HEIGHT + size.sp6 },
  /* `padding:15px 16px` — `Panel` supplies the 15. */
  card: { marginBottom: 10, paddingHorizontal: 16 },
  head: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 10 },
  title: { ...sans(600) },
  main: { flex: 1, minWidth: 0 },
  /* Every meta line on these three screens is `--text-2xs`, not `--text-xs`. */
  meta: { ...sans(400), fontSize: size.text2xs, lineHeight: Math.round(size.text2xs * 1.45) },
  caps: {
    ...sans(600),
    fontSize: size.text2xs,
    lineHeight: Math.round(size.text2xs * 1.25),
    letterSpacing: tracking(raw.trackingCaps, size.text2xs),
    textTransform: 'uppercase',
    marginTop: 20,
    marginBottom: 9,
  },
  chip: { paddingHorizontal: 8, paddingVertical: 3, flexShrink: 0 },
  chipLine: { ...sans(600), fontSize: size.text3xs, lineHeight: Math.round(size.text3xs * 1.25) },
  money: { flexDirection: 'row', alignItems: 'baseline', gap: 14, marginTop: 8 },
  amount: { ...display(700), fontSize: size.textLg, lineHeight: Math.round(size.textLg * 1.15) },
  note: { marginTop: 5, lineHeight: 17 },
  accept: { marginTop: 12 },
  save: { marginTop: 18 },
  scanCta: {
    height: 52,
    marginTop: 14,
    borderWidth: 1,
    borderStyle: 'dashed',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 9,
  },
  scanLine: { ...sans(600) },
  done: { marginTop: 12, paddingVertical: 11, alignItems: 'center' },
  doneLine: { ...sans(600) },
  countRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 0 },
  step: {
    width: 36,
    height: 36,
    borderWidth: 1,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepGlyph: { ...sans(600), fontSize: 17, lineHeight: 17 },
  qty: {
    ...display(700),
    fontSize: size.textLg,
    width: 46,
    height: 36,
    padding: 0,
    textAlign: 'center',
  },
  off: { opacity: 0.45 },
  stockRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    minHeight: 44,
  },
  cover: { paddingHorizontal: 9, paddingVertical: 4, flexShrink: 0 },
  coverLine: { ...sans(700), fontSize: size.text2xs, lineHeight: Math.round(size.text2xs * 1.25) },
  rule: { height: 1 },
});
