import { useRouter, type Href } from 'expo-router';
import { useState } from 'react';
import { FlatList, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { copy, FLASH, MORE_COPY, QUEUE_COPY, SHARED } from '@restaurant/surfaces/crew/copy';
import { MORE, say, type CrewRole, type Lang, type MoreRow } from '@restaurant/surfaces/crew/data';

import { useTheme, useThemeChoice, type ThemeChoice } from '../../lib/theme-context';
import { size } from '../../theme';
import { sans, sansAt, text } from '../../type';
import { Button, PRESSED, Segmented } from '../../ui/primitives';
import { Note } from '../bits';
import { DOCK_HEIGHT } from '../chrome';
import { ChevronIcon } from '../icons';
import { useFlash } from '../flash';
import { clearQueue, useQueueDepth } from '../queue';
import { signOut } from '../session';

/**
 * The honest index of everything else this role can do.
 *
 * More is a real screen here rather than an overflow menu, and that follows from
 * the dock being four slots: what does not fit has to land somewhere a person
 * can read, with a sentence under each row saying what it is for.
 *
 * **Every row is drawn the same.** The design's More list is one shape repeated —
 * label, note, chevron, rule — and nothing else: `Smart Restaurant Xodimlar
 * ilovasi.dc.html`:993–1000. This screen used to sort its rows into three kinds
 * and chip them accordingly ("kompyuterda", "hali yo'q", a queue counter), which
 * is three vocabularies to learn before a person can read a menu of four lines.
 * A desktop row is indistinguishable until it is pressed, and then it says where
 * the work lives — which is the answer to the only question it provokes.
 */
export function MorePanel({ lang, role }: { lang: Lang; role: CrewRole }) {
  const palette = useTheme();
  const t = copy(MORE_COPY, lang);
  const f = copy(FLASH, lang);
  const queue = copy(QUEUE_COPY, lang);
  const flash = useFlash();
  const router = useRouter();
  const depth = useQueueDepth();

  const [asking, setAsking] = useState(false);
  const [leaving, setLeaving] = useState(false);

  async function leave() {
    setLeaving(true);

    // The queue belongs to the person who is leaving. A new PIN must not inherit
    // somebody else's unsent approvals.
    clearQueue();
    await signOut();

    flash(f.signedOut);
    setAsking(false);
    setLeaving(false);
    router.replace('/crew');
  }

  function open(row: MoreRow) {
    if (row.desktopOnly === true) {
      flash(f.desktopOnly);

      return;
    }

    if (row.id === 'switch') {
      setAsking(true);

      return;
    }

    if (row.href === undefined || !row.built) return;

    /*
     * `{role}` is filled in here, so the literal in `MORE_ROWS` is not a route
     * the compiler can match — `/crew/{role}/queue` becomes `/crew/waiter/queue`
     * only at run time. The cast is the boundary; `design-fidelity.test.ts`
     * asserts every row's destination actually exists.
     */
    router.push(row.href.replace('{role}', role) as Href);
  }

  return (
    <View style={s.fill}>
      <FlatList
        data={MORE[role]}
        keyExtractor={(row) => row.id}
        contentContainerStyle={s.page}
        showsVerticalScrollIndicator={false}
        renderItem={({ item }) => (
          <MoreLine
            row={item}
            lang={lang}
            /*
             * The queue's depth joins the row's own sentence instead of sitting
             * in a chip beside it. It is the only row whose value changes while
             * the app is open and the number is what makes somebody open it
             * before they walk out of Wi-Fi — but the design draws a More row as
             * label, note and chevron with nothing between them (design file
             * :993–1000), so the number goes where the words already are:
             * "Oflayn rejimda navbatga yozilganlar · 3 Kutmoqda".
             */
            tail={item.id === 'queue' && depth > 0 ? `${depth} ${queue.waiting}` : undefined}
            onPress={() => open(item)}
          />
        )}
        ItemSeparatorComponent={() => (
          <View style={[s.rule, { backgroundColor: palette.divider }]} />
        )}
        ListFooterComponent={
          <View>
            {/* The design puts `border-bottom` on every row including the last,
                and the closing note 18px below that rule — design file :993, 1002.
                A list that stops without one leaves the note attached to the row
                above it. */}
            <View style={[s.rule, { backgroundColor: palette.divider }]} />

            <AppearanceRow lang={lang} />

            <View style={[s.rule, { backgroundColor: palette.divider }]} />
            <Note>{t.note}</Note>
          </View>
        }
      />

      <Modal
        transparent
        visible={asking}
        animationType="slide"
        onRequestClose={() => setAsking(false)}
      >
        <EndSheet
          lang={lang}
          role={role}
          working={leaving}
          onCancel={() => setAsking(false)}
          onConfirm={() => void leave()}
        />
      </Modal>
    </View>
  );
}

/**
 * Day and night, on the one screen in this app that is about preferences.
 *
 * **Not from the design file, and worth saying why.** The staff mock does carry
 * a light/dark switch, but it sits in `[data-toolbar]` *outside*
 * `[data-phoneframe]` — the harness a designer flips while reviewing the mock,
 * alongside a Pin/Lock view picker that is plainly not a screen of the app. So
 * the file does not draw this control for the product; it is here because the
 * owner asked for it, and it goes where this app keeps settings rather than
 * where the review harness keeps its own.
 *
 * A row rather than a `MORE` entry. Every row in that table is a destination
 * with a `href`, and `more-fidelity.test.ts` holds it to that; a preference is
 * changed in place, and sending somebody to a screen to press one of three
 * words would be a navigation for a control that fits on the line.
 *
 * Three options, not a toggle. With two there is no way back to the phone's own
 * setting once either is tapped — a one-way door on the screen whose whole job
 * is preferences.
 */
function AppearanceRow({ lang }: { lang: Lang }) {
  const c = useTheme();
  const shared = copy(SHARED, lang);
  const { choice, setChoice } = useThemeChoice();

  return (
    <View style={s.appearance}>
      <View style={s.appearanceText}>
        <Text style={[text.small, s.appearanceLabel, { color: c.fg }]}>{shared.appearance}</Text>
        <Text style={[s.appearanceNote, { color: c.fgSubtle }]}>{shared.appearanceNote}</Text>
      </View>

      <Segmented
        options={[
          { value: 'light', label: shared.themeLight },
          { value: 'dark', label: shared.themeDark },
          { value: 'system', label: shared.themeSystem },
        ]}
        value={choice}
        onChange={(next: ThemeChoice) => setChoice(next)}
        style={s.appearanceSeg}
      />
    </View>
  );
}

function MoreLine({
  row,
  lang,
  tail,
  onPress,
}: {
  row: MoreRow;
  lang: Lang;
  tail?: string;
  onPress: () => void;
}) {
  const palette = useTheme();

  /* A row that goes nowhere and is not desktop work. The design has none — every
     one of its rows opens something or says where the work lives — so this is
     the guard for a row somebody adds later, not a state the drawing has. */
  const dead = !row.built && row.desktopOnly !== true;

  const note = tail === undefined ? say(row.note, lang) : `${say(row.note, lang)} · ${tail}`;

  return (
    <Pressable
      accessibilityRole="button"
      disabled={dead}
      onPress={onPress}
      style={({ pressed }) => [s.row, pressed && s.pressed, dead && s.dim]}
    >
      <View style={s.main}>
        <Text style={[text.small, s.label, { color: palette.fg }]} numberOfLines={1}>
          {say(row.label, lang)}
        </Text>
        <Text style={[s.note, { color: palette.fgSubtle }]} numberOfLines={2}>
          {note}
        </Text>
      </View>

      {/* On every row, the design's own size and colour: `width:17 height:17
          stroke:var(--fg-subtle)` — design file :999. It used to be 18px in
          `fg-disabled` and hidden on desktop rows, which is what made those
          rows read as unavailable. */}
      <ChevronIcon color={palette.fgSubtle} size={17} />
    </Pressable>
  );
}

/**
 * The sheet that ends a turn.
 *
 * It names what is **kept** as well as what ends, because that is the question a
 * waiter has when they press it mid-service: the open orders stay theirs, the
 * handset stays enrolled, and only the person signs out.
 */
function EndSheet({
  lang,
  role,
  working,
  onCancel,
  onConfirm,
}: {
  lang: Lang;
  role: CrewRole;
  working: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const palette = useTheme();
  const insets = useSafeAreaInsets();
  const t = copy(MORE_COPY, lang);

  // The sign-out row's own label and note are the sheet's title and body — one
  // source, so the sheet cannot promise something the menu did not.
  const row = MORE[role].find((entry) => entry.id === 'switch');

  return (
    <View style={s.scrim}>
      <Pressable style={s.scrimTap} accessibilityRole="button" onPress={onCancel} />

      <View
        style={[
          s.sheet,
          { backgroundColor: palette.surface, paddingBottom: insets.bottom + size.sp6 },
        ]}
      >
        <View style={[s.grabber, { backgroundColor: palette.borderStrong }]} />

        <Text style={[text.title, { color: palette.fg }]}>
          {row === undefined ? '' : say(row.label, lang)}
        </Text>
        <Text style={[text.caption, s.sheetBody, { color: palette.fgMuted }]}>
          {row === undefined ? '' : say(row.note, lang)}
        </Text>

        <Button style={s.sheetAction} disabled={working} onPress={onConfirm}>
          {working ? t.endWorking : t.endConfirm}
        </Button>

        <Button kind="secondary" style={s.sheetAction} disabled={working} onPress={onCancel}>
          {t.endCancel}
        </Button>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  /* Column, not a row: three segments and a label do not share 320px, and the
     note under the label is the half that would have been truncated away. */
  appearance: { paddingVertical: 14, gap: 10 },
  appearanceText: { minWidth: 0 },
  appearanceLabel: { ...sans(600) },
  appearanceNote: { ...sansAt(400, size.text2xs, 1.45), marginTop: 2 },
  appearanceSeg: { alignSelf: 'stretch' },
  fill: { flex: 1 },
  page: { paddingHorizontal: 18, paddingTop: size.sp4, paddingBottom: DOCK_HEIGHT + size.sp6 },
  /* `padding:15px 0;gap:12px` and, under the label, `--text-sm` at 600 over
     `--text-2xs` at `margin-top:2px` — design file :993–998. The label was
     `--text-md` (15) and the note `--text-xs` (12); two steps too large each,
     which is why four rows filled a screen the design fits eight into. */
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 15, minHeight: 44 },
  main: { flex: 1, minWidth: 0 },
  label: { ...sans(600) },
  note: { ...sansAt(400, size.text2xs, 1.45), marginTop: 2 },
  dim: { opacity: 0.5 },
  /* `[data-press]:active{transform:scale(.97)}` — the design's own
     press. It faded here, which reads as "disabled for a moment". */
  pressed: PRESSED,
  /* `1px solid var(--divider)`. The design draws no sub-pixel rule anywhere. */
  rule: { height: 1 },
  scrim: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(15,19,32,.5)' },
  scrimTap: { flex: 1 },
  sheet: { borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: size.sp5 },
  grabber: { width: 34, height: 4, borderRadius: 999, alignSelf: 'center', marginBottom: size.sp4 },
  sheetBody: { marginTop: 5, marginBottom: size.sp4, lineHeight: 18 },
  sheetAction: { marginTop: 8 },
});
