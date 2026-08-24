import { FlatList, StyleSheet, Text, View } from 'react-native';

import { ALERTS_COPY, copy } from '@restaurant/surfaces/crew/copy';
import { say, type Alert } from '@restaurant/surfaces/crew/data';
import type { Lang } from '@restaurant/surfaces/crew/data';

import { Empty } from '../../ui/primitives';
import { useTheme } from '../../lib/theme-context';
import { size } from '../../theme';
import { sans, sansAt, text } from '../../type';
import { DemoLine } from '../bits';
import { DOCK_HEIGHT } from '../chrome';
import { useCrewAlerts } from '../live';

/**
 * What the app noticed while nobody was looking.
 *
 * A cash variance, a stock line about to run out, a large discount, a branch
 * behind plan.
 *
 * **This is a divider list, not a card list.** `mfAt.alerts` (`Xodimlar
 * ilovasi:234`) draws one flat row per alert — a 7×7 dot in the row's colour, a
 * title, a line of body, how long ago — separated by `1px solid var(--divider)`
 * and nothing else: no border, no radius, no 3px left edge. It was built as five
 * bordered cards, which is the booking list's shape borrowed onto the wrong
 * screen, and the borrowing carried a meaning: a card frames each line as a
 * thing to be actioned, filed, forwarded. **An alert is not an accusation** —
 * `ALERTS_COPY.note` used to say so in a footer the design has no room for, and
 * the flat list now says it instead. The sentence stays in the catalogue.
 *
 * Deliberately not answerable. Each of these ends in a conversation with a
 * person, and a button that "dismissed" one would be a button that quietly
 * closed the conversation.
 */
export function AlertsPanel({ lang }: { lang: Lang }) {
  const t = copy(ALERTS_COPY, lang);

  /*
   * The sample stands in when the server refuses, unlike the calls or the
   * shelf. Nothing on this screen is answerable — the panel deliberately has no
   * dismiss button — so a stale row costs a second reading and nothing else,
   * while a blank list reads as "nothing is wrong", which is the one thing an
   * alerts screen must never say by accident.
   */
  const alerts = useCrewAlerts();

  return (
    <FlatList
      data={alerts.data}
      keyExtractor={(item) => item.id}
      contentContainerStyle={s.page}
      showsVerticalScrollIndicator={false}
      ListHeaderComponent={
        alerts.live ? null : (
          <DemoLine text={t.demoAlerts} problem={alerts.problem} onRetry={alerts.reload} />
        )
      }
      ListEmptyComponent={<Empty title={t.empty} />}
      renderItem={({ item }) => <AlertRow item={item} lang={lang} />}
    />
  );
}

/**
 * The dot's colour, at the 500 step the design writes.
 *
 * `mfAlerts` (`Xodimlar ilovasi:1964`) names `--danger-500`, `--warning-500` and
 * `--n-400` on the rows themselves. `toneColour()` answers with the 600 step,
 * which is the right weight for *text* on a light background and a shade too
 * dark for a seven-pixel disc; and it has no `n-400` — a quiet alert came back
 * `fg-muted`, the same grey as the body text beside it.
 */
function dotColour(tone: Alert['tone'], c: ReturnType<typeof useTheme>): string {
  switch (tone) {
    case 'danger':
      return c.danger500;
    case 'warning':
      return c.warning500;
    case 'success':
      return c.success500;
    case 'brand':
      return c.brand500;
    default:
      return c.n400;
  }
}

function AlertRow({ item, lang }: { item: Alert; lang: Lang }) {
  const c = useTheme();

  return (
    /* The rule is on every row, last one included — that is how the design
       draws it, and it is what closes the list against the dock. */
    <View style={[s.row, { borderBottomColor: c.divider }]}>
      <View style={[s.dot, { backgroundColor: dotColour(item.tone, c) }]} />
      <View style={s.column}>
        <Text style={[text.small, s.title, { color: c.fg }]}>{say(item.title, lang)}</Text>
        <Text style={[text.caption, s.body, { color: c.fgMuted }]}>{say(item.body, lang)}</Text>
        <Text style={[s.ago, text.num, { color: c.fgSubtle }]}>{say(item.ago, lang)}</Text>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  page: { paddingHorizontal: 18, paddingTop: size.sp4, paddingBottom: DOCK_HEIGHT + size.sp6 },
  /* `display:flex;gap:11px;padding:13px 0;border-bottom:1px solid var(--divider)`. */
  row: { flexDirection: 'row', gap: 11, paddingVertical: 13, borderBottomWidth: 1 },
  /* `width:7px;height:7px;border-radius:999px;margin-top:6px` — the 6 is what
     sits the dot on the title's first line rather than above it. */
  dot: { width: 7, height: 7, borderRadius: size.radiusPill, marginTop: 6 },
  column: { flex: 1, minWidth: 0 },
  title: { ...sans(600), lineHeight: 18 },
  body: { marginTop: 3, lineHeight: 18 },
  /* `--text-2xs` with no weight beside it: the design's body face is 400. It
     was drawn at 12px and eight points down, which read as a third paragraph
     instead of a timestamp. */
  ago: { ...sansAt(400, size.text2xs, 1.45), marginTop: 4 },
});
