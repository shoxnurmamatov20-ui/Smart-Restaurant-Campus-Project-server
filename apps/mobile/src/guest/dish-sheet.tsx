import { useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { allergenLabels, fill } from '@restaurant/surfaces/guest/copy';
import { weightLabel, type GuestDish } from '@restaurant/surfaces/guest/menu-data';
import { DISH_ADDONS } from '@restaurant/surfaces/guest/table-data';

import { addLine } from './basket';
import { useGuestCopy } from './copy';
import { useFlash } from './flash';
import { Alert, Check, ChevronLeft, Picture } from './icons';
import { useLocale } from '../lib/locale';
import { som } from '../lib/money';
import { useTheme } from '../lib/theme-context';
import { size } from '../theme';
import { displayAt, sans, sansAt, text } from '../type';
import { DishPhoto } from '../ui/dish-photo';
import { PRESSED } from '../ui/primitives';

/**
 * One dish, opened — `Mehmon.dc.html`, panel 03.
 *
 * A sheet rather than a screen: a guest comparing two dishes taps back and
 * forth, and a navigation each way loses the place in a list they scrolled to.
 * On the phone this is a real modal instead of the web build's fixed overlay,
 * so the hardware back button closes it and nothing behind it scrolls.
 *
 * **The allergen block is why this exists at all.** A menu row gets skimmed; an
 * allergen line has to be read, by somebody deciding whether they can eat. So
 * it is a block with a heading, and a dish with none says so out loud — silence
 * under a heading called "Allergens" answers a health question with nothing.
 *
 * **The add-ons are the kitchen's, where the kitchen has any.**
 * `GET /api/v1/public/menu` eager-loads `modifier_groups` per dish, and
 * `GuestDish.groups` carries them here with the catalogue's own ids — which is
 * what makes them orderable: `POST /public/tables/{table}/order` prices every
 * choice through `MenuCatalog` and refuses anything else. A dish the kitchen
 * asks nothing about falls back to the design's four (`DISH_ADDONS`), which are
 * words rather than ids; see that constant for where those end up instead.
 *
 * Groups are drawn as the catalogue describes them: a single-answer question
 * behaves as a radio and a multi-answer one as checkboxes, and a group with a
 * ceiling stops accepting once it is reached rather than silently discarding
 * the extra — a guest who taps a fifth topping and sees nothing happen assumes
 * the phone is broken.
 */

/** How long a note to the kitchen may be — `dc.html:1044`, `slice(0, 90)`. */
const NOTE_MAX = 90;

/**
 * One question and its answers, however they were sourced.
 *
 * Flattened out of the two shapes deliberately: the render below must not have
 * to know whether it is drawing a catalogue group or the fallback four, and a
 * component that branched twice would eventually draw the two differently.
 */
type Question = {
  id: string;
  title: string;
  /** One answer only — a radio, whatever the column spells. */
  single: boolean;
  min: number;
  max: number;
  /** Whether the heading carries the word "ixtiyoriy". */
  optional: boolean;
  options: readonly { id: string; label: string; price: number }[];
};

export function DishSheet({
  dish,
  basketId,
  onClose,
}: {
  dish: GuestDish;
  basketId: string;
  onClose: () => void;
}) {
  const c = useTheme();
  const insets = useSafeAreaInsets();
  /* The band runs the width of the sheet, and the sheet runs the width of the
     window: that is the width the photograph is requested for. */
  const { width: sheetWidth } = useWindowDimensions();
  const flash = useFlash();
  const { lang } = useLocale();
  const { t } = useGuestCopy();

  const [quantity, setQuantity] = useState(1);
  const [note, setNote] = useState('');
  const [picked, setPicked] = useState<readonly string[]>([]);

  /*
   * The kitchen's questions, or the design's four when it asks none.
   *
   * `fromKitchen` is the half that decides everything downstream: only a
   * catalogue choice has an id the ordering endpoint will price, so it is what
   * separates an add-on that reaches the bill from one that can only reach the
   * note. See `DISH_ADDONS` for why the second kind still exists.
   */
  const fromKitchen = dish.groups !== undefined && dish.groups.length > 0;

  const questions: readonly Question[] = fromKitchen
    ? (dish.groups ?? []).map((group) => ({
        id: group.id,
        title: group.title,
        // A group whose ceiling is one is a radio however the column spells it:
        // `is_multi` and `max_choices: 1` disagree on some catalogues, and the
        // ceiling is the one a guest can actually violate.
        single: !group.multi || group.max <= 1,
        min: group.min,
        max: Math.max(1, group.max),
        optional: group.min === 0,
        options: group.choices.map((choice) => ({
          id: choice.id,
          label: choice.name,
          price: choice.price,
        })),
      }))
    : [
        {
          id: 'addons',
          title: t.dish.addons,
          single: false,
          min: 0,
          max: DISH_ADDONS.length,
          optional: true,
          options: DISH_ADDONS.map((addon) => ({
            id: addon.key,
            label: t.dish.addonList[addon.key],
            price: addon.price,
          })),
        },
      ];

  const chosen = questions.flatMap((question) =>
    question.options.filter((option) => picked.includes(option.id)),
  );

  /* The dish price is the API's and is never recomputed. The choices are added
     at their own whole deltas — the one arithmetic this sheet does, and the one
     a guest can check against the printed menu. A delta may be negative: a small
     cup costs less than the dish it is a size of. */
  const unitPrice = dish.price + chosen.reduce((sum, option) => sum + option.price, 0);
  const weight = weightLabel(dish);

  /* A question the kitchen requires an answer to and has not been given one.
     The button greys rather than the sheet arguing: there is no copy for a
     validation sentence here, and a disabled button beside an unanswered
     question reads as one thing. */
  const unanswered = questions.some(
    (question) =>
      question.min > 0 &&
      question.options.filter((option) => picked.includes(option.id)).length < question.min,
  );

  const commit = () => {
    if (unanswered) return;

    addLine(basketId, {
      dishId: dish.id,
      name: dish.name,
      unitPrice,
      quantity,
      /* The choices travel with the line: a basket row reading just "Plov"
         beside a price with 22 000 of qazi in it is a row the kitchen and the
         guest read differently. */
      options: chosen.map((option) => option.label),
      /* Only the catalogue's own ids, and only when they came from the
         catalogue. The fallback keys are words, and a word here would have the
         ordering endpoint refuse the whole basket rather than this one line. */
      choiceIds: fromKitchen ? chosen.map((option) => option.id) : [],
      note,
    });

    flash(
      quantity === 1
        ? fill(t.menu.added, { name: dish.name })
        : fill(t.menu.addedMany, { count: quantity, name: dish.name }),
    );

    onClose();
  };

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <View style={[s.stage, { paddingTop: insets.top }]}>
        {/* The scrim is a control: tapping outside a sheet closes it, and a
            guest who opened the wrong dish should not have to find a button. */}
        <Pressable
          style={[s.scrim, { backgroundColor: c.n900 }]}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel={t.dish.back}
        />

        {/* The sheet may take everything below the status bar. `dc.html:253`
            draws this as a whole 390×800 screen, and at the old 92% ceiling a
            short phone had to scroll before the 200px band was even out of the
            way. The scrim keeps the strip the inset reserves, so tapping
            outside still closes. */}
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={s.lift}
        >
          <View
            style={[
              s.sheet,
              { backgroundColor: c.surface, borderTopLeftRadius: 18, borderTopRightRadius: 18 },
            ]}
          >
            <ScrollView
              style={s.grow}
              contentContainerStyle={s.body}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
            >
              {/* The photograph band — `dc.html:253-259`, 200px with the back
                  control on it. Without it the sheet opened straight onto a
                  heading, which on a menu of forty rows gave no way of telling
                  whether the right dish had been opened. */}
              <View style={[s.band, { backgroundColor: c.bgMuted, borderColor: c.border }]}>
                {/* The photograph lies under the back control, at the band's
                    full width — the one slot on this surface where it stands
                    alone, so it carries the dish's name for the reader. */}
                <DishPhoto
                  image={dish.image}
                  width={sheetWidth}
                  height={200}
                  fill
                  fallback={<Picture size={30} colour={c.n400} />}
                  accessibilityLabel={dish.name}
                />

                <Pressable
                  onPress={onClose}
                  accessibilityRole="button"
                  accessibilityLabel={t.dish.back}
                  /* 36×36 at radius 12 — `dc.html:257`. It was drawn 44×44 at
                     radius 10 to buy a touch target; `hitSlop` buys the same
                     reach without changing what the design draws. */
                  hitSlop={4}
                  style={({ pressed }) => [
                    s.back,
                    { backgroundColor: c.surface, borderRadius: 12 },
                    pressed && PRESSED,
                  ]}
                >
                  <ChevronLeft colour={c.fg} />
                </Pressable>
              </View>

              <View style={s.pad}>
                {/* 24px/700 at -.022em — `dc.html:265`. This was `text.display`
                    with only `fontSize` overridden, which left the 30px step's
                    leading (34) and tracking (-0.66) sitting on a 24px line:
                    the size was right and everything around it was not. */}
                <Text style={[displayAt(700, 24, 1.12), { color: c.fg }]}>{dish.name}</Text>

                <View style={s.priceRow}>
                  {/* 17px/600 — `dc.html:267`; `text.body` drew it at 15, the
                      same size as the section headings below it. The currency
                      word stays here: the design writes `{{det.p}} {{t.som}}`
                      on this line and a bare figure only on the footer total
                      (`dc.html:318`). */}
                  <Text style={[sansAt(600, 17), text.num, { color: c.fg }]}>
                    {som(dish.price, lang)}
                  </Text>
                  {weight === null ? null : (
                    <>
                      <View style={[s.hair, { backgroundColor: c.border }]} />
                      <Text style={[text.small, text.num, { color: c.fgSubtle }]}>{weight}</Text>
                    </>
                  )}
                </View>

                {/* The description is a paragraph of its own — `dc.html:268`,
                    14px/1.6 in `--fg-muted`, directly under the price — not a
                    line inside the "Tarkibi" card.

                    The design draws both and feeds them from two different
                    fields: `det.desc` in this paragraph, `det.ing` in the card
                    below it (`dc.html:270-273`). This platform publishes only
                    the first: `menu.menu_items` has a `description` column and
                    no ingredient column, so `GET /v1/public/menu` has nothing
                    to put in that card. Printing the description under a
                    heading that reads "Composition" answered a question the
                    screen had not been told the answer to — and it is the kind
                    of question somebody asks because of an allergy. The card
                    comes back the day the column does, not before. */}
                {dish.description === '' ? null : (
                  <Text style={[sansAt(400, 14, 1.6), s.desc, { color: c.fgMuted }]}>
                    {dish.description}
                  </Text>
                )}

                <View
                  style={[
                    s.block,
                    s.allergens,
                    {
                      backgroundColor: c.warning50,
                      borderColor: c.border,
                      borderLeftColor: c.warning500,
                      borderRadius: 12,
                    },
                  ]}
                >
                  <View style={s.allergenHead}>
                    <Alert size={15} colour={c.warning600} />
                    <Text style={[text.small, { color: c.warning600, ...sans(600) }]}>
                      {t.dish.allergens}
                    </Text>
                  </View>

                  {/* The body is the same `--warning-600` as its heading —
                      `dc.html:281`. It was `warning700`, a darker tone the
                      design does not use in this card. */}
                  <Text style={[sansAt(400, 13, 1.6), { color: c.warning600, marginTop: 4 }]}>
                    {dish.allergens.length === 0
                      ? t.dish.noAllergens
                      : dish.allergens
                          .map((slug) => allergenLabels[slug]?.[lang] ?? slug)
                          .join(', ')}
                  </Text>
                </View>

                {questions.map((question) => {
                  const taken = question.options.filter((option) =>
                    picked.includes(option.id),
                  ).length;
                  const full = taken >= question.max;

                  return (
                    <View key={question.id}>
                      <View style={s.sectionHead}>
                        <Text style={[text.body, { color: c.fg, ...sans(600) }]}>
                          {question.title}
                        </Text>
                        {/* Only the optional ones are labelled. There is no
                            word for "required" in this catalogue, and inventing
                            one in a component is how a fourth language ends up
                            with an Uzbek sentence in it. */}
                        {question.optional ? (
                          <Text style={[text.caption, { color: c.fgSubtle }]}>
                            {t.dish.optional}
                          </Text>
                        ) : null}
                      </View>

                      <View style={s.addons}>
                        {question.options.map((option) => {
                          const on = picked.includes(option.id);
                          /* Past the ceiling and not one of the chosen: drawn
                             flat and refused, rather than tappable and ignored.
                             A guest who taps and sees nothing happen concludes
                             the phone is broken. A single-answer question never
                             blocks — the tap moves the answer. */
                          const blocked = !on && full && !question.single;

                          return (
                            <Pressable
                              key={option.id}
                              accessibilityRole={question.single ? 'radio' : 'checkbox'}
                              accessibilityState={{ checked: on, disabled: blocked }}
                              disabled={blocked}
                              onPress={() =>
                                setPicked((current) => {
                                  if (on) return current.filter((id) => id !== option.id);

                                  /* One answer means the new one replaces the
                                     old, and only within this question — the
                                     other groups' answers are not this
                                     question's business. */
                                  const others = question.single
                                    ? current.filter(
                                        (id) => !question.options.some((entry) => entry.id === id),
                                      )
                                    : current;

                                  return [...others, option.id];
                                })
                              }
                              style={({ pressed }) => [
                                s.addon,
                                {
                                  backgroundColor: on ? c.brand50 : c.surface,
                                  borderColor: on ? c.brand200 : c.border,
                                  borderRadius: 12,
                                },
                                blocked && s.blocked,
                                pressed && PRESSED,
                              ]}
                            >
                              <View
                                style={[
                                  s.tick,
                                  {
                                    borderColor: on ? c.brand500 : c.n300,
                                    backgroundColor: on ? c.brand500 : 'transparent',
                                    borderRadius: question.single ? size.radiusPill : size.radiusSm,
                                  },
                                ]}
                              >
                                {on ? <Check colour={c.n0} /> : null}
                              </View>

                              {/* 14px/500 and `flex:1` — `dc.html:297`. It was
                                  13px on `s.grow`, which is `flexGrow: 0`: the
                                  label never took the free space, so the price
                                  hugged the end of the name instead of sitting
                                  against the right edge of the row. */}
                              <Text style={[sansAt(500, 14), s.label, { color: c.fg }]}>
                                {option.label}
                              </Text>

                              {/* A free option prints an em dash rather than
                                  `+0` — "no tail fat" is an instruction to the
                                  kitchen, not a thing to buy. A negative delta
                                  keeps its own sign: a small cup is a discount
                                  and reads as one.

                                  No currency word in this column: the design
                                  builds it as `"+" + f(m.p)` (`dc.html:830`),
                                  a bare figure. "+18 000 so'm" wrapped to two
                                  lines in a column the row gives no width to,
                                  and repeated the word once per add-on beside
                                  a price that already carries it. */}
                              <Text style={[text.small, text.num, { color: c.fgMuted }]}>
                                {option.price === 0
                                  ? '—'
                                  : option.price < 0
                                    ? `−${som(-option.price, lang, false)}`
                                    : `+${som(option.price, lang, false)}`}
                              </Text>
                            </Pressable>
                          );
                        })}
                      </View>
                    </View>
                  );
                })}

                <View style={s.sectionHead}>
                  <Text style={[text.body, { color: c.fg, ...sans(600) }]}>{t.dish.note}</Text>
                  {/* The counter counts up to the ceiling rather than down from
                      it, as the design draws it: a bare "83" says nothing about
                      how much room is left. */}
                  <Text style={[text.caption, text.num, { color: c.fgSubtle }]}>
                    {note.length} / {NOTE_MAX}
                  </Text>
                </View>

                <TextInput
                  value={note}
                  onChangeText={setNote}
                  maxLength={NOTE_MAX}
                  multiline
                  numberOfLines={2}
                  placeholder={t.dish.notePlaceholder}
                  placeholderTextColor={c.fgSubtle}
                  /* 14px/1.5 — `dc.html:310`; `text.small` typed the guest's
                     own note at 13, smaller than the label above it. */
                  style={[
                    sansAt(400, 14, 1.5),
                    s.note,
                    { color: c.fg, borderColor: c.border, borderRadius: 12 },
                  ]}
                />
              </View>
            </ScrollView>

            {/* `padding:14px 20px 20px` — `dc.html:312`. `Math.max` rather
                than a sum: a phone with no home indicator gets the design's 20,
                and one with an indicator gets the indicator. Adding the two
                gave 12 on the first and 46 on the second, neither of them a
                number the design writes. */}
            <View
              style={[
                s.footer,
                { borderColor: c.border, paddingBottom: Math.max(insets.bottom, size.sp5) },
              ]}
            >
              <View style={[s.stepper, { borderColor: c.border, borderRadius: 12 }]}>
                <Pressable
                  onPress={() => setQuantity((n) => Math.max(1, n - 1))}
                  accessibilityRole="button"
                  accessibilityLabel={t.dish.decrease}
                  style={({ pressed }) => [s.step, pressed && PRESSED]}
                >
                  {/* 19px/600 in the body face, and `--n-300` once it is spent
                      — `dc.html:314` with `decFg` at `dc.html:989`. It was
                      `text.title`: 20px of Inter Tight, in `--fg-disabled`,
                      which is the paler `--n-400`. */}
                  <Text style={[text.stepper, { color: quantity > 1 ? c.fgMuted : c.n300 }]}>
                    −
                  </Text>
                </Pressable>

                <Text style={[text.body, text.num, s.stepValue, { color: c.fg, ...sans(600) }]}>
                  {quantity}
                </Text>

                <Pressable
                  onPress={() => setQuantity((n) => Math.min(20, n + 1))}
                  accessibilityRole="button"
                  accessibilityLabel={t.dish.increase}
                  style={({ pressed }) => [
                    s.step,
                    { backgroundColor: c.bgMuted, borderRadius: 9 },
                    pressed && PRESSED,
                  ]}
                >
                  <Text style={[text.stepper, { color: c.fg }]}>+</Text>
                </Pressable>
              </View>

              {/* The number moves with the stepper — nobody should be
                  multiplying a price by three while deciding. */}
              <Pressable
                onPress={commit}
                accessibilityRole="button"
                accessibilityState={{ disabled: unanswered }}
                disabled={unanswered}
                style={({ pressed }) => [
                  s.commit,
                  { backgroundColor: unanswered ? c.n300 : c.n900, borderRadius: 13 },
                  pressed && PRESSED,
                ]}
              >
                {/* `{{t.addFor}} {{detTotal}}` where `detTotal = f(detSum)` —
                    `dc.html:318`, a bare figure. The word belongs to the price
                    at the top of the sheet; repeated on a 48px button beside a
                    stepper it pushed "Qo'shish · 152 000 so'm" onto a second
                    line. */}
                <Text style={[text.body, { color: c.n0, ...sans(600) }]}>
                  {t.dish.add} {som(unitPrice * quantity, lang, false)}
                </Text>
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  stage: { flex: 1, justifyContent: 'flex-end' },
  scrim: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, opacity: 0.5 },
  lift: { maxHeight: '100%' },
  sheet: { overflow: 'hidden' },
  grow: { flexGrow: 0, flexShrink: 1 },
  body: { paddingBottom: size.sp5 },
  pad: { paddingHorizontal: size.sp5, paddingTop: size.sp5 },
  band: {
    height: 200,
    alignItems: 'center',
    justifyContent: 'center',
    borderBottomWidth: 1,
  },
  back: {
    position: 'absolute',
    top: 16,
    left: 16,
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    opacity: 0.92,
  },
  priceRow: { flexDirection: 'row', alignItems: 'center', gap: 9, marginTop: 7 },
  hair: { width: 1, height: 12 },
  desc: { marginTop: 12 },
  /* `padding:13px 15px` — `dc.html:272` and `:278`. It was 14 on all four
     sides, which is neither of the design's two numbers. */
  block: { marginTop: 18, paddingVertical: 13, paddingHorizontal: 15, borderWidth: 1 },
  /* The 10px gap this used to carry was the gap between the two cards. With no
     card above it any more (see the description paragraph), the allergen block
     sits where the design's first card sits: `s.block`'s 18. */
  allergens: { borderLeftWidth: 3 },
  allergenHead: { flexDirection: 'row', alignItems: 'center', gap: size.sp2 },
  sectionHead: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: size.sp3,
    marginTop: size.sp5,
  },
  addons: { gap: size.sp2, marginTop: 10 },
  /* `padding:12px 14px` — `dc.html:290`. There was no vertical padding at all;
     a `minHeight: 44` stood in for it, which sets a floor rather than a shape:
     a two-line add-on name got no room above or below it. The row measures 47
     with the design's own numbers, so the touch target is not what was buying
     the 44. */
  addon: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderWidth: 1,
  },
  label: { flex: 1 },
  tick: { width: 20, height: 20, alignItems: 'center', justifyContent: 'center', borderWidth: 1.6 },
  blocked: { opacity: 0.45 },
  note: {
    minHeight: 68,
    marginTop: 9,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderWidth: 1,
    textAlignVertical: 'top',
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    paddingHorizontal: size.sp5,
    paddingTop: 14,
    borderTopWidth: 1,
  },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 2, padding: 3, borderWidth: 1 },
  step: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  stepValue: { width: 26, textAlign: 'center' },
  commit: { flex: 1, height: 48, alignItems: 'center', justifyContent: 'center' },
});
