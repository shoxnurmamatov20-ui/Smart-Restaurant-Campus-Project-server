import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { FlatList, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  copy,
  fill,
  FLASH,
  MENU_COPY,
  ORDER_COPY,
  SHARED,
  TABLES_COPY,
} from '@restaurant/surfaces/crew/copy';
import {
  isCrewRole,
  MENU_ROWS,
  MY_TABLES,
  say,
  type Lang,
  type MenuRow,
  type Trilingual,
} from '@restaurant/surfaces/crew/data';
import { billTotals, SERVICE_PERCENT, VAT_PERCENT } from '@restaurant/surfaces/money';

import { Intro, Note } from '@/crew/bits';
import { SubHeader, SubScreen } from '@/crew/chrome';
import { useFlash } from '@/crew/flash';
import { enqueue } from '@/crew/queue';
import { useLocale } from '@/lib/locale';
import { som } from '@/lib/money';
import { useShadows, useTheme } from '@/lib/theme-context';
import { raw, size } from '@/theme';
import { display, sans, sansAt, text, tracking } from '@/type';
import { Button, PRESSED } from '@/ui/primitives';

/**
 * A waiter taking an order at the table.
 *
 * **One screen, not four routes.** The table is already chosen — this screen
 * hangs off it — and the rest is a rail, a grid and a bar. The design splits the
 * same work into three phases (`mfOrd.pickTable` / `pickItems` / `review`,
 * Xodimlar:778, 793, 819) and the first of them is the table picker this route
 * has already answered. The other two stay merged: a wizard on a phone means a
 * waiter who wants to add one more thing loses the place they scrolled to, with
 * a guest watching. So the grid and the ladder share one scroll, and the bar the
 * design pins under the review phase is pinned under both.
 *
 * **A sold-out dish cannot be added.** The card dims to the design's `opacity:.5`
 * (Xodimlar:802), its monogram drops to `--fg-disabled` and its price line is
 * replaced by the word — and the tap says so out loud rather than doing nothing.
 * The cost of the mistake is why: reading the wrong price to a guest is an
 * apology, and putting an 86'd dish on a bill is an apology plus a re-cook plus,
 * usually, a discount.
 *
 * **The total is the total.** The ladder at the foot is the design's
 * `mfOrdTotals` (Xodimlar:2236), and every figure in it comes from
 * `@restaurant/surfaces/money`, which mirrors `BillTotals::of()` line for line.
 * Nothing here multiplies anything of its own: a second arithmetic is exactly
 * how a phone and a printed cheque come to disagree, and the waiter is who gets
 * blamed for it.
 */
export default function OrderScreen() {
  const c = useTheme();
  const { role, table } = useLocalSearchParams<{ role: string; table: string }>();
  const { lang } = useLocale();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const flash = useFlash();

  const t = copy(ORDER_COPY, lang);
  const f = copy(FLASH, lang);
  const shared = copy(SHARED, lang);
  const tables = copy(TABLES_COPY, lang);
  const menu = copy(MENU_COPY, lang);

  const [basket, setBasket] = useState<Readonly<Record<string, number>>>({});
  const [sent, setSent] = useState(false);
  const [category, setCategory] = useState(0);

  const subtotal = useMemo(
    () => MENU_ROWS.reduce((sum, row) => sum + row.price * (basket[row.id] ?? 0), 0),
    [basket],
  );

  const count = useMemo(
    () => Object.values(basket).reduce((sum, quantity) => sum + quantity, 0),
    [basket],
  );

  /*
   * One category at a time, which is what the rail is for — `mfOrdCat` starts at
   * 0 and `mfOrdCards` is `MENUFULL.filter(m => m.c === ordCat)` (Xodimlar:2206).
   * A flat list of every dish is a longer scroll than a waiter has while a table
   * waits, and it is not what the drawing shows.
   *
   * The `null` is the odd cell. `numColumns={2}` stretches a lone last card to
   * the full width, which is the one thing a 1fr 1fr grid never does.
   */
  const cells = useMemo(() => {
    const visible = MENU_ROWS.filter((row) => row.category.uz === CATEGORIES[category]?.uz);

    return visible.length % 2 === 1 ? [...visible, null] : visible;
  }, [category]);

  if (!isCrewRole(role)) return <Redirect href="/crew" />;

  const seated = MY_TABLES.find((row) => row.id === table);

  if (seated === undefined) return <Redirect href={`/crew/${role}/tables`} />;

  /*
   * Dine-in, and that is not a placeholder: this screen hangs off a table, so
   * there is no other channel it could be. Takeaway and delivery carry no
   * service charge and `chargesService()` is what says so — the rule lives in
   * one place rather than as a condition written out here.
   */
  const bill = billTotals({ subtotal, channel: 'dine_in' });

  const add = (row: MenuRow, by: number) =>
    setBasket((current) => {
      const next = Math.max(0, (current[row.id] ?? 0) + by);
      const copied = { ...current };

      if (next === 0) delete copied[row.id];
      else copied[row.id] = next;

      return copied;
    });

  const tap = (row: MenuRow) => {
    // `g.open` on a sold-out card flashes rather than adds (Xodimlar:2216). The
    // card is already dimmed; the tap is where a waiter finds out why.
    if (row.soldOut) {
      flash(`${say(row.name, lang)} · ${shared.soldOut}`, 'problem');

      return;
    }

    if (!sent) add(row, 1);
  };

  return (
    <SubScreen>
      <View style={{ paddingTop: insets.top }}>
        <SubHeader
          title={t.title}
          note={fill(t.forTable, { table: `${tables.table} ${seated.number}` })}
        />
      </View>

      <FlatList
        data={cells}
        keyExtractor={(cell, index) => cell?.id ?? `gap${index}`}
        numColumns={2}
        /* `grid-template-columns:1fr 1fr;gap:11px` — Xodimlar:800. */
        columnWrapperStyle={s.gridRow}
        contentContainerStyle={[
          s.page,
          { paddingBottom: (count > 0 ? 0 : insets.bottom) + size.sp9 },
        ]}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={
          <View>
            <Intro>{menu.intro}</Intro>

            {/* `display:flex;gap:8px;overflow-x:auto;padding-bottom:12px;
                margin-bottom:4px` — Xodimlar:795. */}
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={s.rail}
              contentContainerStyle={s.railRow}
            >
              {CATEGORIES.map((entry, index) => (
                <Category
                  key={entry.uz}
                  label={say(entry, lang)}
                  on={index === category}
                  onPress={() => setCategory(index)}
                />
              ))}
            </ScrollView>
          </View>
        }
        renderItem={({ item }) =>
          item === null ? (
            <View style={s.gap} />
          ) : (
            <Dish
              row={item}
              lang={lang}
              hue={HUE[category % HUE.length] ?? HUE[0]}
              quantity={basket[item.id] ?? 0}
              soldOut={shared.soldOut}
              onPress={() => tap(item)}
              onTakeOne={() => add(item, -1)}
            />
          )
        }
        ListFooterComponent={
          <View>
            {count === 0 ? (
              <View style={s.empty}>
                <Text style={[text.body, s.emptyTitle, { color: c.fg }]}>{t.empty}</Text>
                <Text style={[text.small, s.emptyBody, { color: c.fgSubtle }]}>{t.emptySub}</Text>
              </View>
            ) : (
              <View style={[s.ladder, { borderTopColor: c.border }]}>
                <Ladder label={t.items} value={som(bill.subtotal, lang, false)} />
                <Ladder
                  label={fill(t.service, { percent: SERVICE_PERCENT })}
                  value={som(bill.serviceCharge, lang, false)}
                />
                <Ladder label={shared.total} value={som(bill.total, lang, false)} strong />
              </View>
            )}

            <Note>{fill(t.vatNote, { vat: VAT_PERCENT })}</Note>
            <Note>{t.sendNote}</Note>
          </View>
        }
      />

      {/*
       * `mfOrd.hasBar` — `position:sticky;bottom:0;margin:16px -18px -22px;
       * padding:14px 18px 20px;background:var(--surface);border-top:1px solid
       * var(--border)` (Xodimlar:842), shown once the basket has anything in it.
       *
       * It is pinned rather than left at the foot of the scroll because that is
       * the whole point of it: the send button used to be the last thing under
       * the menu, so a waiter adding a tenth dish had to scroll past everything
       * to reach it. The design's negative margins are what a sibling of the
       * scroll gets for free here; the safe-area inset goes under the design's
       * own 20px so the label clears the home indicator.
       */}
      {count > 0 ? (
        <View
          style={[
            s.bar,
            {
              backgroundColor: c.surface,
              borderTopColor: c.border,
              paddingBottom: 20 + insets.bottom,
            },
          ]}
        >
          <View style={s.barMain}>
            <Text style={[s.barLabel, text.num, { color: c.fgSubtle }]} numberOfLines={1}>
              {`${tables.table} ${seated.number} · ${seated.seats} ${tables.seats}`}
            </Text>
            <Text style={[s.barTotal, text.num, { color: c.fg }]} numberOfLines={1}>
              {som(bill.total, lang, false)}
            </Text>
          </View>

          {/* `height:48px;padding:0 22px;font-size:var(--text-sm)` — Xodimlar:848. */}
          <Button
            height={48}
            style={s.barCta}
            textStyle={sansAt(600, size.textSm)}
            disabled={sent}
            onPress={() => {
              setSent(true);
              enqueue(t.send, `${tables.table} ${seated.number} · ${som(bill.total, lang)}`);
              flash(fill(f.orderSent, { n: count }));
              router.back();
            }}
          >
            {sent ? t.sent : t.send}
          </Button>
        </View>
      ) : null}
    </SubScreen>
  );
}

/**
 * The six categories, in the order the design's rail draws them.
 *
 * Read off `MENU_ROWS` rather than written out a second time: `ORDCATS`
 * (Xodimlar:1561) and `MENUFULL` are two halves of one list in the drawing, and
 * a hand-kept copy here would be the third place a dish's category is decided.
 * The rail is whatever the menu has, which is also why an empty category cannot
 * be reached.
 */
const CATEGORIES: readonly Trilingual[] = MENU_ROWS.reduce<Trilingual[]>((list, row) => {
  if (!list.some((entry) => entry.uz === row.category.uz)) list.push(row.category);

  return list;
}, []);

/**
 * `HUE` — Xodimlar:2204, indexed by the category rather than by the dish.
 *
 * Literal hex on both themes, because that is what the file does: `HUE` is a
 * JavaScript array in the prototype, not a custom property, so the dark theme
 * remaps everything around these tiles and never these tiles. They stand in for
 * a photograph, and a photograph does not invert either.
 */
const HUE = [
  ['#EEF5FF', '#1C5AD1'],
  ['#FFF3EC', '#B4530A'],
  ['#FDF0F4', '#B0295C'],
  ['#F0F7EE', '#2E7A34'],
  ['#F6F1FD', '#6A3FB5'],
  ['#EDF7F7', '#0A6E72'],
] as const satisfies readonly (readonly [string, string])[];

/** `((words[0])[0] + (words[1] || words[0])[0]).toUpperCase()` — Xodimlar:2210. */
function monogram(name: string): string {
  const words = name
    .replace(/[^A-Za-zЀ-ӿ' ]/g, '')
    .split(' ')
    .filter(Boolean);
  const first = words[0] ?? '?';
  const second = words[1] ?? first;

  return `${first[0] ?? '?'}${second[0] ?? ''}`.toUpperCase();
}

/**
 * A category chip — `data-seg` on a pill, which is not the same control as the
 * filter chip in `@/ui/primitives`.
 *
 * `height:34px;padding:0 14px;border:1px solid var(--border);border-radius:pill;
 * background:var(--surface);color:var(--fg-muted);font-size:var(--text-xs);
 * font-weight:600` (Xodimlar:797), and the on state is
 * `[data-seg][data-active="true"]{background:var(--surface);color:var(--fg);
 * box-shadow:var(--shadow-xs)}` (Xodimlar:63) — full-strength ink and a shadow,
 * *not* a brand fill. `<Chip on>` would paint it blue, which is the other
 * control on the same page and would read as a different kind of choice.
 */
function Category({ label, on, onPress }: { label: string; on: boolean; onPress: () => void }) {
  const c = useTheme();
  const sh = useShadows();

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: on }}
      onPress={onPress}
      style={({ pressed }) => [
        s.cat,
        { borderColor: c.border, backgroundColor: c.surface, borderRadius: size.radiusPill },
        on && { boxShadow: sh.xs },
        pressed && PRESSED,
      ]}
    >
      <Text style={[s.catLine, { color: on ? c.fg : c.fgMuted }]} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

/**
 * One dish, as the design draws it: a 92px coloured tile with a monogram over a
 * name and a price (Xodimlar:802–810). It was a text row with a `− n +` stepper.
 *
 * **The count badge takes one off.** The design's card opens a dish sheet where
 * the quantity and a kitchen note are set (`mfSub:"dish"`, Xodimlar:2216), and
 * that sheet has no route in this app — so the card adds one per tap. Without
 * somewhere to put the correction, a waiter who taps twice by accident has no
 * way back, and losing that was not worth the grid. The badge is drawn exactly
 * where the design draws it and only appears at `q > 0`, which is also the only
 * time there is anything to remove.
 */
function Dish({
  row,
  lang,
  hue,
  quantity,
  soldOut,
  onPress,
  onTakeOne,
}: {
  row: MenuRow;
  lang: Lang;
  hue: readonly [string, string];
  quantity: number;
  soldOut: string;
  onPress: () => void;
  onTakeOne: () => void;
}) {
  const c = useTheme();
  const name = say(row.name, lang);

  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        s.card,
        { borderColor: c.border, backgroundColor: c.surface, borderRadius: size.radiusLg },
        row.soldOut && s.dim,
        pressed && PRESSED,
      ]}
    >
      <View style={[s.tile, { backgroundColor: hue[0] }]}>
        <Text style={[s.mono, { color: row.soldOut ? c.fgDisabled : hue[1] }]}>
          {monogram(name)}
        </Text>

        {quantity > 0 ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${name} −1`}
            hitSlop={11}
            onPress={onTakeOne}
            style={({ pressed }) => [s.badge, { backgroundColor: c.brand500 }, pressed && PRESSED]}
          >
            <Text style={[s.badgeLine, text.num, { color: c.n0 }]}>{quantity}</Text>
          </Pressable>
        ) : null}
      </View>

      <View style={s.body}>
        <Text style={[s.cardName, { color: c.fg }]}>{name}</Text>
        <Text
          style={[s.cardPrice, text.num, { color: row.soldOut ? c.danger600 : c.fgMuted }]}
          numberOfLines={1}
        >
          {row.soldOut ? soldOut : som(row.price, lang)}
        </Text>
      </View>
    </Pressable>
  );
}

/**
 * One rung of `mfOrdTotals` — Xodimlar:2236.
 *
 * The two carried rows are `--text-sm` at 500 in `--fg-muted`; the total is
 * `--text-xl` at 700 in `--fg` **on both sides**, which is the part that is easy
 * to miss: only the figure switches to the display face, the word beside it
 * stays in the body face at the same 20px. It was 15px, so the ladder ended on a
 * label two steps quieter than the number it belonged to.
 */
function Ladder({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  const c = useTheme();

  return (
    <View style={s.ladderRow}>
      <Text
        style={strong === true ? [s.rungTotal, { color: c.fg }] : [s.rung, { color: c.fgMuted }]}
      >
        {label}
      </Text>
      <Text
        style={[
          strong === true ? s.rungTotalValue : s.rungValue,
          text.num,
          { color: strong === true ? c.fg : c.fgMuted },
        ]}
      >
        {value}
      </Text>
    </View>
  );
}

const s = StyleSheet.create({
  page: { paddingHorizontal: size.sp5 },
  /* `gap:11px` between the columns, and the same between the rows. */
  gridRow: { gap: 11, marginBottom: 11 },
  gap: { flex: 1 },
  rail: { marginBottom: 4 },
  railRow: { gap: 8, paddingBottom: 12 },
  /* `height:34px;padding:0 14px` — Xodimlar:797. */
  cat: {
    height: 34,
    paddingHorizontal: 14,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  catLine: { ...sansAt(600, size.textXs, 1.2) },
  card: { flex: 1, borderWidth: 1, overflow: 'hidden' },
  dim: { opacity: 0.5 },
  /* `height:92px` — Xodimlar:803. */
  tile: { height: 92, alignItems: 'center', justifyContent: 'center' },
  /* `font-size:27px;font-weight:800;letter-spacing:-.02em` — Xodimlar:804. */
  mono: { ...display(800), fontSize: 27, lineHeight: 31, letterSpacing: tracking('-.02em', 27) },
  /* `top:7px;right:7px;min-width:22px;height:22px;padding:0 6px` — Xodimlar:805. */
  badge: {
    position: 'absolute',
    top: 7,
    right: 7,
    minWidth: 22,
    height: 22,
    paddingHorizontal: 6,
    borderRadius: size.radiusPill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeLine: { ...sans(700), fontSize: size.text2xs, lineHeight: size.text2xs },
  /* `padding:10px 12px 12px` — Xodimlar:807. */
  body: { paddingTop: 10, paddingHorizontal: 12, paddingBottom: 12 },
  /* `line-height:1.3;min-height:35px` — the floor is what keeps a one-line name
     and a two-line name showing their prices on the same baseline. */
  cardName: { ...sansAt(600, size.textSm, 1.3), minHeight: 35 },
  cardPrice: { ...sansAt(600, size.textXs), marginTop: 5 },
  /* `margin-top:16px;padding-top:13px;border-top:1px solid var(--border)` —
     Xodimlar:830. One point, never the sub-pixel default: at @3x that is a third
     of the weight the design draws. */
  ladder: { marginTop: 16, paddingTop: 13, borderTopWidth: 1 },
  /* `margin-top:7px` and no padding of its own — Xodimlar:832. */
  ladderRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: 12,
    marginTop: 7,
  },
  rung: { ...sansAt(500, size.textSm) },
  rungValue: { ...display(600), fontSize: size.textSm, lineHeight: 19 },
  rungTotal: { ...sansAt(700, size.textXl, 1.25) },
  rungTotalValue: {
    ...display(700),
    fontSize: size.textXl,
    lineHeight: 25,
    letterSpacing: tracking(raw.trackingSnug, size.textXl),
  },
  empty: { paddingVertical: 36, alignItems: 'center' },
  emptyTitle: { ...sans(600), textAlign: 'center' },
  emptyBody: { marginTop: 6, textAlign: 'center', lineHeight: 20 },
  /* `padding:14px 18px 20px;border-top:1px solid var(--border)` — Xodimlar:842. */
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingTop: 14,
    paddingHorizontal: 18,
    borderTopWidth: 1,
  },
  barMain: { flex: 1, minWidth: 0 },
  barLabel: { ...sansAt(400, size.text2xs, 1.45) },
  /* `--text-lg` in the display face at `--tracking-snug` — Xodimlar:846. */
  barTotal: {
    ...display(700),
    fontSize: size.textLg,
    lineHeight: 20,
    letterSpacing: tracking(raw.trackingSnug, size.textLg),
  },
  barCta: { flexGrow: 0, paddingHorizontal: 22 },
});
