import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View, type ViewStyle } from 'react-native';

import { copy, fill, FLASH } from '@restaurant/surfaces/crew/copy';
import { DROPS, type Lang } from '@restaurant/surfaces/crew/data';
import { moreCopy } from '@restaurant/surfaces/crew/more-copy';
import { realId } from '@restaurant/surfaces/crew/live';
import {
  HANDBACK_REASON_CODES,
  MORE_CLOSING,
  MORE_END_SHIFT,
  MORE_PURCHASE,
  MORE_SWAP_PEOPLE,
  MORE_SWAP_SHIFTS,
  MORE_WASTE_ITEMS,
  WASTE_REASON_CODES,
} from '@restaurant/surfaces/crew/more-data';

import { som } from '../../lib/money';
import { useShadows, useTheme } from '../../lib/theme-context';
import { size } from '../../theme';
import { display, sans, sansAt, text } from '../../type';
import { Button, Card, PRESSED } from '../../ui/primitives';
import { Note, SectionLabel } from '../bits';
import { useFlash } from '../flash';
import {
  raisePurchase,
  raiseSwap,
  useCrewChecklist,
  useCrewSuppliers,
  usePricedShelf,
  useRiderRound,
  useSwapOptions,
} from '../live';
import { enqueue } from '../queue';

/**
 * The six More screens that take an answer.
 *
 * Each of them ends in a button, and every one of those buttons does something:
 * it records the answer in the pending queue and says what happened. None of
 * them pretends to have reached the server — there is no staff-app write
 * endpoint — but a screen whose control is inert teaches somebody the app is
 * broken, and a screen that lies teaches them something worse.
 *
 * `ScrollView` rather than `FlatList` throughout: these are forms of four to six
 * rows with a header and a footer, not lists. The rule that lists must be
 * virtualised is about ninety dishes, not about five reasons for spoilage.
 *
 * ---------------------------------------------------------------------------
 * Where the numbers below come from
 *
 * `docs/design/source/Smart Restaurant Xodimlar ilovasi.dc.html`, inline on the
 * elements themselves — `mfSub.closing` at 567, `mfSub.waste` at 614,
 * `mfSub.porder` at 654, `mfSub.handback` at 936, `mfSub.endshift` at 950 and
 * `mfSub.swap` at 966. Every screen here was drawn out of stacked bordered
 * cards instead, which is a different form: five 56pt cards for five words fill
 * the first screenful before the sheet has asked anything, and a manager closing
 * up at midnight reads a checklist down its left edge, not five separate panels.
 */

const page = {
  paddingHorizontal: size.sp5,
  paddingBottom: size.sp9,
};

/* ------------------------------------------------------------------ mark */

/**
 * The ring that holds the tick — design 571, 939, 954, 970, 985.
 *
 * `width:22px;height:22px;border-radius:50%;border:1.5px solid {ring};
 * background:{fill};color:#fff;font-size:11px;font-weight:700`, at 22 in a
 * checklist, 20 on a reason or a shift and 18 on a colleague.
 *
 * It leads the row, and that is the point rather than a detail: the app drew a
 * bare tick on the far *right* and no circle at all, which is a different
 * control. A mark on the left is a thing you are choosing; a mark on the right
 * is a status somebody else set — and with nothing drawn in the unchosen state
 * there was no way to see that a row could be picked at all.
 *
 * The glyph is the design's own character, not `CheckIcon`: at 11px inside a
 * 22px disc an SVG tick and a text tick are the same shape, and the text one
 * inherits the ring's own metrics.
 */
function Mark({
  on,
  box = 20,
  tone = 'brand',
  style,
}: {
  on: boolean;
  box?: number;
  tone?: 'brand' | 'success';
  style?: ViewStyle;
}) {
  const c = useTheme();
  const paint = tone === 'brand' ? c.brand500 : c.success500;

  return (
    <View
      style={[
        s.mark,
        {
          width: box,
          height: box,
          borderRadius: box / 2,
          borderColor: on ? paint : c.borderStrong,
          backgroundColor: on ? paint : 'transparent',
        },
        style,
      ]}
    >
      {on ? (
        <Text
          style={[s.markGlyph, { color: c.n0, fontSize: box <= 18 ? size.text3xs : size.text2xs }]}
        >
          ✓
        </Text>
      ) : null}
    </View>
  );
}

/* ------------------------------------------------------------ a chosen row */

/**
 * The three boxes the design draws a pickable row in.
 *
 * One table rather than three components, because they differ only in their
 * numbers: a hand-back reason (938), a swap shift (969) and a colleague (979).
 * `top` is the hand-back's `align-items:flex-start` — its note runs to two
 * lines and the mark stays beside the first of them.
 */
const SHAPE = {
  reason: { v: 14, h: 15, gap: 12, below: 9, mark: 20, noteTop: 2, top: true },
  shift: { v: 13, h: 15, gap: 12, below: 9, mark: 20, noteTop: 2, top: false },
  person: { v: 11, h: 13, gap: 11, below: 8, mark: 18, noteTop: 1, top: false },
} as const;

type Shape = keyof typeof SHAPE;

/**
 * One pickable row — `border:1px solid {brand-500|border};background:
 * {brand-50|surface};border-radius:var(--radius-lg)`.
 *
 * `person` is the one shape in this file the design marks on the **right**
 * (985): the row already leads with a 30px disc of initials, and two circles on
 * the same edge would read as one control drawn twice.
 */
function Choice({
  label,
  note,
  chosen,
  onPress,
  shape = 'reason',
  initials,
}: {
  label: string;
  note?: string;
  chosen: boolean;
  onPress: () => void;
  shape?: Shape;
  /** The colleague's two letters — `person` only. */
  initials?: string;
}) {
  const c = useTheme();
  const box = SHAPE[shape];
  const trail = shape === 'person';

  const mark = <Mark on={chosen} box={box.mark} style={box.top ? s.markTop : undefined} />;

  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected: chosen }}
      onPress={onPress}
      style={({ pressed }) => [
        s.choice,
        {
          alignItems: box.top ? 'flex-start' : 'center',
          gap: box.gap,
          marginBottom: box.below,
          paddingVertical: box.v,
          paddingHorizontal: box.h,
          borderColor: chosen ? c.brand500 : c.border,
          backgroundColor: chosen ? c.brand50 : c.surface,
          borderRadius: size.radiusLg,
        },
        pressed && PRESSED,
      ]}
    >
      {trail ? null : mark}

      {initials === undefined ? null : (
        <View style={[s.disc, { backgroundColor: c.bgMuted }]}>
          <Text style={[s.discLine, { color: c.fgMuted }]}>{initials}</Text>
        </View>
      )}

      <View style={s.main}>
        <Text style={[text.small, s.label, { color: c.fg }]} numberOfLines={1}>
          {label}
        </Text>
        {note === undefined ? null : (
          <Text
            style={[
              s.meta,
              shape === 'shift' && text.num,
              { color: trail ? c.fgSubtle : c.fgMuted, marginTop: box.noteTop },
            ]}
            numberOfLines={shape === 'reason' ? 2 : 1}
          >
            {note}
          </Text>
        )}
      </View>

      {trail ? mark : null}
    </Pressable>
  );
}

/* ------------------------------------------------------------- a stepper */

/**
 * One stepper button — design 626, 628 (waste) and 662, 664 (reorder).
 *
 * `width:34px;height:34px;border:1px solid var(--border-strong);
 * border-radius:10px;background:var(--surface);color:var(--fg);font-size:16px;
 * font-weight:600`.
 *
 * Not `Stepper` from `@/ui/primitives`, which is the guest cart's filled brand
 * square: five blue ± pairs down a write-off sheet read as five things to press,
 * and the design draws them outlined on the white ground for exactly that
 * reason. 34pt is under the 44pt reach, so the target is bought with `hitSlop`
 * rather than by growing the box — a 44pt box would push the dividers apart and
 * turn a five-line sheet into a scroll.
 */
function Step({
  glyph,
  onPress,
  disabled,
}: {
  glyph: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  const c = useTheme();

  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      hitSlop={5}
      style={({ pressed }) => [
        s.step,
        { backgroundColor: c.surface, borderColor: c.borderStrong },
        pressed && PRESSED,
        disabled === true && s.dim,
      ]}
    >
      <Text style={[s.stepGlyph, { color: c.fg }]}>{glyph}</Text>
    </Pressable>
  );
}

/**
 * A line that carries its own quantity — design 621 (waste) and 656 (reorder).
 *
 * `padding:11px 0` / `12px 0` over a `1px solid var(--divider)` rule, name and
 * meta on the left, `− 38px +` on the right of the **same** row. Both sheets
 * were drawn as bordered cards with the stepper on a second line underneath,
 * which is why neither of them fitted on a screen: five reorder lines took six
 * hundred points where the design takes three hundred.
 */
function StepLine({
  name,
  meta,
  quantity,
  onStep,
  disabled,
  pad,
}: {
  name: string;
  meta: string;
  quantity: number;
  onStep: (by: number) => void;
  disabled?: boolean;
  pad: number;
}) {
  const c = useTheme();

  return (
    <View style={[s.line, { paddingVertical: pad, borderBottomColor: c.divider }]}>
      <View style={s.main}>
        <Text style={[text.small, s.label, { color: c.fg }]} numberOfLines={1}>
          {name}
        </Text>
        <Text style={[s.meta, text.num, { color: c.fgSubtle }]} numberOfLines={1}>
          {meta}
        </Text>
      </View>

      <View style={s.steps}>
        <Step glyph="−" disabled={disabled} onPress={() => onStep(-1)} />
        <Text style={[s.count, text.num, { color: c.fg }]}>{quantity}</Text>
        <Step glyph="+" disabled={disabled} onPress={() => onStep(1)} />
      </View>
    </View>
  );
}

/**
 * The sum, ruled off above it — design 632 (waste) and 668 (reorder).
 *
 * `align-items:baseline;justify-content:space-between;margin-top:16px;
 * padding-top:13px;border-top:1px solid var(--border)`, the word on the left at
 * `--text-sm` and the figure on the right at `--text-xl` in the display face.
 * It was a right-aligned column with no rule, so the one number the sheet exists
 * to produce sat in the same visual bracket as the line above it.
 */
function Total({ label, value, tone }: { label: string; value: string; tone?: 'danger' }) {
  const c = useTheme();

  return (
    <View style={[s.total, { borderTopColor: c.border }]}>
      <Text style={[text.small, { color: c.fgMuted }]}>{label}</Text>
      <Text style={[text.title, text.num, { color: tone === 'danger' ? c.danger600 : c.fg }]}>
        {value}
      </Text>
    </View>
  );
}

/**
 * One line of a checklist — design 570 (closing) and 953 (end of shift).
 *
 * `padding:14px 16px;border-bottom:1px solid var(--divider)` inside a single
 * bordered card, a 22px mark on the left and, when there is something to do
 * about it, a `height:34px;padding:0 13px` button on the right of the same row.
 *
 * The label is `var(--fg)` when the step is done and `var(--fg-muted)` when it
 * is not, which reads backwards until you are the manager: the two lines still
 * holding you up are the ones you act on, and the design dims them so the
 * *ticked* ones stop competing for the eye.
 *
 * The last row drops its rule. The design draws one on every row and lets
 * `overflow:hidden` stack it against the card's own border — two 1px lines a
 * shade apart, which is a rendering artifact of the box and not a decision.
 */
function CheckRow({
  label,
  note,
  done,
  last,
  action,
}: {
  label: string;
  note: string;
  done: boolean;
  last: boolean;
  action?: { label: string; disabled: boolean; onPress: () => void };
}) {
  const c = useTheme();

  return (
    <View style={[s.check, !last && { borderBottomWidth: 1, borderBottomColor: c.divider }]}>
      <Mark on={done} box={22} tone="success" />

      <View style={s.main}>
        <Text style={[text.small, s.label, { color: done ? c.fg : c.fgMuted }]}>{label}</Text>
        <Text style={[s.meta, text.num, { color: c.fgSubtle }]}>{note}</Text>
      </View>

      {action === undefined ? null : (
        <Button
          kind="secondary"
          height={34}
          disabled={action.disabled}
          onPress={action.onPress}
          style={s.inline}
          textStyle={s.inlineLine}
        >
          {action.label}
        </Button>
      )}
    </View>
  );
}

/* ------------------------------------------------- storekeeper: record waste */

export function WasteScreen({ lang }: { lang: Lang }) {
  const c = useTheme();
  const sh = useShadows();
  const t = moreCopy(lang);
  const f = copy(FLASH, lang);
  const flash = useFlash();

  /*
   * The shelf, priced — `GET /inventory/ingredients`.
   *
   * `waste_log` is keyed on `ingredient_id` and this sheet drew `w1`…`w5`, so
   * the button stopped queueing anything at all rather than leaving entries
   * with no verb in a memory-only list. This read is what gives it one back.
   */
  const shelf = usePricedShelf(lang);

  const [reason, setReason] = useState<number | null>(null);
  /*
   * A count per row, keyed on the row's own id — `mfWasteQty` in the design.
   *
   * The sheet used to pick **one** item and type **one** quantity into a text
   * field, which is not what the drawing does and not what the job is: a
   * storekeeper closing a fridge writes off the beef, the mozzarella and the
   * bread in one pass, and a form that takes one line at a time is a form that
   * gets the other two written on paper.
   */
  const [counts, setCounts] = useState<Readonly<Record<string, number>>>({});
  const [saved, setSaved] = useState(false);

  /* One list, whichever source there is: a live row carries its own name
     already resolved for this reader, a fixture row takes it from the
     index-aligned catalogue. */
  const rows = shelf.live
    ? shelf.data.map((row) => ({
        id: row.id,
        name: row.name[lang],
        unit: row.unit[lang],
        unitTiyin: row.unitTiyin,
      }))
    : MORE_WASTE_ITEMS.map((row, index) => ({
        id: row.id,
        name: t.wasteItems[index] ?? '',
        unit: '',
        unitTiyin: row.unitTiyin,
      }));

  // Tiyin throughout. The stepper counts whole units, so there is no fraction
  // of a tiyin to lose here — the design's ± moves one at a time.
  const loss = rows.reduce((sum, row) => sum + row.unitTiyin * (counts[row.id] ?? 0), 0);

  const bump = (id: string, by: number) =>
    setCounts((current) => ({ ...current, [id]: Math.max(0, (current[id] ?? 0) + by) }));

  return (
    <ScrollView contentContainerStyle={page}>
      {/*
       * No headings over the two lists. `SUB_NOTES.waste` — "pick the reason,
       * then the quantity" — is already in this screen's header, and a second
       * instruction over each group would be the same sentence twice.
       *
       * The reasons are a wrapping rail of pills (design 615): `flex-wrap:wrap;
       * gap:7px;margin-bottom:16px`, each `height:34px;padding:0 13px`. They
       * were five full-width cards, which filled the screen before the sheet
       * had asked for a single quantity.
       *
       * Nothing is pre-picked, and the design pre-picks the first reason
       * (`S.mfWasteReason || 0`). A write-off is grouped by reason on a
       * food-cost report, so a sheet that opens on "expired" files spoilage
       * under a date nobody checked — the one place this screen is allowed to
       * differ from the drawing.
       */}
      <View style={s.rail}>
        {t.wasteReasons.map((word, index) => {
          const on = reason === index;

          return (
            <Pressable
              key={word}
              accessibilityRole="radio"
              accessibilityState={{ selected: on }}
              onPress={() => setReason(index)}
              style={({ pressed }) => [
                s.reason,
                {
                  backgroundColor: c.surface,
                  borderColor: c.border,
                  borderRadius: size.radiusPill,
                },
                /* `[data-seg][data-active="true"]{background:var(--surface);
                   color:var(--fg);box-shadow:var(--shadow-xs)}` — design 63.
                   The chosen pill lifts off the page; it does not fill. */
                on && { boxShadow: sh.xs },
                pressed && PRESSED,
              ]}
            >
              <Text style={[text.chip, { color: on ? c.fg : c.fgMuted }]} numberOfLines={1}>
                {word}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {rows.map((row) => (
        <StepLine
          key={row.id}
          name={row.name}
          meta={
            row.unit === ''
              ? som(row.unitTiyin, lang, false)
              : `${som(row.unitTiyin, lang, false)} / ${row.unit}`
          }
          quantity={counts[row.id] ?? 0}
          disabled={saved}
          onStep={(by) => bump(row.id, by)}
          pad={11}
        />
      ))}

      <Total label={t.text.wasteTotal} value={som(loss, lang, false)} tone="danger" />

      <Button
        height={48}
        style={s.cta14}
        textStyle={s.ctaSmall}
        disabled={saved}
        onPress={() => {
          if (reason === null || loss === 0) {
            flash(f.needsQuantity, 'problem');

            return;
          }

          setSaved(true);

          const lines = rows
            .map((row) => ({
              ingredientId: realId(row.id),
              name: row.name,
              quantity: counts[row.id] ?? 0,
            }))
            .filter(
              (line): line is { ingredientId: number; name: string; quantity: number } =>
                line.ingredientId !== null && line.quantity > 0,
            );

          if (!shelf.live || lines.length === 0) {
            /*
             * Still not queued when the list is the design's.
             *
             * `enqueue()` with no verb leaves an entry `drain()` counts
             * `unsendable`: it sits in the pending list for ever, and this
             * queue is in memory only, so the work vanished when the app was
             * killed while the screen said it was waiting to sync.
             */
            flash(f.notRecorded, 'problem');

            return;
          }

          /*
           * One entry per line, because `waste_log` is one ingredient — the
           * sheet writes off three things in a pass and the ledger takes three
           * rows. The reason travels as a stable code, not as the word on
           * screen: a food-cost report groups by it, and a reason written in
           * whatever language the phone happened to be in splits one bucket
           * into three.
           */
          for (const line of lines) {
            enqueue(t.text.wasteSave, line.name, {
              kind: 'waste_log',
              payload: {
                ingredient_id: line.ingredientId,
                quantity: line.quantity,
                reason: WASTE_REASON_CODES[reason] ?? 'other',
              },
            });
          }

          flash(f.wasteRecorded);
        }}
      >
        {t.text.wasteSave}
      </Button>

      <Note>{t.text.wasteNote}</Note>
    </ScrollView>
  );
}

/* ------------------------------------------- storekeeper: order from a supplier */

export function PurchaseScreen({ lang }: { lang: Lang }) {
  const t = moreCopy(lang);
  const f = copy(FLASH, lang);
  const flash = useFlash();

  /*
   * The shelf and the suppliers, both needed before this sheet can post:
   * `POST /suppliers/purchase-orders` takes a supplier id and an ingredient id
   * per line, and the design's `p1`…`p5` are neither.
   */
  const shelf = usePricedShelf(lang);
  const vendors = useCrewSuppliers();

  const live = shelf.live && vendors.live;

  /*
   * Only the rows that are actually short.
   *
   * A live shelf is a hundred ingredients and the design's sheet is five. What
   * makes five the right number is not the design: a reorder screen is opened
   * to fix a shortage, and listing everything the restaurant stocks turns a
   * thirty-second job into a scroll.
   */
  const rows = live
    ? shelf.data
        .filter((row) => row.suggested > 0)
        .map((row) => ({
          id: row.id,
          name: row.name[lang],
          meta: row.onHand,
          unit: row.unit.en,
          unitTiyin: row.unitTiyin,
          suggested: row.suggested,
        }))
    : MORE_PURCHASE.map((row, index) => ({
        id: row.id,
        name: t.purchase[index]?.name ?? '',
        meta: t.purchase[index]?.meta ?? '',
        unit: '',
        unitTiyin: row.unitTiyin,
        suggested: row.suggested,
      }));

  /*
   * Pre-filled from stock cover, which is the screen's whole value: a
   * storekeeper corrects a suggestion in seconds and composes an order in
   * minutes.
   *
   * Keyed on the row's id and defaulted per row — `pq[p.id] === undefined ?
   * p.sug : pq[p.id]` in the design. It used to be a five-long array seeded
   * from the fixture, so on a live shelf the first five lines opened at the
   * *demo's* suggestions and anything past the fifth could not be stepped at
   * all: `map` over five entries silently drops index 5.
   */
  const [counts, setCounts] = useState<Readonly<Record<string, number>>>({});
  const [supplier, setSupplier] = useState(0);
  const [sent, setSent] = useState(false);

  const quantityOf = (row: { id: string; suggested: number }): number =>
    counts[row.id] ?? row.suggested;

  const total = useMemo(
    () => rows.reduce((sum, row) => sum + row.unitTiyin * (counts[row.id] ?? row.suggested), 0),
    [rows, counts],
  );

  const step = (row: { id: string; suggested: number }, by: number) =>
    setCounts((current) => ({
      ...current,
      [row.id]: Math.max(0, (current[row.id] ?? row.suggested) + by),
    }));

  return (
    <ScrollView contentContainerStyle={page}>
      {live && vendors.data.length > 0 ? (
        <>
          <SectionLabel>{t.text.porderSupplier}</SectionLabel>
          {vendors.data.map((row, index) => (
            <Choice
              key={row.id}
              shape="shift"
              label={row.name}
              chosen={supplier === index}
              onPress={() => setSupplier(index)}
            />
          ))}
          <View style={s.gap} />
        </>
      ) : null}

      {rows.map((row) => (
        <StepLine
          key={row.id}
          name={row.name}
          meta={row.meta}
          quantity={quantityOf(row)}
          disabled={sent}
          onStep={(by) => step(row, by)}
          pad={12}
        />
      ))}

      <Total label={t.text.porderTotal} value={som(total, lang, false)} />

      <Button
        height={48}
        style={s.cta14}
        textStyle={s.ctaSmall}
        disabled={sent || total === 0}
        onPress={() => {
          setSent(true);

          const vendor = vendors.data[supplier];

          if (!live || vendor === undefined) {
            /* Not queued and not sent — see the waste form above. A purchase
               order needs supplier and ingredient ids; this sheet has the
               design's rows. */
            flash(f.notRecorded, 'problem');

            return;
          }

          const lines = rows
            .map((row) => ({
              ingredientId: realId(row.id),
              name: row.name,
              unit: row.unit,
              quantity: quantityOf(row),
            }))
            .filter(
              (
                line,
              ): line is { ingredientId: number; name: string; unit: string; quantity: number } =>
                line.ingredientId !== null && line.quantity > 0,
            );

          /*
           * Sent rather than queued: a purchase order raised twice is stock
           * ordered twice, and unlike a clock-in there is no natural key that
           * would let the server collapse the pair. So this one asks for a
           * network and says so plainly when there is none.
           */
          void raisePurchase(Number(vendor.id), lines).then(
            () => flash(f.purchaseRaised),
            () => {
              setSent(false);
              flash(f.notRecorded, 'problem');
            },
          );
        }}
      >
        {t.text.porderSend}
      </Button>

      <Note>{t.text.porderNote}</Note>
    </ScrollView>
  );
}

/* ----------------------------------------------------- waiter: swap a shift */

export function SwapScreen({ lang }: { lang: Lang }) {
  const c = useTheme();
  const t = moreCopy(lang);
  const f = copy(FLASH, lang);
  const flash = useFlash();

  /*
   * The caller's own upcoming rota — `GET /staff/me/upcoming`.
   *
   * The design headed each row with a weekday, and that is precisely why this
   * form could not post: "Payshanba" names a different Thursday every week, so
   * it could not say which shift it meant even to the person filling it in. The
   * live rows carry a date, and a `shift_id`.
   */
  const options = useSwapOptions(lang);

  const shifts = options.live
    ? options.data.shifts
    : MORE_SWAP_SHIFTS.map((row, index) => ({
        id: row.id,
        day: t.swapShifts[index]?.day ?? '',
        time: t.swapShifts[index]?.time ?? '',
      }));

  const people = options.live
    ? options.data.colleagues.map((row) => ({
        id: row.id,
        name: row.name,
        initials: row.initials,
        free: row.role,
      }))
    : MORE_SWAP_PEOPLE.map((row, index) => ({
        id: row.id,
        name: t.swapPeople[index]?.name ?? '',
        initials: t.swapPeople[index]?.initials ?? '',
        free: t.swapPeople[index]?.free ?? '',
      }));

  const [shift, setShift] = useState<number | null>(null);
  const [who, setWho] = useState<number | null>(null);
  const [sent, setSent] = useState(false);

  const ready = shift !== null && who !== null;

  return (
    <ScrollView contentContainerStyle={page}>
      <SectionLabel>{t.text.swapMine}</SectionLabel>

      {shifts.map((row, index) => {
        return (
          <Choice
            key={row.id}
            shape="shift"
            label={row.day}
            note={row.time}
            chosen={shift === index}
            onPress={() => setShift(index)}
          />
        );
      })}

      <SectionLabel>{t.text.swapWho}</SectionLabel>

      {people.map((row, index) => {
        return (
          <Choice
            key={row.id}
            shape="person"
            label={row.name}
            note={row.free}
            initials={row.initials}
            chosen={who === index}
            onPress={() => setWho(index)}
          />
        );
      })}

      {/*
       * Grey until the form can answer — `mfSwapBg` is `var(--n-300)` while
       * either half is missing and `var(--brand-500)` after (design 2343).
       *
       * Still pressable, and deliberately: the design's own handler refuses in
       * words ("pick a shift and a colleague"), and a disabled button is a
       * button that says nothing. What the grey buys is that a waiter does not
       * read a live blue call-to-action with half the form empty.
       */}
      <Button
        height={48}
        style={[s.cta10, ready ? null : { backgroundColor: c.n300 }]}
        textStyle={s.ctaSmall}
        disabled={sent}
        onPress={() => {
          if (shift === null || who === null) {
            flash(f.swapNeedsBoth, 'problem');

            return;
          }

          setSent(true);

          const shiftId = realId(shifts[shift]?.id ?? '');

          if (!options.live || shiftId === null) {
            /* Not sent — a swap needs a shift id and a colleague's staff-member
               id, and both lists here are the design's. */
            flash(f.notRecorded, 'problem');

            return;
          }

          /*
           * Sent rather than queued. A swap request is a conversation with a
           * manager; raised twice by a drained queue it is two rows in
           * somebody's approvals with no natural key to collapse them.
           */
          void raiseSwap(shiftId, realId(people[who]?.id ?? '')).then(
            () => flash(f.swapSent),
            () => {
              setSent(false);
              flash(f.notRecorded, 'problem');
            },
          );
        }}
      >
        {t.text.swapSend}
      </Button>

      <Note>{t.text.swapNote}</Note>
    </ScrollView>
  );
}

/* --------------------------------------------- courier: hand an order back */

export function HandbackScreen({ lang }: { lang: Lang }) {
  const c = useTheme();
  const t = moreCopy(lang);
  const f = copy(FLASH, lang);
  const flash = useFlash();

  /*
   * Which bag. The design assumes a courier hands back the one in their hand,
   * which is true for a single drop and wrong for a rider carrying three —
   * defaulting to the first and never asking returns somebody else's dinner to
   * the queue. So a round of two or more asks; a round of one does not.
   */
  const round = useRiderRound();
  const drops = round.live ? round.data : [];

  const [reason, setReason] = useState<number | null>(null);
  const [drop, setDrop] = useState(0);
  const [sent, setSent] = useState(false);

  return (
    <ScrollView contentContainerStyle={page}>
      {drops.length > 1 ? (
        <>
          {drops.map((row, index) => (
            <Choice
              key={row.id}
              label={row.number}
              note={row.where}
              chosen={drop === index}
              onPress={() => setDrop(index)}
            />
          ))}
          <View style={s.gap} />
        </>
      ) : null}

      {t.handback.map((row, index) => (
        <Choice
          key={row.label}
          label={row.label}
          note={row.note}
          chosen={reason === index}
          onPress={() => setReason(index)}
        />
      ))}

      {/* `mfHbBg` — `var(--n-300)` until a reason is picked (design 2298). */}
      <Button
        height={48}
        style={[s.cta8, reason === null ? { backgroundColor: c.n300 } : null]}
        textStyle={s.ctaSmall}
        disabled={sent}
        onPress={() => {
          if (reason === null) {
            flash(f.handbackNeedsReason, 'problem');

            return;
          }

          setSent(true);

          const chosen = drops[drop];

          if (chosen === undefined) {
            // No live round means no `order_id`, and `delivery_status` is keyed
            // on one. See the waste form above.
            flash(f.notRecorded, 'problem');

            return;
          }

          /*
           * A hand-back is `delivery_status` with `failed`. Queued rather than
           * posted: a stairwell is exactly where this button gets pressed, and
           * the server keys on `local_id`, so a queue that drains twice cannot
           * fail the same drop twice.
           */
          enqueue(t.text.hbSend, chosen.number, {
            kind: 'delivery_status',
            payload: {
              order_id: Number(chosen.id),
              status: 'failed',
              reason: HANDBACK_REASON_CODES[reason] ?? 'other',
            },
          });

          flash(f.handbackSent);
        }}
      >
        {t.text.hbSend}
      </Button>

      {/* The reason is logged and does not touch the rating — said here because
          a courier who thinks it does will stop handing orders back. */}
      <Note>{t.text.hbNote}</Note>
    </ScrollView>
  );
}

/* --------------------------------------------------- manager: close the shift */

export function ClosingScreen({ lang }: { lang: Lang }) {
  const c = useTheme();
  const t = moreCopy(lang);
  const f = copy(FLASH, lang);
  const flash = useFlash();

  /*
   * What the server holds for today, and what has been pressed since.
   *
   * Two collections rather than one because the queue is optimistic: a press
   * has to tick immediately, and the row must not un-tick itself while the
   * drain is in flight. Before `GET /staff/checklists/today` existed this list
   * lived entirely in component state — and on this build that state does not
   * survive the app being killed, so a manager halfway through a close lost the
   * whole run-through.
   */
  const ticks = useCrewChecklist();
  const [pressed, setPressed] = useState<readonly boolean[]>(() => MORE_CLOSING.map(() => false));
  const [closed, setClosed] = useState(false);

  const isDone = (index: number): boolean => {
    const key = MORE_CLOSING[index]?.key;

    if (key !== undefined && ticks.data.ticked.includes(`closing:${key}`)) return true;

    // The fixture's opening state is only believed when there is nothing from
    // the server to believe instead — otherwise a live handset opens with two
    // steps ticked that nobody did.
    return (!ticks.live && (MORE_CLOSING[index]?.done ?? false)) || pressed[index] === true;
  };

  const outstanding = MORE_CLOSING.filter((_, index) => !isDone(index)).length;

  return (
    <ScrollView contentContainerStyle={page}>
      {/* One bordered card holding all five rows — `border:1px solid
          var(--border);border-radius:var(--radius-lg);overflow:hidden;
          margin-bottom:16px` (design 568). Five separate cards is a different
          object: a checklist is one thing with five lines in it. */}
      <Card style={s.list}>
        {MORE_CLOSING.map((step, index) => {
          const line = t.closing[index];

          if (line === undefined) return null;

          const ticked = isDone(index);

          return (
            <CheckRow
              key={line.label}
              label={line.label}
              note={line.note}
              done={ticked}
              last={index === MORE_CLOSING.length - 1}
              /*
               * Three of the five arrive already satisfied, which is the
               * design's own state and what makes the list worth reading at
               * eleven at night: what a manager wants to know is which two are
               * still holding them up.
               */
              action={
                !ticked && step.actionable
                  ? {
                      label: t.text.closeDo,
                      disabled: closed,
                      onPress: () => {
                        setPressed((current) =>
                          current.map((value, position) => (position === index ? true : value)),
                        );

                        /*
                         * `checklist_tick` — it writes to `staff.actions` and
                         * nowhere else, which is the right shape: what matters
                         * about "I checked the fridges" is who said it and
                         * when, and that is what an append-only journal is.
                         * `step.key` rather than the index, so inserting a
                         * sixth line does not silently relabel last month's
                         * ticks.
                         */
                        enqueue(t.text.closeDo, line.label, {
                          kind: 'checklist_tick',
                          payload: { list: 'closing', step: step.key },
                        });

                        flash(f.stepDone);
                      },
                    }
                  : undefined
              }
            />
          );
        })}
      </Card>

      {/* `height:50px` at `--text-md`, and `mfCloseBg` is `var(--n-300)` until
          every step is ticked (design 582, 2435). */}
      <Button
        height={50}
        style={outstanding > 0 ? { backgroundColor: c.n300 } : null}
        disabled={closed}
        onPress={() => {
          if (outstanding > 0) {
            flash(f.conditionsFirst, 'problem');

            return;
          }

          setClosed(true);
          /*
           * No verb, and there should not be one. Closing a shift is
           * `POST /finance/shifts/{shift}/close`, which takes a **counted
           * drawer** note by note and derives the difference from it — there is
           * no step on it for "I checked the fridges". The manager walks to the
           * till with the notes in their hand; this list is the run-through
           * before they do.
           */
          flash(f.shiftClosed);
        }}
      >
        {t.text.closeCta}
      </Button>

      <Note>{t.text.closeNote}</Note>
    </ScrollView>
  );
}

/* ------------------------------------------------------ courier: end the shift */

export function EndShiftScreen({ lang }: { lang: Lang }) {
  const c = useTheme();
  const t = moreCopy(lang);
  const f = copy(FLASH, lang);
  const flash = useFlash();

  const [closed, setClosed] = useState(false);

  /*
   * Both conditions are derived, not stored.
   *
   * The first reads "all orders closed" — a screen that ticked it while the
   * deliveries tab two taps away showed two waiting would be lying about the
   * one thing a courier is held to. The second is "cash handed in", and it now
   * comes from the same `cash_handover` row the cash tab writes, so the two
   * screens on one phone can no longer contradict each other. `MORE_END_SHIFT`
   * keeps both places so the copy stays index-aligned.
   */
  const round = useRiderRound();
  const ticks = useCrewChecklist();

  // A live round holds only what is still out — `deliveries/mine` is scoped to
  // live deliveries — so every row on it is an open drop.
  const open = round.live
    ? round.data.length
    : DROPS.filter((drop) => drop.state !== 'delivered').length;

  const cashHanded = ticks.live
    ? ticks.data.declaredTiyin !== null
    : (MORE_END_SHIFT[1]?.done ?? false);

  const steps = MORE_END_SHIFT.map((step, index) =>
    index === 0
      ? { ...step, done: open === 0 }
      : index === 1
        ? { ...step, done: cashHanded }
        : step,
  );

  const outstanding = steps.filter((step) => !step.done).length;

  return (
    <ScrollView contentContainerStyle={page}>
      {/* The same card as the closing list — design 951. */}
      <Card style={s.list}>
        {steps.map((step, index) => {
          const line = t.endShift[index];

          if (line === undefined) return null;

          return (
            <CheckRow
              key={line.label}
              label={line.label}
              note={fill(line.note, { n: open })}
              done={step.done}
              last={index === steps.length - 1}
            />
          );
        })}
      </Card>

      {/* `mfEndBg` — grey until the round is empty and the cash is in
          (design 2316). */}
      <Button
        height={50}
        style={outstanding > 0 ? { backgroundColor: c.n300 } : null}
        disabled={closed}
        onPress={() => {
          // Two refusals, told apart, because they need two different actions:
          // finish the round, or hand the money in.
          if (open > 0) {
            flash(fill(f.dropsStillOpen, { n: open }), 'problem');

            return;
          }

          if (outstanding > 0) {
            flash(f.cashFirst, 'problem');

            return;
          }

          setClosed(true);
          enqueue(t.text.endCta, t.text.endNote);
          flash(f.courierShiftClosed);
        }}
      >
        {t.text.endCta}
      </Button>

      <Note>{t.text.endNote}</Note>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  main: { flex: 1, minWidth: 0 },
  label: { ...sans(600) },
  /* `font-size:var(--text-2xs)` under a row's name, at the body weight. */
  meta: { ...sansAt(400, size.text2xs, 1.45), marginTop: 1 },
  gap: { height: size.sp4 },

  /* The mark — `border:1.5px solid`, and the design never draws it thinner. */
  mark: { borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  markGlyph: { ...sans(700), lineHeight: 13 },
  /* `margin-top:1px` where the row aligns to the top of a two-line note. */
  markTop: { marginTop: 1 },

  /* A pickable row. The box comes from `SHAPE`; this is what they share. */
  choice: { flexDirection: 'row', borderWidth: 1 },
  /* `width:30px;height:30px;background:var(--bg-muted);color:var(--fg-muted);
     font-size:11px;font-weight:700` — design 980. Not `Avatar` from `../bits`,
     which is the 32px brand disc the people list draws. */
  disc: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  discLine: { ...sans(700), fontSize: size.text2xs, lineHeight: 13 },

  /* The reason rail — `flex-wrap:wrap;gap:7px;margin-bottom:16px`. */
  rail: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginBottom: 16 },
  reason: {
    height: 34,
    paddingHorizontal: 13,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },

  /* A quantity line and its stepper. */
  line: { flexDirection: 'row', alignItems: 'center', gap: 12, borderBottomWidth: 1 },
  steps: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  step: {
    width: 34,
    height: 34,
    /* `border-radius:10px` written as a literal, which is what the design does
       here rather than reaching for `var(--radius-md)`. */
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepGlyph: { ...sansAt(600, 16, 1) },
  /* `width:38px;text-align:center` at `--text-md` in the display face. */
  count: { ...display(700), fontSize: size.textMd, width: 38, textAlign: 'center' },
  dim: { opacity: 0.45 },

  total: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    marginTop: 16,
    paddingTop: 13,
    borderTopWidth: 1,
  },

  /* A checklist card and one of its rows. */
  list: { marginBottom: 16 },
  check: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  /* `height:34px;padding:0 13px` at `--text-xs` — the row's own button. */
  inline: { paddingHorizontal: 13 },
  inlineLine: { fontSize: size.textXs, lineHeight: 15 },

  /* The call-to-action, at the three margins the design gives it. */
  cta14: { marginTop: 14 },
  cta10: { marginTop: 10 },
  cta8: { marginTop: 8 },
  /* Waste, reorder, swap and hand-back label theirs at `--text-sm`; the two
     shift-closing screens use the 15px default. */
  ctaSmall: { fontSize: size.textSm, lineHeight: 16 },
});
