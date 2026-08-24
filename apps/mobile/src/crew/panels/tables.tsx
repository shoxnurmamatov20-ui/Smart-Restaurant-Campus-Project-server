import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';

import { useWaiterFloor } from '../live';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { copy, TABLE_STATE, TABLES_COPY } from '@restaurant/surfaces/crew/copy';
import {
  MINUTE_WORD,
  say,
  WAITER_SHIFT,
  type CrewRole,
  type Lang,
  type MyTable,
  type TableState,
} from '@restaurant/surfaces/crew/data';

import { som } from '../../lib/money';
import { useShadows, useTheme } from '../../lib/theme-context';
import { raw, size } from '../../theme';
import { sans, text, tracking } from '../../type';
import { Empty, PRESSED } from '../../ui/primitives';
import { Hero, Note } from '../bits';
import { DOCK_HEIGHT } from '../chrome';

/**
 * The four table states, exactly as the design's own `TMETA` writes them.
 *
 * `Smart Restaurant Xodimlar ilovasi.dc.html:1576–1581`. A table card is
 * **tinted**, not white-on-a-grey-rule: every state carries its own background,
 * border and word colour, and this grid drew all four as `surface`/`border`, so
 * a floor with two occupied tables, one waiting to pay and one free read as a
 * single flat sheet. The two that are easy to get backwards are the last two —
 * *free* is `--fg-subtle` (an empty table is not good news in green) and
 * *reserved* is `--brand-700` on a white card with a `--brand-300` edge.
 */
const stateLook = (
  c: ReturnType<typeof useTheme>,
): Record<TableState, { bg: string; border: string; fg: string }> => ({
  occupied: { bg: c.brand50, border: c.brand200, fg: c.brand700 },
  'awaiting-payment': { bg: c.warning50, border: c.warning500, fg: c.warning700 },
  free: { bg: c.surface, border: c.border, fg: c.fgSubtle },
  reserved: { bg: c.surface, border: c.brand300, fg: c.brand700 },
});

/**
 * The six tables that are this waiter's problem.
 *
 * **Amounts are masked until asked for**, which is the design's decision and the
 * right one: this phone is held at a table with four guests looking at it, and
 * the running total of the next table along is nobody's business. The toggle is
 * a per-glance thing rather than a setting — it resets with the screen, so it
 * cannot be left on by the person who had the handset before.
 *
 * The zone chips filter and nothing else. `zone` is deliberately an open string
 * — a live floor answers with hall ids and the venue's own room names, and a
 * union of three would have compiled beautifully and dropped every fourth room.
 */
export function TablesPanel({ lang, role }: { lang: Lang; role: CrewRole }) {
  const c = useTheme();
  const sh = useShadows();
  const t = copy(TABLES_COPY, lang);
  const states = copy(TABLE_STATE, lang);
  const router = useRouter();

  const [zone, setZone] = useState<string>('all');
  const [shown, setShown] = useState(false);

  /*
   * Live from `tables/tables` + `orders/orders`, through the same `floorFrom()`
   * the web build uses; the fixture stands in until the answer lands or when
   * the server refuses, and the screen says so out loud — see `demoFloor`.
   */
  const floor = useWaiterFloor(lang);
  const all = floor.data.tables;
  const zones = floor.data.zones;

  const tables = useMemo(
    () => (zone === 'all' ? all : all.filter((table) => table.zone === zone)),
    [zone, all],
  );

  const zoneName = zones.find((chip) => chip.key === zone);

  /*
   * The first free table is where "take an order" starts. There is no picker
   * screen and there should not be: choosing a table *is* this screen, which is
   * why the More menu's own "take an order" row links here rather than to a
   * second list somebody would have to keep in step by hand.
   */
  const free = all.find((table) => table.state === 'free');

  return (
    <FlatList
      data={tables}
      keyExtractor={(table) => table.id}
      numColumns={2}
      columnWrapperStyle={s.pair}
      contentContainerStyle={s.page}
      showsVerticalScrollIndicator={false}
      ListHeaderComponent={
        <View>
          {floor.live ? null : (
            /* A waiter walking to table 12 because a demo said somebody is
               sitting there is worse than a screen that admits it knows nothing. */
            <Pressable onPress={floor.reload} accessibilityRole="button" style={s.demo}>
              <Text style={[text.caption, { color: c.warning700 }]}>
                {t.demoFloor}
                {floor.problem === null ? '' : ` · ${floor.problem}`}
              </Text>
            </Pressable>
          )}
          <Hero
            label={say(WAITER_SHIFT.label, lang)}
            value={som(WAITER_SHIFT.sales, lang, false)}
            stats={WAITER_SHIFT.stats.map((stat) => ({
              value: stat.value,
              label: say(stat.label, lang),
            }))}
          />

          <FlatList
            horizontal
            showsHorizontalScrollIndicator={false}
            style={s.chipRail}
            contentContainerStyle={s.chips}
            data={zones}
            keyExtractor={(chip) => chip.key}
            renderItem={({ item }) => {
              const on = item.key === zone;

              return (
                <Pressable
                  accessibilityRole="button"
                  accessibilityState={{ selected: on }}
                  onPress={() => setZone(item.key)}
                  style={({ pressed }) => [
                    s.chip,
                    {
                      backgroundColor: on ? c.brand500 : c.surface,
                      borderColor: on ? c.brand500 : c.border,
                      borderRadius: size.radiusPill,
                    },
                    pressed && PRESSED,
                  ]}
                >
                  <Text style={[text.caption, s.chipLine, { color: on ? c.n0 : c.fgMuted }]}>
                    {say(item.label, lang)}
                  </Text>
                </Pressable>
              );
            }}
          />

          <View style={s.bar}>
            {/*
             * Drawn here rather than with `SectionLabel`, because the design
             * writes this one at `--text-2xs` (11) inside a baseline row with
             * `margin-bottom:9px` — not the 10px label with 24/8 of its own
             * margin that sits above a list. `…dc.html:342`.
             */}
            <Text style={[s.zoneName, { color: c.fgSubtle }]}>
              {zoneName === undefined ? t.allZones : say(zoneName.label, lang)}
            </Text>

            {/*
             * `height:26px;padding:0 10px;font-size:10px` — the design's own
             * pill (…dc.html:343). It was 44 tall and it dwarfed the caps label
             * beside it; the 44pt target survives as hit slop, which is what
             * hit slop is for.
             */}
            <Pressable
              accessibilityRole="button"
              hitSlop={{ top: 9, bottom: 9, left: 8, right: 8 }}
              onPress={() => setShown((current) => !current)}
              style={({ pressed }) => [
                s.mask,
                {
                  backgroundColor: c.surface,
                  borderColor: c.border,
                  borderRadius: size.radiusPill,
                },
                pressed && PRESSED,
              ]}
            >
              <Text style={[s.maskLine, { color: c.fgSubtle }]}>
                {shown ? t.hideAmounts : t.showAmounts}
              </Text>
            </Pressable>
          </View>
        </View>
      }
      ListEmptyComponent={<Empty title={t.empty} />}
      renderItem={({ item }) => (
        <TableCard
          table={item}
          lang={lang}
          shown={shown}
          state={states[item.state]}
          seats={t.seats}
          freeFor={t.freeFor}
          onPress={() => router.push(`/crew/${role}/table/${item.id}`)}
        />
      )}
      ListFooterComponent={
        <View style={s.footer}>
          {/*
           * Drawn by hand rather than through `Button`: the design's CTA is a
           * 17×17 plus at `stroke-width:2.1` with `gap:8` and `--shadow-md`
           * (…dc.html:359–362), and `Button` puts its children inside a
           * `<Text>`, where an `<Svg>` has nowhere to sit.
           */}
          <Pressable
            accessibilityRole="button"
            disabled={free === undefined}
            onPress={() => {
              if (free !== undefined) router.push(`/crew/${role}/table/${free.id}/order`);
            }}
            style={({ pressed }) => [
              s.cta,
              { backgroundColor: c.brand500, borderRadius: size.radiusMd, boxShadow: sh.md },
              pressed && PRESSED,
              free === undefined && s.ctaOff,
            ]}
          >
            <Svg width={17} height={17} viewBox="0 0 24 24" fill="none">
              <Path d="M12 5.5v13" stroke={c.n0} strokeWidth={2.1} strokeLinecap="round" />
              <Path d="M5.5 12h13" stroke={c.n0} strokeWidth={2.1} strokeLinecap="round" />
            </Svg>
            <Text style={[text.button, { color: c.n0 }]} numberOfLines={1}>
              {t.takeOrder}
            </Text>
          </Pressable>

          {/*
           * The design's tables tab ends at the CTA — no footer sentence — so
           * the "amounts are masked" line is gone; the toggle above says the
           * same thing in two words and says it where the reader can act on it.
           * This one stays because it is not decoration: it is the only reason
           * a dead button is dead.
           */}
          {free === undefined ? <Note>{t.noFreeTable}</Note> : null}
        </View>
      }
    />
  );
}

function TableCard({
  table,
  lang,
  shown,
  state,
  seats,
  freeFor,
  onPress,
}: {
  table: MyTable;
  lang: Lang;
  shown: boolean;
  state: string;
  seats: string;
  freeFor: string;
  onPress: () => void;
}) {
  const c = useTheme();
  const look = stateLook(c)[table.state];

  /*
   * `total ? (showAmt ? f(total) : "••••••") : "—"` — the design's own line
   * (…dc.html:1645). A free or reserved table has no bill, so its money slot is
   * an em dash and the "free for 18 min" phrase belongs on the line *under* it;
   * the two were transposed, which left the `since` slot empty on every free
   * table and put a duration where the reader looks for a figure.
   *
   * A masked total is six bullets, not a blank: the row keeps its height and
   * the reader can see there *is* a figure, which is what makes the toggle
   * obviously the way to read it.
   */
  const money = table.total === 0 ? '—' : shown ? som(table.total, lang, false) : '••••••';

  const since =
    table.state === 'reserved'
      ? `${table.bookedAt} · ${table.bookedBy}`
      : table.state === 'free'
        ? `${freeFor} ${table.minutes} ${say(MINUTE_WORD, lang)}`
        : `${table.minutes} ${say(MINUTE_WORD, lang)}`;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${table.number} · ${state}`}
      onPress={onPress}
      style={({ pressed }) => [
        s.card,
        { backgroundColor: look.bg, borderColor: look.border, borderRadius: size.radiusLg },
        pressed && PRESSED,
      ]}
    >
      <View style={s.cardHead}>
        <Text style={[text.title, { color: c.fg }]}>{table.number}</Text>
        <Text style={[s.meta, text.num, { color: c.fgSubtle }]}>
          {table.seats} {seats}
        </Text>
      </View>

      <Text style={[s.state, { color: look.fg }]} numberOfLines={1}>
        {state}
      </Text>

      <Text style={[text.small, text.num, s.money, { color: c.fg }]}>{money}</Text>

      <Text style={[s.meta, text.num, s.since, { color: c.fgSubtle }]} numberOfLines={1}>
        {since}
      </Text>
    </Pressable>
  );
}

const s = StyleSheet.create({
  demo: { minHeight: 44, justifyContent: 'center', paddingVertical: 6 },
  page: { paddingHorizontal: 18, paddingTop: size.sp4, paddingBottom: DOCK_HEIGHT + size.sp6 },
  pair: { gap: 10, marginBottom: 10 },
  /* `margin-bottom:12px` on the rail, under the hero's own 14 — …dc.html:336. */
  chipRail: { flexGrow: 0, marginTop: 14, marginBottom: 12 },
  chips: { gap: 7, paddingBottom: 2 },
  chip: {
    height: 32,
    paddingHorizontal: 13,
    justifyContent: 'center',
    borderWidth: 1,
  },
  chipLine: { ...sans(600) },
  bar: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: 10,
    marginBottom: 9,
  },
  zoneName: {
    ...sans(600),
    fontSize: size.text2xs,
    lineHeight: Math.round(size.text2xs * 1.25),
    letterSpacing: tracking(raw.trackingCaps, size.text2xs),
    textTransform: 'uppercase',
  },
  mask: { height: 26, paddingHorizontal: 10, justifyContent: 'center', borderWidth: 1 },
  maskLine: { ...sans(600), fontSize: size.text3xs, lineHeight: Math.round(size.text3xs * 1.25) },
  /* `padding:14px 15px` — the drawing writes two numbers, not one. */
  card: { flex: 1, paddingVertical: 14, paddingHorizontal: 15, borderWidth: 1, minHeight: 44 },
  cardHead: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  /* Every meta line on this card is `--text-2xs`, not `--text-xs`. */
  meta: { ...sans(400), fontSize: size.text2xs, lineHeight: Math.round(size.text2xs * 1.45) },
  state: {
    ...sans(600),
    fontSize: size.text2xs,
    lineHeight: Math.round(size.text2xs * 1.45),
    marginTop: 6,
  },
  money: { ...sans(600), marginTop: 6 },
  since: { marginTop: 2 },
  footer: { marginTop: 14 },
  cta: {
    height: 50,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: size.sp4,
  },
  ctaOff: { opacity: 0.45 },
});
