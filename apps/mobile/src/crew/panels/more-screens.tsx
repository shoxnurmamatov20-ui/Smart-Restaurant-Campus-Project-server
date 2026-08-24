import type { ReactNode } from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';

import { copy, fill, MORE_COPY } from '@restaurant/surfaces/crew/copy';
import { say, type Lang, type Trilingual } from '@restaurant/surfaces/crew/data';
import { moreCopy } from '@restaurant/surfaces/crew/more-copy';
import {
  MORE_BOOKINGS,
  MORE_BRANCHES,
  MORE_CASH_FLOW,
  MORE_EXPIRY,
  MORE_PEOPLE,
  MORE_PNL,
  MORE_RISK,
  MORE_ROTA,
  MORE_SHIFT_KPIS,
  MORE_STATIONS,
  type CrewTone,
} from '@restaurant/surfaces/crew/more-data';

import { groupDigits } from '../../lib/money';
import { useTheme } from '../../lib/theme-context';
import { raw, size } from '../../theme';
import { display, displayAt, sansAt, text, tracking, type DisplayWeight } from '../../type';
import { Chip, Note, Panel, SectionLabel, TileGrid, toneColour } from '../bits';
import { useStaffToday } from '../live';
import { useCrewSkin } from '../palette';

/**
 * The ten read-only screens the More menu names.
 *
 * `more-data.ts` carries their structure — a tone, a bar width, whether a row is
 * bold — and `more-copy.ts` their words, index-aligned, which is why every one
 * of these is a `map` over the structure reading the copy at the same position
 * rather than a list of hand-paired rows. `more-fidelity.test.ts` on the web
 * side is what keeps the two lengths equal.
 *
 * They are read-only because they are reports. The four that ask for something —
 * waste, a purchase order, a shift swap, handing an order back — are forms and
 * live in `more-forms.tsx`; the split is between a screen that tells you
 * something and one that takes an answer.
 *
 * ---------------------------------------------------------------------------
 * Every measurement below is read out of `Smart Restaurant Xodimlar
 * ilovasi.dc.html`, and the line is cited where it is not obvious. The design
 * writes literals — `padding:13px 16px`, `height:4px`, `font-size:9px` — and a
 * rounded step off the `size.*` scale is a different drawing, not the same one
 * approximated. Where a number here looks arbitrary it is because the design
 * says that number.
 */

/**
 * `padding:16px 18px 108px` on the scroll body — dc.html:141.
 *
 * 18, not `size.sp5` (20). The staff app's gutter is 18 everywhere in that file
 * including its header (`padding:8px 18px 12px`, dc.html:126), and two points of
 * drift on a phone reads as a heading that does not line up with its list.
 */
const page = (extra = 0) => ({
  paddingHorizontal: 18,
  paddingBottom: size.sp9 + extra,
});

/* ------------------------------------------------------- what the catalogue lacks */

/**
 * Three blocks of the design that `more-copy.ts` never transcribed.
 *
 * The people strip (dc.html:2418), the loss-prevention tiles (dc.html:2424) and
 * the branch detail's four KPIs, its hourly chart and its closing sentence
 * (dc.html:2263–2281) are missing from the catalogue, so the screens that need
 * them were simply drawn without them — a branch opened on a bare figure, and
 * loss prevention started at a section label with nothing above it.
 *
 * This belongs in `more-copy.ts` beside the rest and should move there the next
 * time that file is open; it sits here because this pass may touch one file and
 * `packages/surfaces` is shared with the web build. Nothing below is written by
 * hand — every string is the design's own `P(uz, ru, en)` triple, copied across.
 */
const EXTRA: {
  peopleKpis: readonly { label: Trilingual; value: string }[];
  controlKpis: readonly { label: Trilingual; value: string; delta: Trilingual; tone: CrewTone }[];
  branch: {
    revNote: Trilingual;
    orders: Trilingual;
    ordersDelta: Trilingual;
    ticket: Trilingual;
    margin: Trilingual;
    marginDelta: Trilingual;
    staff: Trilingual;
    staffDelta: Trilingual;
    note: Trilingual;
  };
} = {
  peopleKpis: [
    { label: { uz: 'Smenada', ru: 'На смене', en: 'On shift' }, value: '14' },
    { label: { uz: 'Kechikdi', ru: 'Опоздали', en: 'Late' }, value: '1' },
    { label: { uz: 'Kelmadi', ru: 'Не пришли', en: 'No show' }, value: '1' },
  ],
  controlKpis: [
    {
      label: { uz: 'Bekor qilingan chek', ru: 'Отменённые чеки', en: 'Voided tickets' },
      value: '12',
      delta: { uz: '1.8% cheklardan', ru: '1.8% от чеков', en: '1.8% of tickets' },
      tone: 'danger',
    },
    {
      label: { uz: 'Yuborilgandan keyin', ru: 'После отправки', en: 'After firing' },
      value: '7',
      delta: { uz: 'pozitsiya o’chirilgan', ru: 'позиций удалено', en: 'lines deleted' },
      tone: 'danger',
    },
    {
      label: { uz: 'Chegirmalar', ru: 'Скидки', en: 'Discounts' },
      value: '2.4 mln',
      delta: { uz: '2.1% tushumdan', ru: '2.1% от выручки', en: '2.1% of revenue' },
      tone: 'warning',
    },
    {
      label: { uz: 'Kassa farqi', ru: 'Расхождение кассы', en: 'Cash variance' },
      value: '−32 000',
      delta: { uz: 'Chilonzor · kechki', ru: 'Чиланзар · вечер', en: 'Chilonzor · evening' },
      tone: 'danger',
    },
  ],
  branch: {
    revNote: {
      uz: 'so’m · bugun · {n} buyurtma',
      ru: 'сум · сегодня · {n} заказов',
      en: 'so’m · today · {n} orders',
    },
    orders: { uz: 'Buyurtmalar', ru: 'Заказы', en: 'Orders' },
    ordersDelta: { uz: 'bugun', ru: 'сегодня', en: 'today' },
    ticket: { uz: 'O’rtacha chek', ru: 'Средний чек', en: 'Average ticket' },
    margin: { uz: 'Yalpi marja', ru: 'Валовая маржа', en: 'Gross margin' },
    marginDelta: { uz: 'me’yor 60%', ru: 'норма 60%', en: 'target 60%' },
    staff: { uz: 'Xodimlar', ru: 'Сотрудники', en: 'Staff' },
    staffDelta: { uz: 'smenada', ru: 'на смене', en: 'on shift' },
    note: {
      uz: 'Eng band soat 19:00–20:00. Shu oynada ikkinchi oshpaz qo’yilsa, kutish vaqti qisqaradi.',
      ru: 'Пик 19:00–20:00. Второй повар в это окно сократит время ожидания.',
      en: 'Peak is 19:00–20:00. A second cook in that window shortens the wait.',
    },
  },
};

/**
 * Eight hours of the trading day — dc.html:2277.
 *
 * A fixture, and the design's own: the same eight hours are drawn for every
 * branch. `96` is the tallest of them and `74` the pixel height the design
 * gives that tallest bar, which is why both numbers are here rather than a
 * ratio somebody would later "simplify" into a different chart.
 */
const BRANCH_HOURS: readonly { hour: number; orders: number }[] = [
  { hour: 12, orders: 42 },
  { hour: 13, orders: 61 },
  { hour: 14, orders: 38 },
  { hour: 15, orders: 22 },
  { hour: 18, orders: 55 },
  { hour: 19, orders: 96 },
  { hour: 20, orders: 88 },
  { hour: 21, orders: 54 },
];

const HOURS_PEAK = 96;
const HOURS_TALLEST = 74;

/** The bar's track inside the hero — `rgba(255,255,255,.16)`, dc.html:890. */
const HERO_TRACK = 'rgba(255,255,255,.16)';

/**
 * `displayAt` with the design's *other* tracking.
 *
 * `displayAt` takes the type of its `track` parameter from its own default and
 * `theme.raw` is `as const`, so the signature accepts `--tracking-tight` and
 * nothing else. The design sets `--tracking-snug` on the P&L figures
 * (dc.html:502), so those are composed here rather than by widening a signature
 * in a file this pass may not touch.
 */
const displaySnug = (weight: DisplayWeight, at: number, line: number) => ({
  ...display(weight),
  fontSize: at,
  lineHeight: Math.round(at * line),
  letterSpacing: tracking(raw.trackingSnug, at),
});

/* --------------------------------------------------------------- the pieces */

/**
 * The delta line under a KPI figure — `k.c` in the design.
 *
 * `toneColour('neutral')` is `--fg-muted`, a dark slate; the design writes
 * `--fg-subtle` for a delta that is merely a fact ("6 tables", "since 12:00")
 * and saves colour for the one that is news. Read at 10px the two greys are the
 * difference between a caption and a fifth thing shouting.
 */
function deltaColour(tone: CrewTone | undefined, c: ReturnType<typeof useTheme>): string {
  return tone === undefined || tone === 'neutral' ? c.fgSubtle : toneColour(tone, c);
}

/**
 * The dark card three of these screens open on — dc.html:677, 718, 886.
 *
 * Not `bits.Hero`: that one is the *today* tab's card — a delta chip, a
 * sparkline, a row of stats under a rule — and it sets its figure at
 * `text.display` (30). These three draw a plainer card whose whole job is one
 * `--text-4xl` (38) number at `line-height:1`, and the branch one carries a
 * progress bar inside it. `bits.tsx` is another pass's file, so the second
 * shape lives here rather than as a fifth optional prop over there.
 *
 * What it replaced was not a darker version of itself but a *light* block —
 * `bg-subtle` with `text.display` on it. The design draws these three on
 * `--hero-bg` in both appearances, which is the whole reason `palette.ts`
 * exists.
 */
function HeroCard({
  label,
  value,
  note,
  children,
}: {
  label: string;
  value: string;
  note?: string;
  children?: ReactNode;
}) {
  const skin = useCrewSkin();

  return (
    <View style={[s.hero, { backgroundColor: skin.heroBg }]}>
      <Text style={[s.heroLabel, { color: skin.heroDim }]}>{label}</Text>
      <Text style={[s.heroValue, text.num, { color: skin.heroFg }]}>{value}</Text>

      {note === undefined ? null : (
        <Text style={[s.heroNote, text.num, { color: skin.heroDim }]}>{note}</Text>
      )}

      {children}
    </View>
  );
}

/**
 * The bordered KPI tile — `border:1px solid var(--border);border-radius:
 * var(--radius-lg);padding:14px 15px` (dc.html:546, 684, 725, 896).
 *
 * `bits.Tile` is the filled `bg-subtle` box, and the design draws that one in
 * exactly one place: the today tab's grid (dc.html:163). Every KPI grid hung off
 * the More menu is an outline on `surface`. Four screens here were using the
 * filled tile, so a report read as a set of grey chips instead of a set of
 * cards.
 */
function OutlineTile({
  label,
  value,
  delta,
  valueTone,
  deltaTone,
}: {
  label: string;
  value: string;
  delta?: string;
  /** Loss prevention colours the *figure*; everywhere else colours the delta. */
  valueTone?: CrewTone;
  deltaTone?: CrewTone;
}) {
  const c = useTheme();

  return (
    <View style={[s.tile, { backgroundColor: c.surface, borderColor: c.border }]}>
      <Text style={[s.tileLabel, { color: c.fgSubtle }]} numberOfLines={1}>
        {label}
      </Text>

      <Text
        style={[
          text.title,
          text.num,
          s.tileValue,
          { color: valueTone === undefined ? c.fg : toneColour(valueTone, c) },
        ]}
        numberOfLines={1}
      >
        {value}
      </Text>

      {delta === undefined ? null : (
        <Text
          style={[
            deltaTone === undefined ? s.tileDelta : s.tileDeltaLoud,
            { color: deltaColour(deltaTone, c) },
          ]}
          numberOfLines={1}
        >
          {delta}
        </Text>
      )}
    </View>
  );
}

/**
 * The 4px round bar — `height:4px;border-radius:999px` on `--bg-muted`.
 *
 * `bits.Bar` is 3px with a 2px radius and a fixed 11px of air above it; the
 * design draws four pixels, a full pill, and a different gap on each of the
 * three screens that use it (7 on a risk row, 8 on a station, 14 inside the
 * branch hero) — which is why `top` is a parameter and not a constant.
 */
function ThickBar({
  percent,
  colour,
  track,
  top,
}: {
  percent: number;
  colour: string;
  track: string;
  top: number;
}) {
  return (
    <View style={[s.track, { backgroundColor: track, marginTop: top }]}>
      <View
        style={[
          s.fill,
          { width: `${Math.max(0, Math.min(100, percent))}%`, backgroundColor: colour },
        ]}
      />
    </View>
  );
}

/**
 * A column chart: bars on a fixed band with a 9px label under each.
 *
 * Both charts in this file are the same drawing at two sizes — cash flow is
 * `height:96px;gap:7px` with a 6px gap to its label (dc.html:509), the branch's
 * hours are `height:88px;gap:5px` with 5 (dc.html:903) — and both round only the
 * two top corners, because a bar sitting on an axis has no bottom corners to
 * round.
 */
function Columns({
  bars,
  height,
  gap,
  cellGap,
  pad = 0,
  tabular = false,
}: {
  bars: readonly { key: string; height: number; colour: string; label: string }[];
  height: number;
  gap: number;
  cellGap: number;
  pad?: number;
  tabular?: boolean;
}) {
  const c = useTheme();

  return (
    <View style={[s.chart, { height, gap, paddingHorizontal: pad }]}>
      {bars.map((bar) => (
        <View key={bar.key} style={[s.column, { gap: cellGap }]}>
          <View style={[s.columnBar, { height: bar.height, backgroundColor: bar.colour }]} />
          <Text style={[s.columnLabel, tabular ? text.num : null, { color: c.fgSubtle }]}>
            {bar.label}
          </Text>
        </View>
      ))}
    </View>
  );
}

/**
 * The 32px disc with two letters in it, in one of two tints.
 *
 * `bits.Avatar` is always brand-tinted. The design tints only the top two
 * sellers (`avBg:brand-100 / avFg:brand-700`) and leaves the rest on
 * `bg-muted / fg-muted` (dc.html:1791) — with every disc blue the ranking the
 * screen exists to show was drawn flat.
 */
function PersonDisc({ initials, top }: { initials: string; top: boolean }) {
  const c = useTheme();

  return (
    <View style={[s.disc, { backgroundColor: top ? c.brand100 : c.bgMuted }]}>
      <Text style={[s.discLine, { color: top ? c.brand700 : c.fgMuted }]}>{initials}</Text>
    </View>
  );
}

/* ------------------------------------------------------------ owner: P&L */

export function FinanceScreen({ lang }: { lang: Lang }) {
  const c = useTheme();
  const t = moreCopy(lang);

  const last = MORE_PNL.length - 1;

  return (
    <FlatList
      data={MORE_PNL}
      keyExtractor={(_, index) => `pnl${index}`}
      contentContainerStyle={page()}
      showsVerticalScrollIndicator={false}
      renderItem={({ item, index }) => {
        const line = t.pnl[index];

        if (line === undefined) return null;

        /*
         * The ladder is one bordered card with its rows ruled off inside it
         * (dc.html:499) — it used to be bare rows on the page, and a subtotal
         * was marked with a rule above it instead of the design's tint.
         *
         * A `FlatList` cannot put a border round its own items, so the card is
         * assembled row by row: sides on every row, the outer colour and a
         * radius on the first and last, `--divider` on the rules between. That
         * is what `overflow:hidden` on the design's card resolves to once the
         * rows are the only thing there is to draw.
         */
        const edge = {
          borderLeftWidth: 1,
          borderRightWidth: 1,
          borderLeftColor: c.border,
          borderRightColor: c.border,
          borderBottomWidth: 1,
          borderBottomColor: index === last ? c.border : c.divider,
          ...(index === 0
            ? {
                borderTopWidth: 1,
                borderTopColor: c.border,
                borderTopLeftRadius: size.radiusLg,
                borderTopRightRadius: size.radiusLg,
              }
            : null),
          ...(index === last
            ? { borderBottomLeftRadius: size.radiusLg, borderBottomRightRadius: size.radiusLg }
            : null),
        };

        /*
         * Both halves of a row take the same colour, and only the net-profit
         * row is green (`--success-700`). The value used to be painted by tone,
         * and `toneColour('neutral')` is `--fg-muted` — so revenue, cost of
         * goods and every expense were drawn in the grey the design reserves
         * for captions, on the one screen where the figures are the content.
         */
        const fg = item.tone === 'success' ? c.success700 : c.fg;

        return (
          <View
            style={[
              s.ladder,
              edge,
              { backgroundColor: item.strong ? c.bgSubtle : c.surface },
              item.strong ? s.ladderClip : null,
            ]}
          >
            <Text style={[item.strong ? s.rowName : s.rowSoft, { color: fg }]} numberOfLines={1}>
              {line.label}
            </Text>
            <Text style={[item.strong ? s.pnlBig : s.pnlValue, text.num, { color: fg }]}>
              {line.value}
            </Text>
          </View>
        );
      }}
      ListFooterComponent={
        <View>
          <Note>{t.text.pnlNote}</Note>

          <SectionLabel>{t.text.cashFlowLbl}</SectionLabel>

          {/*
           * The design's own pixel heights (48 … 76), not a proportion: the
           * band is 96 tall and the tallest bar 76, and the twenty points left
           * over are the label and its gap.
           *
           * The last month is `--brand-500` and the five before it
           * `--brand-200` (dc.html:1783). `more-data.ts` calls all six `brand`,
           * which resolves to one colour — and a cash-flow chart whose current
           * month is not picked out is six bars saying nothing in particular.
           */}
          <Columns
            height={96}
            gap={7}
            cellGap={6}
            pad={2}
            bars={MORE_CASH_FLOW.map((bar, index) => ({
              key: t.cashFlow[index] ?? String(index),
              height: Number.parseInt(bar.height, 10),
              colour: index === MORE_CASH_FLOW.length - 1 ? c.brand500 : c.brand200,
              label: t.cashFlow[index] ?? '',
            }))}
          />
        </View>
      }
    />
  );
}

/* -------------------------------------------------------- owner: the team */

export function PeopleScreen({ lang }: { lang: Lang }) {
  const c = useTheme();
  const t = moreCopy(lang);

  return (
    <FlatList
      data={MORE_PEOPLE}
      keyExtractor={(_, index) => `p${index}`}
      contentContainerStyle={page()}
      showsVerticalScrollIndicator={false}
      /*
       * Three cells joined by a one-pixel gap over `--divider`, inside a single
       * bordered box (dc.html:520). The gap *is* the rule — there are no
       * borders between the cells, only the box's own background showing
       * through — which is why this is a row of three surfaces and not two
       * dividers.
       */
      ListHeaderComponent={
        <View style={[s.strip, { backgroundColor: c.divider, borderColor: c.border }]}>
          {EXTRA.peopleKpis.map((kpi) => (
            <View
              key={kpi.value + say(kpi.label, lang)}
              style={[s.stripCell, { backgroundColor: c.surface }]}
            >
              <Text style={[s.stripLabel, { color: c.fgSubtle }]} numberOfLines={1}>
                {say(kpi.label, lang)}
              </Text>
              <Text style={[s.figureLg, text.num, s.stripValue, { color: c.fg }]}>{kpi.value}</Text>
            </View>
          ))}
        </View>
      }
      renderItem={({ item, index }) => {
        const row = t.people[index];

        if (row === undefined) return null;

        return (
          <View style={[s.person, { borderBottomColor: c.divider }]}>
            {/* The top two are the only ones the design marks, and it marks
                them on the disc — `brand-100` behind `brand-700` initials — not
                by setting the figure heavier. Every sales figure on this screen
                is 600. */}
            <PersonDisc initials={row.initials} top={item.top} />

            <View style={s.main}>
              <Text style={[s.rowName, { color: c.fg }]} numberOfLines={1}>
                {row.name}
              </Text>
              <Text style={[s.meta, s.metaGap, { color: c.fgSubtle }]} numberOfLines={1}>
                {row.role}
              </Text>
            </View>

            <View style={s.figures}>
              <Text style={[s.rowName, text.num, { color: c.fg }]}>{row.sales}</Text>
              <Text style={[s.meta, s.metaGap, text.num, { color: c.fgSubtle }]}>{row.meta}</Text>
            </View>
          </View>
        );
      }}
    />
  );
}

/* ------------------------------------------------- owner: loss prevention */

export function ControlScreen({ lang }: { lang: Lang }) {
  const c = useTheme();
  const t = moreCopy(lang);

  return (
    <FlatList
      data={MORE_RISK}
      keyExtractor={(_, index) => `r${index}`}
      contentContainerStyle={page()}
      showsVerticalScrollIndicator={false}
      ListHeaderComponent={
        <View>
          {/* Four bordered tiles above the list (dc.html:544). The screen used
              to start at the section label, so the manager who opened "loss
              prevention" was shown four names and none of the four numbers the
              names are supposed to explain. */}
          <View style={s.kpiGrid}>
            <TileGrid>
              {EXTRA.controlKpis.map((kpi) => (
                <OutlineTile
                  key={kpi.value + say(kpi.label, lang)}
                  label={say(kpi.label, lang)}
                  value={kpi.value}
                  valueTone={kpi.tone}
                  delta={say(kpi.delta, lang)}
                />
              ))}
            </TileGrid>
          </View>

          <SectionLabel>{t.text.riskLbl}</SectionLabel>
        </View>
      }
      renderItem={({ item, index }) => {
        const row = t.risk[index];

        if (row === undefined) return null;

        /*
         * A flat divider row, not a card (dc.html:555). Four bordered panels
         * drew four boxes of equal weight; the design ranks people down a
         * single column and lets the bars do the comparing, which only works
         * when nothing boxes them apart.
         */
        return (
          <View style={[s.riskRow, { borderBottomColor: c.divider }]}>
            <View style={s.head}>
              <Text style={[s.rowName, { color: c.fg }]} numberOfLines={1}>
                {row.name}
              </Text>
              {/* `--text-xs` at 700 — a score, not body copy. It was 13px at
                  400, which is the weight of the sentence underneath it. */}
              <Text style={[s.score, text.num, { color: toneColour(item.tone, c) }]}>
                {row.score}
              </Text>
            </View>

            <ThickBar
              percent={Number.parseInt(item.width, 10)}
              colour={toneColour(item.tone, c)}
              track={c.bgMuted}
              top={7}
            />

            <Text style={[s.meta, s.riskMeta, { color: c.fgSubtle }]}>{row.meta}</Text>
          </View>
        );
      }}
      /* An accusation is what this screen must not become — hence the sentence. */
      ListFooterComponent={<Note>{t.text.riskNote}</Note>}
    />
  );
}

/* ------------------------------------------------------- manager: the rota */

export function RotaScreen({ lang }: { lang: Lang }) {
  const c = useTheme();
  const t = moreCopy(lang);

  return (
    <FlatList
      data={MORE_ROTA}
      keyExtractor={(_, index) => `rota${index}`}
      contentContainerStyle={page()}
      showsVerticalScrollIndicator={false}
      renderItem={({ item, index }) => {
        const row = t.rota[index];

        if (row === undefined) return null;

        return (
          <View style={[s.rotaRow, { borderBottomColor: c.divider }]}>
            {/* An 8×8 dot in the person's state colour opens the row
                (dc.html:589). Without it the state lived only in the chip on
                the far right, so a manager scanning six names down a column had
                to read to the end of each line to find the one who did not
                turn up. */}
            <View style={[s.dot, { backgroundColor: toneColour(item.tone, c) }]} />

            <View style={s.main}>
              <Text style={[s.rowName, { color: c.fg }]} numberOfLines={1}>
                {row.name}
              </Text>
              <Text style={[s.meta, s.metaGap, { color: c.fgSubtle }]} numberOfLines={1}>
                {row.shift}
              </Text>
            </View>

            <Chip tone={item.tone}>{row.state}</Chip>
          </View>
        );
      }}
      ListFooterComponent={<Note>{t.text.rotaNote}</Note>}
    />
  );
}

/* --------------------------------------------------- manager: the kitchen */

export function KitchenSpeedScreen({ lang }: { lang: Lang }) {
  const c = useTheme();
  const t = moreCopy(lang);

  return (
    <FlatList
      data={MORE_STATIONS}
      keyExtractor={(_, index) => `st${index}`}
      contentContainerStyle={page()}
      showsVerticalScrollIndicator={false}
      renderItem={({ item, index }) => {
        const row = t.stations[index];

        if (row === undefined) return null;

        /* A flat `padding:13px 0` divider row (dc.html:602), and the average is
           the row's headline: `--text-lg` in the display face at 700, in the
           station's own colour. It was 13px at 400 inside a card, which drew
           four equal boxes where the design draws one ranked list. */
        return (
          <View style={[s.stationRow, { borderBottomColor: c.divider }]}>
            <View style={s.head}>
              <Text style={[s.rowName, { color: c.fg }]} numberOfLines={1}>
                {row.name}
              </Text>
              <Text style={[s.figureLg, text.num, { color: toneColour(item.tone, c) }]}>
                {row.average}
              </Text>
            </View>

            <ThickBar
              percent={Number.parseInt(item.width, 10)}
              colour={toneColour(item.tone, c)}
              track={c.bgMuted}
              top={8}
            />

            <View style={s.between}>
              <Text style={[s.meta, { color: c.fgSubtle }]}>{row.load}</Text>
              <Text style={[s.meta, text.num, { color: c.fgSubtle }]}>{row.target}</Text>
            </View>
          </View>
        );
      }}
      ListFooterComponent={<Note>{t.text.stationNote}</Note>}
    />
  );
}

/* --------------------------------------------- storekeeper: expiry watch */

export function ExpiryScreen({ lang }: { lang: Lang }) {
  const c = useTheme();
  const t = moreCopy(lang);

  return (
    <FlatList
      data={MORE_EXPIRY}
      keyExtractor={(_, index) => `e${index}`}
      contentContainerStyle={page()}
      showsVerticalScrollIndicator={false}
      renderItem={({ item, index }) => {
        const row = t.expiry[index];

        if (row === undefined) return null;

        return (
          <View style={[s.expiryRow, { borderBottomColor: c.divider }]}>
            <View style={s.main}>
              <Text style={[s.rowName, { color: c.fg }]} numberOfLines={1}>
                {row.name}
              </Text>
              <Text style={[s.meta, s.metaGap, text.num, { color: c.fgSubtle }]}>{row.batch}</Text>
            </View>

            <Chip tone={item.tone}>{row.when}</Chip>
          </View>
        );
      }}
      ListFooterComponent={<Note>{t.text.expiryNote}</Note>}
    />
  );
}

/* ------------------------------------------------------- waiter: my shift */

export function MyShiftScreen({ lang }: { lang: Lang }) {
  const c = useTheme();
  const skin = useCrewSkin();
  const t = moreCopy(lang);

  /*
   * The one live figure on this screen, and the only one that is about the
   * person rather than about what they sold: their own rostered hours, whether
   * they are clocked in, and when they next work.
   *
   * Rendered only when it is real. Every other fallback in this app stands in a
   * recognisable sample — a floor, a queue — because a waiter mid-service is
   * better served by those than by a spinner. A rostered *time* is different:
   * it is a thing somebody plans an evening around, and a sample one would be
   * the single most harmful invented value in the app. So with no session the
   * line is simply not there.
   *
   * The sales figures above it stay fixtures: they are Orders' business and
   * there is no per-person aggregate to read yet.
   */
  const today = useStaffToday(lang);

  return (
    <FlatList
      data={t.shift.top}
      keyExtractor={(row) => row.name}
      contentContainerStyle={page()}
      showsVerticalScrollIndicator={false}
      ListHeaderComponent={
        <View>
          <HeroCard label={t.text.shiftSales} value={t.shift.sales} note={t.shift.salesNote}>
            {today.live && today.data.rostered !== null ? (
              /* Clock times and a duration, and no words: `10:00 – 19:00 ·
                 09:58 · 6:20` reads the same in all three languages, which is
                 why this line needs no entry in the catalogue. The clocked-in
                 time is dropped when there is none — a dangling separator is
                 how a reader decides a screen is broken.

                 On the dark card it takes `hero-dim` like every other line, and
                 a late clock-in takes `--danger-500` rather than 600: the
                 reason `palette.ts` gives for its mint green — a paper colour
                 goes out on #0F1320 — is true of the darker red too. */
              <Text
                style={[
                  s.meta,
                  s.shiftClock,
                  text.num,
                  { color: today.data.late ? c.danger500 : skin.heroDim },
                ]}
              >
                {[today.data.rostered, today.data.clockedInAt, today.data.worked]
                  .filter((part) => part !== null)
                  .join(' · ')}
                {today.data.next === null ? '' : ` → ${today.data.next}`}
              </Text>
            ) : null}
          </HeroCard>

          <TileGrid>
            {t.shift.kpis.map((kpi, index) => (
              <OutlineTile
                key={kpi.label}
                label={kpi.label}
                value={kpi.value}
                delta={kpi.note}
                deltaTone={MORE_SHIFT_KPIS[index]?.tone ?? 'neutral'}
              />
            ))}
          </TileGrid>

          <SectionLabel>{t.text.shiftTop}</SectionLabel>
        </View>
      }
      renderItem={({ item }) => (
        <View style={[s.logRow, { borderBottomColor: c.divider }]}>
          <Text style={[s.rowSoft, s.main, { color: c.fg }]} numberOfLines={1}>
            {item.name}
          </Text>
          <Text style={[s.rowName, text.num, { color: c.fg }]}>{item.quantity}</Text>
        </View>
      )}
      ListFooterComponent={<Note>{t.text.shiftNote}</Note>}
    />
  );
}

/* -------------------------------------------------- waiter: their bookings */

export function BookingsScreen({ lang }: { lang: Lang }) {
  const c = useTheme();
  const t = moreCopy(lang);

  return (
    <FlatList
      data={MORE_BOOKINGS}
      keyExtractor={(_, index) => `b${index}`}
      contentContainerStyle={page()}
      showsVerticalScrollIndicator={false}
      renderItem={({ item, index }) => {
        const row = t.bookings[index];

        if (row === undefined) return null;

        return (
          /* `padding:14px 16px` and a whole pixel of border — dc.html:703. The
             design never draws a sub-pixel rule, and `Panel`'s hairline is a
             third of one on a 3× screen. */
          <Panel edge={toneColour(item.tone, c)} style={s.booking}>
            <View style={s.head}>
              <Text style={[s.rowName, { color: c.fg }]} numberOfLines={1}>
                {row.name}
              </Text>
              <Text style={[s.bookingTime, text.num, { color: c.fg }]}>{row.time}</Text>
            </View>

            <Text style={[s.bookingMeta, text.num, { color: c.fgMuted }]}>{row.meta}</Text>

            {/*
             * The card's left edge is what says "unconfirmed" — the note itself
             * is `--text-xs` on `--fg-subtle` at 400 (dc.html:711). It was
             * drawn amber and semibold, which made the one booking that needs a
             * phone call look like the loudest thing on the screen twice over
             * and left the reader guessing which half was the signal.
             */}
            {item.hasNote && row.note !== '' ? (
              <Text style={[s.bookingNote, { color: c.fgSubtle }]}>{row.note}</Text>
            ) : null}
          </Panel>
        );
      }}
      ListFooterComponent={<Note>{t.text.bookNote}</Note>}
    />
  );
}

/* --------------------------------------------------------- courier: my day */

export function MyDayScreen({ lang }: { lang: Lang }) {
  const c = useTheme();
  const t = moreCopy(lang);

  return (
    <FlatList
      data={t.day.log}
      keyExtractor={(row) => `${row.address}${row.meta}`}
      contentContainerStyle={page()}
      showsVerticalScrollIndicator={false}
      ListHeaderComponent={
        <View>
          <HeroCard label={t.text.dayEarn} value={t.day.earned} note={t.day.earnedNote} />

          <TileGrid>
            {t.day.kpis.map((kpi) => (
              <OutlineTile key={kpi.label} label={kpi.label} value={kpi.value} delta={kpi.note} />
            ))}
          </TileGrid>

          <SectionLabel>{t.text.dayLog}</SectionLabel>
        </View>
      }
      renderItem={({ item }) => (
        <View style={[s.logRow, { borderBottomColor: c.divider }]}>
          <View style={s.main}>
            <Text style={[s.rowSoft, { color: c.fg }]} numberOfLines={1}>
              {item.address}
            </Text>
            <Text style={[s.meta, s.metaGap, text.num, { color: c.fgSubtle }]}>{item.meta}</Text>
          </View>
          <Text style={[s.rowName, text.num, { color: c.fg }]}>{item.amount}</Text>
        </View>
      )}
      ListFooterComponent={<Note>{t.text.dayNote}</Note>}
    />
  );
}

/* ------------------------------------------------- owner: one branch, close up */

/**
 * A branch card opened.
 *
 * Reached by tapping a card on the branches tab rather than from the More menu,
 * so its heading comes from where it was opened — which is why the index
 * arrives in the query string and not the path: it is a position in a list the
 * reader is still standing in, not an identity.
 */
export function BranchScreen({ lang, index }: { lang: Lang; index: number }) {
  const c = useTheme();
  const skin = useCrewSkin();
  const t = moreCopy(lang);
  const more = copy(MORE_COPY, lang);

  const shape = MORE_BRANCHES[index];
  const row = t.branches[index];

  if (shape === undefined || row === undefined) {
    return (
      <View style={s.missing}>
        <Text style={[text.body, { color: c.fgSubtle }]}>{more.notBuilt}</Text>
      </View>
    );
  }

  const orders = Number.parseInt(row.orders, 10);
  const revenue = Number.parseFloat(row.revenue);

  /*
   * The average ticket the design derives rather than stores: revenue in
   * millions over the order count (dc.html:2273). Guarded, because a branch
   * that has not opened yet has no orders and the design's own expression would
   * put `Infinity` on the tile.
   */
  const ticket =
    Number.isFinite(revenue) && orders > 0 ? groupDigits((revenue * 1_000_000) / orders) : '—';

  /*
   * Green met, blue above 85%, amber behind — the same three thresholds the
   * branches list draws and `BRANCHES_COPY.intro` promises in words
   * (dc.html:2270). Read from `attainment` rather than from `shape.tone`, which
   * calls Sergeli's 76% `danger`: a branch a fifth behind its day would go red
   * here and amber on the card the reader tapped to get here.
   */
  const attained = shape.attainment;
  const barColour = attained >= 100 ? c.success500 : attained >= 85 ? c.brand400 : c.warning500;

  return (
    <View style={s.branch}>
      {/*
       * The same dark hero the shift and the day open on, with the attainment
       * bar inside it over `rgba(255,255,255,.16)` (dc.html:886). This screen
       * used to put a 30px figure straight onto the page background with a
       * light 3px bar under it — the one card in the design that is an object
       * rather than a page was drawn as page.
       */}
      <HeroCard
        label={t.text.bdRev}
        value={row.revenue}
        note={fill(say(EXTRA.branch.revNote, lang), { n: row.orders })}
      >
        <ThickBar percent={attained} colour={barColour} track={HERO_TRACK} top={14} />

        {/*
         * One line where the design draws two — `pct` on the left and `tgt` on
         * the right. The catalogue carries both facts as a single translated
         * sentence ("92% kunlik rejadan · 6.8 mln"), and splitting a sentence
         * on its separator to fill two columns is a guess that breaks the first
         * time a translator moves the dot.
         */}
        <Text style={[s.meta, s.branchTarget, text.num, { color: skin.heroDim }]}>
          {row.target}
        </Text>
      </HeroCard>

      {/* Four tiles, not three: the design's second one is the average ticket,
          and it is the one that carries the branch's delta (dc.html:894). The
          delta used to sit beside the revenue figure, where the design has no
          chip at all. */}
      <TileGrid>
        <OutlineTile
          label={say(EXTRA.branch.orders, lang)}
          value={row.orders}
          delta={say(EXTRA.branch.ordersDelta, lang)}
        />
        <OutlineTile
          label={say(EXTRA.branch.ticket, lang)}
          value={ticket}
          delta={row.delta}
          deltaTone={shape.up ? 'success' : 'danger'}
        />
        <OutlineTile
          label={say(EXTRA.branch.margin, lang)}
          value={row.margin}
          delta={say(EXTRA.branch.marginDelta, lang)}
        />
        <OutlineTile
          label={say(EXTRA.branch.staff, lang)}
          value={row.staff}
          delta={say(EXTRA.branch.staffDelta, lang)}
        />
      </TileGrid>

      <SectionLabel>{t.text.bdHours}</SectionLabel>

      {/* Eight hours, amber above 85 orders and `--brand-300` below
          (dc.html:2277) — the chart the closing sentence is about. There was no
          chart of any kind here, so the sentence had nothing to point at. */}
      <Columns
        height={88}
        gap={5}
        cellGap={5}
        tabular
        bars={BRANCH_HOURS.map((bar) => ({
          key: String(bar.hour),
          height: Math.round((bar.orders / HOURS_PEAK) * HOURS_TALLEST),
          colour: bar.orders > 85 ? c.warning500 : c.brand300,
          label: `${bar.hour}:00`,
        }))}
      />

      {/* `mfBd.note`, not the branches *list* intro about bar colours — this
          screen closes on what to do about the peak it just drew. */}
      <Note>{say(EXTRA.branch.note, lang)}</Note>
    </View>
  );
}

const s = StyleSheet.create({
  /* -------------------------------------------------------------- type */
  /* `--text-sm` at 600 — every row title and every figure beside one. */
  rowName: { ...sansAt(600, size.textSm, 1.45) },
  /* `--text-sm` at 500 — the softer left column of a two-column log row. */
  rowSoft: { ...sansAt(500, size.textSm, 1.45) },
  /* `--text-2xs` with no weight declared, which is 400 and not `text.label`. */
  meta: { ...sansAt(400, size.text2xs, 1.45) },
  metaGap: { marginTop: 1 },
  /* `font-family:var(--font-display);font-size:var(--text-lg);font-weight:700`. */
  figureLg: { ...displaySnug(700, size.textLg, 1.25) },

  /* --------------------------------------------------------- P&L ladder */
  ladder: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: 12,
    paddingVertical: 13,
    paddingHorizontal: 16,
  },
  /* A tinted subtotal is also the last row, so its fill has to be clipped to
     the card's bottom radius. */
  ladderClip: { overflow: 'hidden' },
  /* Inter Tight has no 500 in this binary (`display(600|700|800)`), so the
     design's `font-weight:500` on a normal P&L value takes the nearest face it
     ships with. The two subtotal rows are 700 exactly as drawn. */
  pnlValue: { ...displaySnug(600, size.textMd, 1.25) },
  pnlBig: { ...displaySnug(700, size.textLg, 1.25) },

  /* ------------------------------------------------------------- charts */
  chart: { flexDirection: 'row', alignItems: 'flex-end' },
  column: { flex: 1, alignItems: 'center', justifyContent: 'flex-end' },
  columnBar: { width: '100%', borderTopLeftRadius: 3, borderTopRightRadius: 3 },
  columnLabel: { ...sansAt(400, 9, 1.4) },

  /* --------------------------------------------------------------- rows */
  person: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    paddingVertical: 11,
    borderBottomWidth: 1,
  },
  rotaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  expiryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  riskRow: { paddingVertical: 12, borderBottomWidth: 1 },
  stationRow: { paddingVertical: 13, borderBottomWidth: 1 },
  /* The two-column log — `padding:10px 0`, baseline-aligned, on both the
     waiter's top sellers and the courier's drops. */
  logRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
  },
  main: { flex: 1, minWidth: 0 },
  figures: { alignItems: 'flex-end' },
  head: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 10 },
  between: { flexDirection: 'row', justifyContent: 'space-between', gap: 10, marginTop: 6 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  score: { ...sansAt(700, size.textXs, 1.25) },
  riskMeta: { marginTop: 6 },

  /* ------------------------------------------------------------- avatar */
  disc: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center', borderRadius: 16 },
  discLine: { ...sansAt(700, size.text2xs, 1.2) },

  /* --------------------------------------------------------- KPI pieces */
  strip: {
    flexDirection: 'row',
    gap: 1,
    borderWidth: 1,
    borderRadius: size.radiusLg,
    overflow: 'hidden',
    marginBottom: 18,
  },
  stripCell: { flex: 1, minWidth: 0, paddingVertical: 13, paddingHorizontal: 12 },
  stripLabel: {
    ...sansAt(600, 9, 1.25),
    letterSpacing: tracking(raw.trackingCaps, 9),
    textTransform: 'uppercase',
  },
  stripValue: { marginTop: 4 },
  kpiGrid: { marginBottom: 18 },
  tile: {
    flexGrow: 1,
    flexBasis: '47%',
    minWidth: 0,
    borderWidth: 1,
    borderRadius: size.radiusLg,
    paddingVertical: 14,
    paddingHorizontal: 15,
  },
  tileLabel: { ...sansAt(400, size.text2xs, 1.45) },
  tileValue: { marginTop: 4 },
  tileDelta: { ...sansAt(400, size.text3xs, 1.4), marginTop: 2 },
  tileDeltaLoud: { ...sansAt(600, size.text3xs, 1.4), marginTop: 2 },

  /* ---------------------------------------------------------------- bar */
  track: { height: 4, borderRadius: size.radiusPill, overflow: 'hidden' },
  fill: { height: 4, borderRadius: size.radiusPill },

  /* --------------------------------------------------------------- hero */
  hero: {
    borderRadius: size.radiusXl,
    paddingVertical: 19,
    paddingHorizontal: 20,
    marginBottom: 14,
  },
  heroLabel: { ...sansAt(400, size.textXs, 1.45) },
  heroValue: { ...displayAt(700, size.text4xl, 1, raw.trackingTight), marginTop: 4 },
  heroNote: { ...sansAt(400, size.text2xs, 1.45), marginTop: 5 },
  shiftClock: { marginTop: 8 },

  /* ----------------------------------------------------------- bookings */
  booking: { borderWidth: 1, paddingVertical: 14, paddingHorizontal: 16, marginBottom: 10 },
  bookingTime: { ...displaySnug(700, size.textMd, 1.2) },
  bookingMeta: { ...sansAt(400, size.textXs, 1.45), marginTop: 4 },
  bookingNote: { ...sansAt(400, size.textXs, 1.5), marginTop: 5 },

  /* ------------------------------------------------------------- branch */
  branch: { paddingHorizontal: 18 },
  branchTarget: { marginTop: 6 },
  missing: { paddingHorizontal: 18, paddingVertical: size.sp8, alignItems: 'center' },
});
