import { useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { copy, DISH, SHARED } from '@restaurant/surfaces/customer/copy';
import {
  DEFAULT_PORTION,
  MODIFIERS,
  NOTE_MAX,
  PORTIONS,
  say,
  type Dish,
  type Modifier,
  type ModifierGroup,
  type Trilingual,
} from '@restaurant/surfaces/customer/data';

import { DishPhoto } from '../ui/dish-photo';
import { PRESSED } from '../ui/primitives';
import { Check, Chevron, Photo, Star } from '../ui/icons';
import { useLocale } from '../lib/locale';
import { som } from '../lib/money';
import { useShadows, useTheme } from '../lib/theme-context';
import { raw, size } from '../theme';
import { display, displayAt, sans, sansAt, text, tracking } from '../type';
import type { CartLine } from '../lib/cart';

/**
 * One dish, configured — `Smart Restaurant Mijoz ilovasi.dc.html`, screen 4.
 *
 * **A `Modal`, not a route, and the reason is the URL.** The web build keeps this
 * at `/customer/menu?d={id}` — a sheet over the menu, not a screen of its own —
 * so a native route `/customer/dish/{id}` would be a segment the browser answers
 * with a 404. Push notifications and deep links are the only reason the two
 * route trees are kept identical, and inventing a segment on one side is exactly
 * the drift that rule exists to prevent. A `Modal` has no path, so there is
 * nothing to keep in step.
 *
 * The design gives a dish the whole viewport rather than a partial sheet, and it
 * is not an aesthetic choice: a portion picker, five extras, a note field and a
 * price footer do not fit in the 300px a 90%-height sheet leaves, above a strip
 * of dimmed menu nobody can use.
 *
 * The arithmetic here previews ONE line — dish + size delta + extras. What the
 * order comes to is `billTotals()` on the cart screen, in one place, mirroring
 * the server.
 *
 * ---------------------------------------------------------------------------
 * Two sheets, and only one of them can be ordered from
 *
 * `dish.groups` arrives on a LIVE dish and carries the kitchen's own questions
 * with the kitchen's own numeric option ids. `PORTIONS` and `MODIFIERS` are
 * three sizes and five extras invented for the demo, keyed by word, and
 * `POST /api/v1/public/orders` refuses a choice it never offered — so these are
 * not two styles of one control: one produces a basket a restaurant can cook and
 * the other produces a basket the server sends back.
 *
 * A live dish therefore has NO size buttons unless its kitchen offers a size
 * group. That is correct rather than missing: a size is a modifier on this
 * platform, priced by the kitchen, which is also why `lib/cart.ts` stops adding
 * `portion.delta` the moment a dish carries groups.
 *
 * ---------------------------------------------------------------------------
 * Two shapes this screen had wrong, and both would be re-introduced by habit
 *
 * **It opens on a 236px picture, not on a header strip.** `Mijoz ilovasi:302`
 * is `position:relative;height:236px` holding the image slot, with the back
 * control floating ON it — `left:16px;top:12px`, a 36px circle in
 * `rgba(255,255,255,.92)` under `--shadow-md`. The app drew a bordered header
 * bar with a bare 44px chevron in it and started the page at the dish name, so
 * the one screen in the customer app that is meant to be about a photograph
 * showed no image area at all.
 *
 * **There is no footer bar.** `:350` puts the stepper and the add button inline
 * after the note field — `align-items:center;gap:16px;margin-top:22px` — with no
 * rule, no fill and no docking. The app pinned them to the bottom in a
 * `--surface` bar with a top border, which is the pattern the guest bill and the
 * marketplace cart use and this sheet does not: a dish page is short, and a
 * docked bar over a short page leaves a strip of nothing under the note.
 *
 * Every number below is quoted from that file with its line, so the next person
 * checks it in one grep rather than by eye.
 */

/**
 * The two sentences a live sheet needs and the catalogue does not have yet.
 *
 * `@restaurant/surfaces/customer/copy` is the catalogue and it is written for
 * the design's fixed sheet — three sizes and five optional extras, where no
 * group is required and none has a ceiling. A kitchen's own sheet has both, and
 * a guest who taps a sixth choice on a group that stops at five is owed the
 * reason. They live here until the catalogue takes them.
 */
const CHOOSE_ONE: Trilingual = {
  uz: 'Tanlang — {group}',
  ru: 'Выберите — {group}',
  en: 'Choose — {group}',
};

const AT_MOST: Trilingual = {
  uz: "Ko'pi bilan {n} ta",
  ru: 'Не более {n}',
  en: 'At most {n}',
};

export function DishSheet({
  dish,
  onClose,
  onAdd,
}: {
  dish: Dish | null;
  onClose: () => void;
  onAdd: (line: Omit<CartLine, 'key'>) => void;
}) {
  return (
    <Modal
      visible={dish !== null}
      animationType="slide"
      // Android's hardware back must close the sheet rather than leave the
      // customer stranded on a screen with no route behind it.
      onRequestClose={onClose}
    >
      {dish === null ? null : <Body dish={dish} onClose={onClose} onAdd={onAdd} />}
    </Modal>
  );
}

function Body({
  dish,
  onClose,
  onAdd,
}: {
  dish: Dish;
  onClose: () => void;
  onAdd: (line: Omit<CartLine, 'key'>) => void;
}) {
  const c = useTheme();
  const sh = useShadows();
  const { lang } = useLocale();
  const insets = useSafeAreaInsets();
  /* The hero runs the width of the window — the width its photograph is
     requested for. */
  const { width: heroWidth } = useWindowDimensions();
  const t = copy(DISH, lang);
  const s = copy(SHARED, lang);

  const [portionId, setPortionId] = useState<string>(DEFAULT_PORTION);
  const [modifierIds, setModifierIds] = useState<readonly string[]>([]);
  const [quantity, setQuantity] = useState(1);
  const [note, setNote] = useState('');

  const groups = dish.groups ?? null;

  const portion = groups === null ? PORTIONS.find((entry) => entry.id === portionId) : undefined;
  const extras: readonly Modifier[] =
    groups === null
      ? MODIFIERS.filter((modifier) => modifierIds.includes(modifier.id))
      : groups.flatMap((group) =>
          group.choices.filter((choice) => modifierIds.includes(choice.id)),
        );

  const unit =
    dish.price + (portion?.delta ?? 0) + extras.reduce((sum, modifier) => sum + modifier.price, 0);

  /**
   * Take or drop one choice, by the group's own rules.
   *
   * `multi: false` replaces rather than adds — a size is one answer, and a
   * checkbox where the kitchen asked a radio produces a line the server
   * refuses. `max` stops the list rather than silently dropping the oldest
   * choice, because a guest who taps a sixth extra and watches the first one
   * vanish has been given a puzzle. Both numbers are the kitchen's and both are
   * enforced again server-side; this is so the answer arrives at the tap rather
   * than at the checkout.
   */
  const toggle = (group: ModifierGroup, choiceId: string) =>
    setModifierIds((current) => {
      if (current.includes(choiceId)) return current.filter((id) => id !== choiceId);

      const mine = group.choices.map((choice) => choice.id);
      const others = current.filter((id) => !mine.includes(id));
      const same = current.filter((id) => mine.includes(id));

      if (!group.multi) return [...others, choiceId];

      return same.length >= group.max ? current : [...current, choiceId];
    });

  /*
   * The first question this kitchen asked that has not been answered.
   *
   * A group with `min: 1` is a choice a guest cannot skip — a size, a base, a
   * sauce — and the server refuses the line without it. Naming the group under
   * a disabled button is the difference between "why can I not add this" and an
   * instruction.
   */
  const unmet =
    (groups ?? []).find(
      (group) =>
        group.min > 0 &&
        group.choices.filter((choice) => modifierIds.includes(choice.id)).length < group.min,
    ) ?? null;

  return (
    <View style={[st.fill, { backgroundColor: c.bg }]}>
      <ScrollView
        contentContainerStyle={[st.body, { paddingBottom: insets.bottom + 24 }]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* ---------------------------------------------------------- hero */}
        {/*
         * `position:relative;height:236px` with the image slot in it — :302.
         *
         * The design's frame puts its 46px status strip ABOVE the scroller, so
         * the band starts under the notch rather than bleeding through it; on a
         * phone that strip is `insets.top` of page background.
         *
         * A dish with a photograph fills the band with it, at the band's own
         * height; one without draws exactly what the design's own slot draws
         * in that state: the band at its full height with the 28px picture
         * mark centred in it (`image-slot.js` empty branch). Not a grey loading
         * rectangle, and not a stock photo of somebody else's food.
         */}
        <View style={[st.hero, { paddingTop: insets.top, backgroundColor: c.bg }]}>
          <View style={[st.heroBand, { backgroundColor: c.bgMuted }]}>
            <DishPhoto
              image={dish.image ?? null}
              width={heroWidth}
              height={236}
              fill
              fallback={<Photo size={28} />}
              accessibilityLabel={say(dish.name, lang)}
            />
          </View>

          {/* `left:16px;top:12px;width:36px;height:36px;border-radius:50%;
              background:rgba(255,255,255,.92);color:var(--n-900);
              box-shadow:var(--shadow-md)` — :304. White in both themes, because
              it floats on a photograph rather than on the page. */}
          <Pressable
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel={s.back}
            /* The design draws 36; a thumb wants 44. Slop, never a taller box —
               the same trade `ui/primitives` makes for every small control. */
            hitSlop={8}
            style={({ pressed }) => [
              st.back,
              { top: insets.top + 12, boxShadow: sh.md },
              pressed && PRESSED,
            ]}
          >
            <Chevron direction="left" size={18} colour={c.n900} />
          </Pressable>
        </View>

        <View style={st.pad}>
          {/* `align-items:flex-start;justify-content:space-between;gap:14px` —
              :309. The price belongs on the title's line: the design prints it
              once, up here, and the button at the foot carries the LINE total
              (size + extras × quantity), which is a different number. The app
              showed only the button's, so a guest could not see what the plate
              costs before configuring it. */}
          <View style={st.titleRow}>
            <View style={st.titleCol}>
              {/* `--text-2xl` (24px) at 700, `--tracking-tight`, `line-height:1.15`
                  — :311. It was `text.display`, which is the 30px `at.auth`
                  heading: a whole step too large for a screen title. */}
              <Text style={[st.name, { color: c.fg }]}>{say(dish.name, lang)}</Text>

              <View style={st.meta}>
                {/* The star, its figure and the count go together or not at all. A
                    live dish has no rating — CRM stores feedback about a visit, not
                    about a plate — and "★  (0 baho)" is a score a restaurant never
                    earned, printed next to its food. */}
                {dish.rating === '' ? null : (
                  <>
                    <Star size={13} />
                    <Text style={[st.metaFig, text.num, { color: c.fg }]}>{dish.rating}</Text>
                    <Text style={[st.metaSub, text.num, { color: c.fgSubtle }]}>
                      ({dish.reviews} {t.ratings})
                    </Text>
                  </>
                )}
                {dish.calories === 0 ? null : (
                  <>
                    {/* `width:3px;height:3px;border-radius:999px;
                        background:var(--fg-disabled)` — :316. A drawn dot, not a
                        "·" set in the running text: the character rides the
                        baseline of a 13px line and the design's sits on the
                        row's centre. */}
                    {dish.rating === '' ? null : (
                      <View style={[st.dot, { backgroundColor: c.fgDisabled }]} />
                    )}
                    <Text style={[st.metaSub, text.num, { color: c.fgSubtle }]}>
                      {dish.calories} kcal
                    </Text>
                  </>
                )}
              </View>
            </View>

            {/* `flex:none;font-family:var(--font-display);--text-xl (20px);700` —
                :320. No `letter-spacing` on this one, unlike the heading above
                it. */}
            <Text style={[st.price, text.num, { color: c.fg }]}>{som(dish.price, lang)}</Text>
          </View>

          <Text style={[st.desc, { color: c.fgMuted }]}>{say(dish.description, lang)}</Text>

          {/* ----------------------------------------------------- portion */}
          {/* Only on a fixture dish. A live kitchen prices its own sizes inside
              `groups`, and drawing these three over them would offer a size at a
              price this restaurant never set. */}
          {groups === null ? (
            <>
              <Text style={[st.legend, { color: c.fgSubtle }]}>{t.size}</Text>

              {/* `display:flex;gap:9px` — :325. */}
              <View style={st.portions}>
                {PORTIONS.map((entry) => {
                  const on = entry.id === portionId;

                  return (
                    <Pressable
                      key={entry.id}
                      onPress={() => setPortionId(entry.id)}
                      accessibilityRole="radio"
                      accessibilityState={{ selected: on }}
                      style={({ pressed }) => [
                        st.portion,
                        /* `[data-opt][data-on="true"]{border-color:var(--brand-500);
                           background:var(--brand-50)}` — the file's own stylesheet,
                           :64. The tile TINTS; it does not invert. The app filled it
                           solid `--brand-500` and flipped both lines to white, which
                           is what a chip does — and next to two untinted neighbours
                           it read as a different control rather than as a chosen
                           one. The label stays `--fg` either way (:328). */
                        on
                          ? { borderColor: c.brand500, backgroundColor: c.brand50 }
                          : { borderColor: c.border, backgroundColor: c.surface },
                        { borderRadius: size.radiusMd },
                        pressed && PRESSED,
                      ]}
                    >
                      {/* `--text-sm` (13px) at 600 — :328. */}
                      <Text style={[st.portionName, { color: c.fg }]}>{say(entry.name, lang)}</Text>
                      {/* `--text-2xs` (11px), `margin-top:3px` — :329.
                          "+12 000", never "+12000": the design groups every figure it
                          prints, and an ungrouped five-digit price is the one a reader
                          mistakes by a factor of ten. */}
                      <Text style={[st.portionDelta, text.num, { color: c.fgSubtle }]}>
                        {entry.delta === 0
                          ? t.base
                          : `${entry.delta > 0 ? '+' : '−'}${som(Math.abs(entry.delta), lang, false)}`}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </>
          ) : null}

          {/* ------------------------------------------------------ extras */}
          {/*
           * The kitchen's own questions when there are any, and the design's one
           * list of extras when there are not. The fixture list is wrapped as a
           * single optional multi-choice group so both paths draw through one
           * component and cannot drift apart.
           */}
          {(
            groups ?? [
              {
                id: 'extras',
                title: null,
                multi: true,
                min: 0,
                max: MODIFIERS.length,
                choices: MODIFIERS,
              },
            ]
          ).map((group) => {
            const taken = group.choices.filter((choice) => modifierIds.includes(choice.id)).length;

            return (
              <View key={group.id}>
                {/* `margin:22px 0 4px` on this one — the rows carry 12px of
                    their own above the first label — :334. */}
                <Text style={[st.legend, st.legendTight, { color: c.fgSubtle }]}>
                  {group.title === null ? t.extras : say(group.title, lang)}
                </Text>

                {group.choices.map((modifier) => {
                  const on = modifierIds.includes(modifier.id);

                  return (
                    <Pressable
                      key={modifier.id}
                      onPress={() =>
                        groups === null
                          ? setModifierIds((current) =>
                              on
                                ? current.filter((id) => id !== modifier.id)
                                : [...current, modifier.id],
                            )
                          : toggle(group as ModifierGroup, modifier.id)
                      }
                      accessibilityRole={group.multi ? 'checkbox' : 'radio'}
                      accessibilityState={group.multi ? { checked: on } : { selected: on }}
                      /* `padding:12px 0;gap:12px;border-bottom:1px solid
                         var(--divider)` — :336. The rule is on EVERY row, the
                         last one included, and it is 1 point: the app skipped
                         the last row and drew the rest at `hairlineWidth`,
                         which is 0.33 at @3x — a third of the weight the design
                         asks for. */
                      style={({ pressed }) => [
                        st.extra,
                        { borderBottomColor: c.divider },
                        pressed && PRESSED,
                      ]}
                    >
                      {/* `width:21px;height:21px;border:1.6px;border-radius:6px`,
                          filled `--brand-500` when on and outlined
                          `--border-strong` when off — :337 and the script at
                          :1019–:1020. The rounded square is the design's for every
                          extra it draws, because every extra it draws is a
                          checkbox.

                          The pill is kept for `multi:false` and that is
                          deliberate rather than left over: a kitchen's own sheet
                          asks single-choice questions the design's fixture never
                          has, and a round box is the one shape a phone user
                          reads as "one of these" before reading the label. Same
                          21px, same 1.6px rule — only the corner differs. */}
                      <View
                        style={[
                          st.box,
                          {
                            backgroundColor: on ? c.brand500 : 'transparent',
                            borderColor: on ? c.brand500 : c.borderStrong,
                            borderRadius: group.multi ? 6 : size.radiusPill,
                          },
                        ]}
                      >
                        {on ? <Check size={12} /> : null}
                      </View>

                      {/* `flex:1;min-width:0;--text-md` (15px) in `--fg` — :342. */}
                      <Text style={[st.extraName, { color: c.fg }]}>
                        {say(modifier.name, lang)}
                      </Text>

                      {/* `--text-sm` (13px) at 600 in `--fg-muted` — :343.
                          "bepul" belongs to the design's extras, where a free
                          one is a free ADDITION — "piyozsiz" costs nothing and
                          the word says so. A kitchen's own sheet prices its base
                          size at zero too, and "O'rta · bepul" reads as an offer
                          rather than as the price it is, so a live zero is drawn
                          as nothing at all. */}
                      {modifier.price === 0 && groups !== null ? null : (
                        <Text style={[st.extraPrice, text.num, { color: c.fgMuted }]}>
                          {modifier.price === 0 ? s.free : `+${som(modifier.price, lang, false)}`}
                        </Text>
                      )}
                    </Pressable>
                  );
                })}

                {/* The ceiling, stated once it is the reason a tap did nothing. */}
                {group.multi && group.max < group.choices.length ? (
                  <Text style={[text.caption, { color: c.fgSubtle, marginTop: 6 }]}>
                    {say(AT_MOST, lang).replace('{n}', String(group.max))}
                    {taken >= group.max ? ` · ${taken}/${group.max}` : ''}
                  </Text>
                ) : null}
              </View>
            );
          })}

          {/* -------------------------------------------------------- note */}
          <Text style={[st.legend, { color: c.fgSubtle }]}>{t.note}</Text>

          {/* `height:46px;padding:0 14px;border:1px solid var(--border-strong);
              --text-sm` (13px) — :348. A field a guest types into is drawn a
              step stronger than a divider, and this one was on `--border` at
              48px with 15px body copy in it. */}
          <TextInput
            value={note}
            onChangeText={setNote}
            maxLength={NOTE_MAX}
            placeholder={t.notePlaceholder}
            placeholderTextColor={c.fgSubtle}
            style={[
              st.input,
              {
                backgroundColor: c.surface,
                borderColor: c.borderStrong,
                color: c.fg,
                borderRadius: size.radiusMd,
              },
            ]}
          />

          {/* ---------------------------------------------------- the foot */}
          {/* `align-items:center;gap:16px;margin-top:22px` — :350. Inline after
              the note, in the scroller. See the module note for why there is no
              docked bar here. */}
          <View style={st.footRow}>
            {/* `gap:12px;padding:5px;border:1px solid var(--border);
                border-radius:var(--radius-pill)` — :351. It was a 10pt-radius
                box, so the design's lozenge read as a plain input frame.

                One stepper that stops at one. Removing a line is the basket's own
                named control, not a minus pressed once more. */}
            <View style={[st.stepper, { borderColor: c.border, backgroundColor: c.surface }]}>
              <Step label="−" onPress={() => setQuantity((n) => Math.max(1, n - 1))} />
              {/* `min-width:22px;font-family:display;--text-lg` (17px) at 700 —
                  :353. */}
              <Text style={[st.count, text.num, { color: c.fg }]}>{quantity}</Text>
              <Step label="+" onPress={() => setQuantity((n) => Math.min(20, n + 1))} />
            </View>

            {/* `flex:1;height:52px;border:0;radius md;background:var(--brand-500)`
                holding TWO spans at `gap:9px` — the label, then the total at
                `opacity:.85` — :357. The shared `Button` puts its children in one
                line of text, which cannot carry a gap or a second opacity, so
                this one is drawn here; everything else about it is the primary
                the primitive draws. The app joined the two with " · " and lost
                the design's separation between what the button does and what it
                will cost. */}
            <Pressable
              accessibilityRole="button"
              disabled={dish.soldOut || unmet !== null}
              accessibilityLabel={`${t.addToCart} · ${som(unit * quantity, lang)}`}
              onPress={() =>
                onAdd({
                  dishId: dish.id,
                  // A live line has no size of its own — see the module note — so
                  // it carries the default, which is the one with a zero delta.
                  portionId: groups === null ? portionId : DEFAULT_PORTION,
                  modifierIds,
                  quantity,
                  note: note.trim(),
                })
              }
              style={({ pressed }) => [
                st.add,
                { backgroundColor: c.brand500 },
                pressed && PRESSED,
                (dish.soldOut || unmet !== null) && st.disabled,
              ]}
            >
              <Text style={[st.addLabel, { color: c.n0 }]} numberOfLines={1}>
                {t.addToCart}
              </Text>
              <Text style={[st.addSum, text.num, { color: c.n0 }]} numberOfLines={1}>
                {som(unit * quantity, lang)}
              </Text>
            </Pressable>
          </View>

          {unmet === null ? null : (
            <Text style={[text.caption, st.soldOut, { color: c.fgSubtle }]}>
              {say(CHOOSE_ONE, lang).replace('{group}', say(unmet.title, lang))}
            </Text>
          )}

          {dish.soldOut ? (
            <Text style={[text.caption, st.soldOut, { color: c.fgSubtle }]}>{t.soldOutBody}</Text>
          ) : null}
        </View>
      </ScrollView>
    </View>
  );
}

/**
 * `width:38px;height:38px;border:0;border-radius:50%;background:var(--bg-muted);
 * color:var(--fg);font-size:19px;font-weight:600;line-height:1` — :352.
 *
 * A filled circle, not a bare 44x48 slot: the app drew the glyph on nothing, in
 * `--fg-muted`, so the two halves of the stepper had no shape of their own and
 * the control read as one wide box with a number in it.
 */
function Step({ label, onPress }: { label: string; onPress: () => void }) {
  const c = useTheme();

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [st.step, { backgroundColor: c.bgMuted }, pressed && PRESSED]}
    >
      <Text style={[text.stepper, { color: c.fg }]}>{label}</Text>
    </Pressable>
  );
}

/**
 * `Smart Restaurant Mijoz ilovasi.dc.html`, the `at.item` block — :300–:362.
 *
 * Every value below is the literal the file writes, not a step off a scale:
 * `size.sp5` is 20 and the design writes 20, but `size.sp3` is 12 where the
 * design writes 14, and `1` is 0.33 at @3x where the
 * design writes 1px. The rounded ones are what made this screen read as a
 * different drawing.
 */
const st = StyleSheet.create({
  fill: { flex: 1 },

  /* `padding:0 0 24px` on the screen — :301. The bottom is 24 plus whatever the
     home indicator takes, since this scroller now ends the page. */
  body: { paddingBottom: 24 },
  /* `padding:18px 20px 0` on the block under the hero — :308. */
  pad: { paddingTop: 18, paddingHorizontal: 20 },

  /* `position:relative;height:236px` — :302. */
  hero: { position: 'relative' },
  heroBand: { height: 236, alignItems: 'center', justifyContent: 'center' },
  back: {
    position: 'absolute',
    left: 16,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,.92)',
    alignItems: 'center',
    justifyContent: 'center',
  },

  /* `align-items:flex-start;justify-content:space-between;gap:14px` — :309. */
  titleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 14,
  },
  titleCol: { flex: 1, minWidth: 0 },
  /* `--text-2xl` (24px) at 700, `--tracking-tight`, `line-height:1.15` — :311. */
  name: displayAt(700, 24),
  /* `--text-xl` (20px) at 700 in the display face — :320. Spelled out rather
     than through `displayAt`, because this span declares no `letter-spacing` at
     all and that helper always supplies one: the design sets Inter Tight tight
     nearly everywhere, and this price is the exception. */
  price: { ...display(700), fontSize: 20, lineHeight: 24, flexShrink: 0 },

  /* `align-items:center;gap:6px;margin-top:7px` — :312. */
  meta: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 7 },
  metaFig: sansAt(600, 13),
  metaSub: sansAt(400, 13),
  /* `width:3px;height:3px;border-radius:999px` — :316. */
  dot: { width: 3, height: 3, borderRadius: 999 },

  /* `margin:14px 0 0;font-size:--text-md (15px);line-height:1.55` — :322. It was 13px
     `text.small` at 12 from the name, so the one paragraph on the page that
     describes the food was set smaller and tighter than the design draws it. */
  desc: { ...sansAt(400, 15, 1.55), marginTop: 14 },

  /* `--text-2xs` (11px) at 600, `--tracking-caps`, uppercase, `margin:22px 0 9px`
     — :324. NOT `text.caps`: that preset is the design's OTHER micro-label, the
     10px one, and this screen's three section legends are 11. */
  legend: {
    ...sansAt(600, 11, 1.25),
    letterSpacing: tracking(raw.trackingCaps, 11),
    textTransform: 'uppercase',
    marginTop: 22,
    marginBottom: 9,
  },
  legendTight: { marginBottom: 4 },

  /* `display:flex;gap:9px` — :325. */
  portions: { flexDirection: 'row', gap: 9 },
  /* `flex:1;padding:11px 10px;border:1px solid;text-align:center` — :327. It was
     a 52px-tall unbordered tile with 6px of padding, which is a different
     control: the design's size button is sized by its two lines, not by a
     minimum height. */
  portion: {
    flex: 1,
    paddingVertical: 11,
    paddingHorizontal: 10,
    borderWidth: 1,
    alignItems: 'center',
  },
  portionName: sansAt(600, 13),
  portionDelta: { ...sansAt(400, 11), marginTop: 3 },

  /* `align-items:center;gap:12px;padding:12px 0;border-bottom:1px solid` — :336. */
  extra: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  /* `width:21px;height:21px;border:1.6px;border-radius:6px` — :337. */
  box: { width: 21, height: 21, borderWidth: 1.6, alignItems: 'center', justifyContent: 'center' },
  extraName: { ...sansAt(400, 15), flex: 1, minWidth: 0 },
  extraPrice: sansAt(600, 13),

  /* `height:46px;padding:0 14px;border:1px solid;--text-sm` (13px) — :348. No
     `lineHeight` on a `TextInput`: Android measures the field from it and clips
     the descenders of a 13px line inside a 46px box. */
  input: { height: 46, paddingHorizontal: 14, borderWidth: 1, ...sans(400), fontSize: 13 },

  /* `align-items:center;gap:16px;margin-top:22px` — :350. */
  footRow: { flexDirection: 'row', alignItems: 'center', gap: 16, marginTop: 22 },
  /* `gap:12px;padding:5px;border:1px solid;border-radius:var(--radius-pill)` —
     :351. */
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 5,
    borderWidth: 1,
    borderRadius: size.radiusPill,
  },
  /* `width:38px;height:38px;border-radius:50%` — :352. */
  step: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  /* `min-width:22px;text-align:center;display face;--text-lg` (17px) at 700 —
     :353. No `lineHeight`: the design declares none, and the circle beside it
     sets the row's height. */
  count: { ...display(700), fontSize: 17, minWidth: 22, textAlign: 'center' },
  /* `flex:1;height:52px;gap:9px;justify-content:center` — :356. */
  add: {
    flex: 1,
    height: 52,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 9,
    borderRadius: size.radiusMd,
  },
  /* `--text-md` (15px) at 600, and the total at `opacity:.85` — :356–:357.
     The label shrinks and the figure does not: in a browser both spans shrink
     by default, but RN's default is `flexShrink:0`, so a long Russian label
     would push the price out of a 52px button rather than ellipsise. */
  addLabel: { ...text.button, flexShrink: 1 },
  addSum: { ...text.button, opacity: 0.85 },
  /* The primitive's own disabled step, kept so this button and every other CTA
     in the app dim by the same amount. */
  disabled: { opacity: 0.45 },

  soldOut: { textAlign: 'center', marginTop: size.sp2 },
});
