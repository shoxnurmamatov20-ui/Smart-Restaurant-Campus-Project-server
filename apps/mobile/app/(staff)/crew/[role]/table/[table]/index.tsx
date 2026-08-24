import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  copy,
  FLASH,
  LINE_STATE,
  SHARED,
  TABLE_STATE,
  TABLES_COPY,
} from '@restaurant/surfaces/crew/copy';
import {
  isCrewRole,
  MINUTE_WORD,
  MY_TABLES,
  say,
  TABLE_LINES,
  type Lang,
  type OrderLine,
} from '@restaurant/surfaces/crew/data';

import { NotWired } from '@/crew/bits';
import { SubHeader, SubScreen } from '@/crew/chrome';
import { useFlash } from '@/crew/flash';
import { enqueue } from '@/crew/queue';
import { useLocale } from '@/lib/locale';
import { som } from '@/lib/money';
import { useTheme } from '@/lib/theme-context';
import { raw, size } from '@/theme';
import { display, sans, sansAt, text, tracking } from '@/type';
import { Button, Empty } from '@/ui/primitives';

/**
 * One table, and the five things a waiter does at it.
 *
 * The line states are why this screen is worth opening rather than walking to
 * the pass: `ready` is a plate under the heat lamp losing quality by the second,
 * and its label says what to do rather than what happened — "ready · collect
 * it". That is the single most valuable line in the whole ecosystem and a
 * neutral "ready" wastes it.
 *
 * The five actions are a hierarchy, not a list, and the order is the design's:
 * *bring the bill* is the errand a guest has actually asked for and it is where
 * a thumb lands; *transfer* is the rarest and the most disruptive, so it is last
 * and it is not recorded at all — the honest answer to it is where it happens,
 * which is the tablet POS.
 */
export default function TableScreen() {
  const c = useTheme();
  const { role, table } = useLocalSearchParams<{ role: string; table: string }>();
  const { lang } = useLocale();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const flash = useFlash();

  const t = copy(TABLES_COPY, lang);
  const f = copy(FLASH, lang);
  const shared = copy(SHARED, lang);
  const states = copy(TABLE_STATE, lang);

  const [done, setDone] = useState<readonly string[]>([]);

  if (!isCrewRole(role)) return <Redirect href="/crew" />;

  const seated = MY_TABLES.find((row) => row.id === table);

  // A table this waiter does not hold is not theirs to open. Back to the floor
  // rather than a blank screen with a number on it.
  if (seated === undefined) return <Redirect href={`/crew/${role}/tables`} />;

  const lines = TABLE_LINES[seated.id] ?? [];
  const total = lines.reduce((sum, line) => sum + line.price * line.quantity, 0);
  const count = lines.reduce((sum, line) => sum + line.quantity, 0);

  /*
   * Four of the five say what they did in the design's own sentence, and the
   * sentences are not interchangeable: "bill printed · the cashier has been
   * notified" and "sent to the manager · awaiting approval" tell a waiter two
   * different things about whether they can walk away from the table.
   *
   * `quiet` is the fifth. The design draws it in `var(--fg-muted)` on
   * `1px solid var(--border)` while the other three outlined rows are
   * `var(--fg)` on `var(--border-strong)` (Xodimlar:2260 against 2251–2259) —
   * one step back from the stack, because it is the only one of the five that
   * does not happen here at all.
   *
   * ------------------------------------------------------------------------
   * What each of these would need, and why none of them is sent
   *
   * This app DOES write — `POST /api/v1/staff/actions` drains the queue and
   * lands eight verbs against four contracts. None of the three below is one of
   * those eight, and each is blocked for its own reason:
   *
   *  - **Printing the bill.** `POST /api/v1/kitchen/receipts` exists and a
   *    waiter holds the `pos.sell` it asks for. What is missing is here rather
   *    than there: it takes an `order_id`, and `MyTable` carries the table's
   *    running total without the bill it came from — `floorFrom()` reads the
   *    open order and keeps only the money and the minutes.
   *  - **Asking for a discount.** `POST /api/v1/pos/approvals` exists and sits
   *    inside the `pos.session` group, so it is raised against a terminal and
   *    the person standing at it. This phone holds a staff session opened by a
   *    PIN, not a till session, and there is deliberately no way to mint one
   *    from here — a handset that could open a terminal session would be a
   *    till in somebody's pocket.
   *  - **Moving the table to another waiter.** No endpoint anywhere, and the
   *    honest answer is where it happens, which is the tablet POS. That one is
   *    a decision rather than a gap, and `act()` below refuses it out loud
   *    instead of journalling something nobody will act on.
   *
   * So the other four enqueue with no `kind`: the entry stays visible and
   * unsendable, which is what `queue.ts` asks for when there is nothing
   * truthful to post. An invented id would come back `payload_incomplete` and
   * tell the waiter their work did not land.
   */
  const actions = [
    { key: 'bills', label: t.actBills, said: t.actDone, quiet: false },
    { key: 'add', label: t.actAdd, said: null, quiet: false },
    { key: 'bill', label: t.actBill, said: f.billPrinted, quiet: false },
    { key: 'discount', label: t.actDiscount, said: f.discountAsked, quiet: false },
    { key: 'transfer', label: t.actTransfer, said: f.transferElsewhere, quiet: true },
  ] as const;

  function act(key: string, label: string, said: string | null) {
    if (key === 'add') {
      router.push(`/crew/${String(role)}/table/${String(table)}/order`);

      return;
    }

    if (key === 'transfer') {
      // Not recorded, even locally: nothing happened here and the flash says
      // where it does happen.
      flash(f.transferElsewhere, 'problem');

      return;
    }

    setDone((current) => [...current, key]);
    enqueue(label, `${t.table} ${seated?.number ?? ''}`);

    if (said !== null) flash(said);
  }

  return (
    <SubScreen>
      <View style={{ paddingTop: insets.top }}>
        <SubHeader title={`${t.table} ${seated.number}`} note={states[seated.state]} />
      </View>

      <FlatList
        data={lines}
        keyExtractor={(line, index) => `${line.name.uz}${index}`}
        contentContainerStyle={[s.page, { paddingBottom: insets.bottom + size.sp9 }]}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={
          <View>
            {/*
             * `grid-template-columns:repeat(3,1fr);gap:1px;background:var(--divider);
             * border:1px solid var(--border);border-radius:var(--radius-lg);
             * overflow:hidden` — Xodimlar:855.
             *
             * Three cells joined by a 1px rule, not three filled tiles that wrap
             * 2 + 1. The wrap was the visible half of the mistake; the quiet half
             * was the label, which the design writes at **9px** here — smaller
             * than the 10px caps used above a list, because three of them share
             * one strip and have to fit a word each.
             */}
            <View
              style={[
                s.strip,
                {
                  backgroundColor: c.divider,
                  borderColor: c.border,
                  borderRadius: size.radiusLg,
                },
              ]}
            >
              <Kpi label={t.guests} value={String(seated.seats)} />
              <Kpi label={t.elapsed} value={`${seated.minutes} ${say(MINUTE_WORD, lang)}`} />
              <Kpi label={t.lines} value={String(count)} />
            </View>

            {/* `--text-2xs` at `--tracking-caps`, `margin-bottom:9px` — Xodimlar:863. */}
            <Text style={[s.section, { color: c.fgSubtle }]}>{t.orderLines}</Text>
          </View>
        }
        ListEmptyComponent={<Empty title={t.noLines} />}
        renderItem={({ item }) => <Line line={item} lang={lang} />}
        ItemSeparatorComponent={() => <View style={[s.rule, { backgroundColor: c.divider }]} />}
        ListFooterComponent={
          <View>
            <View style={[s.total, { borderTopColor: c.border }]}>
              <Text style={[text.small, { color: c.fgMuted }]}>{shared.total}</Text>
              <Text style={[text.title, text.num, { color: c.fg }]}>{som(total, lang, false)}</Text>
            </View>

            {/*
             * One disclosure, not two. The design ends the screen on the action
             * stack (Xodimlar:878–882) and this screen carried both a banner
             * above the buttons and a note under them saying the same thing in
             * two voices. `notWired` is the one that stays: it is placed *before*
             * the buttons on purpose — a waiter who taps "bring the bill" and
             * walks off believing the kitchen was told is worse off than one who
             * never opened the screen.
             */}
            <NotWired>{shared.notWired}</NotWired>

            {/* `display:grid;gap:9px` — Xodimlar:878. */}
            <View style={s.actions}>
              {actions.map((action) => {
                const marked = done.includes(action.key);

                return (
                  <Button
                    key={action.key}
                    kind={action.key === 'add' ? 'primary' : 'secondary'}
                    /* `height:46px;font-size:var(--text-sm)` — Xodimlar:880. */
                    height={46}
                    style={action.quiet ? { borderColor: c.border } : undefined}
                    textStyle={[
                      sansAt(600, size.textSm),
                      action.quiet ? { color: c.fgMuted } : null,
                    ]}
                    disabled={marked}
                    onPress={() => act(action.key, action.label, action.said)}
                  >
                    {marked ? t.actDone : action.label}
                  </Button>
                );
              })}
            </View>
          </View>
        }
      />
    </SubScreen>
  );
}

/** One cell of the joined strip — `padding:13px 12px` over a 9px caps label. */
function Kpi({ label, value }: { label: string; value: string }) {
  const c = useTheme();

  return (
    <View style={[s.cell, { backgroundColor: c.surface }]}>
      <Text style={[s.cellLabel, { color: c.fgSubtle }]} numberOfLines={1}>
        {label}
      </Text>
      <Text style={[s.cellValue, text.num, { color: c.fg }]} numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}

function Line({ line, lang }: { line: OrderLine; lang: Lang }) {
  const c = useTheme();
  const states = copy(LINE_STATE, lang);

  // Ready is the one state that asks for something, so it is the one that gets a
  // colour a person notices from across a room.
  const tint =
    line.state === 'ready' ? c.warning600 : line.state === 'cooking' ? c.brand600 : c.fgSubtle;

  return (
    <View style={s.line}>
      <Text style={[s.quantity, text.num, { color: c.brand600 }]}>{line.quantity}</Text>

      <View style={s.main}>
        <Text style={[text.small, s.name, { color: c.fg }]} numberOfLines={1}>
          {say(line.name, lang)}
        </Text>
        <Text style={[s.state, { color: tint }]}>{states[line.state]}</Text>
      </View>

      <Text style={[text.small, text.num, s.name, { color: c.fg }]}>
        {som(line.price * line.quantity, lang, false)}
      </Text>
    </View>
  );
}

const s = StyleSheet.create({
  page: { paddingHorizontal: size.sp5 },
  /* `gap:1px` over the divider is what draws the two rules — Xodimlar:855. */
  strip: { flexDirection: 'row', gap: 1, borderWidth: 1, overflow: 'hidden', marginBottom: 16 },
  cell: { flex: 1, minWidth: 0, paddingVertical: 13, paddingHorizontal: 12 },
  cellLabel: {
    ...sans(600),
    fontSize: 9,
    lineHeight: 11,
    letterSpacing: tracking(raw.trackingCaps, 9),
    textTransform: 'uppercase',
  },
  cellValue: { ...display(700), fontSize: size.textLg, lineHeight: 20, marginTop: 4 },
  section: {
    ...sans(600),
    fontSize: size.text2xs,
    lineHeight: 14,
    letterSpacing: tracking(raw.trackingCaps, size.text2xs),
    textTransform: 'uppercase',
    marginBottom: 9,
  },
  line: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 11, minHeight: 44 },
  /* `width:24px` in the display face at `--text-md` — Xodimlar:866. It was the
     body face, which is a different letterform beside the display totals. */
  quantity: { width: 24, ...display(700), fontSize: size.textMd, lineHeight: 19 },
  main: { flex: 1, minWidth: 0 },
  name: { ...sans(600) },
  /* `--text-2xs;font-weight:600;margin-top:2px` — Xodimlar:869. It was 12px. */
  state: { ...sansAt(600, size.text2xs, 1.45), marginTop: 2 },
  total: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    marginTop: 14,
    paddingTop: 12,
    /* One point, as drawn — the sub-pixel default is a third of that at @3x. */
    borderTopWidth: 1,
    /* The action stack's own `margin-top:16px`, carried by the block above it so
       the disclosure can sit between the two — Xodimlar:878. */
    marginBottom: 16,
  },
  actions: { gap: 9 },
  rule: { height: 1 },
});
