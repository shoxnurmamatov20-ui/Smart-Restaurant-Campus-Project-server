import { FlatList, StyleSheet, Text, View } from 'react-native';

import { copy, TODAY as TODAY_COPY } from '@restaurant/surfaces/crew/copy';
import { CURRENCY_WORD, say, type LeaderRow } from '@restaurant/surfaces/crew/data';
import type { Lang } from '@restaurant/surfaces/crew/data';

import { som } from '../../lib/money';
import { useTheme } from '../../lib/theme-context';
import { size } from '../../theme';
import { sans, sansAt, text, tracking } from '../../type';
import { DemoLine, Hero, Note, phrase, SectionLabel, Tile, TileGrid, toneColour } from '../bits';
import { DOCK_HEIGHT } from '../chrome';
import { useCrewPlace, useCrewToday } from '../live';

/**
 * What an owner or a manager opens the app to see.
 *
 * The same shape asking a different question, which is the design's own split:
 * an owner reads a business — six figures, including what is tied up in stock
 * and who owes whom — and a manager reads a service in progress, four figures
 * about tonight. Giving both the same four would leave the owner without the
 * two they picked the phone up for.
 *
 * The list under them changes with it: branches for one, waiters on shift for
 * the other. One component, because it is one screen; the data decides.
 */
export function TodayPanel({ lang, role }: { lang: Lang; role: 'owner' | 'manager' }) {
  const c = useTheme();
  const t = copy(TODAY_COPY, lang);

  /*
   * Two reads, and the venue's name is the first of them.
   *
   * It is threaded into the figures rather than drawn beside them because the
   * hero label is a sentence — "Bugungi tushum · Chilonzor" — and a label naming
   * one venue over figures that came from another is the mistake this screen can
   * make that nobody would catch: the numbers look right.
   *
   * An empty place is not an error. A one-venue restaurant has nothing to
   * disambiguate and the label reads as it did before.
   */
  const place = useCrewPlace();
  const today = useCrewToday(role, lang, place.data);
  const board = today.data;

  return (
    <FlatList
      data={board.list}
      keyExtractor={(row) => row.name}
      contentContainerStyle={s.page}
      showsVerticalScrollIndicator={false}
      ListHeaderComponent={
        <View>
          {today.live ? null : (
            /* An owner reading eighteen million so'm that belongs to the demo
               restaurant is the complaint this line exists to answer. */
            <DemoLine text={t.demoFigures} problem={today.problem} onRetry={today.reload} />
          )}
          <Hero
            label={say(board.revenueLabel, lang)}
            value={som(board.revenue, lang, false)}
            delta={board.delta}
            /*
             * The currency word joins the note rather than the figure, which is
             * where the design puts it — a hero number that has to wrap because
             * "so'm" pushed it past the edge is a hero number nobody can read at
             * a glance.
             */
            note={`${say(CURRENCY_WORD, lang)} · ${say(board.revenueNote, lang)}`}
            spark={board.spark}
          />

          <View style={s.kpis}>
            <TileGrid>
              {board.kpis.map((kpi) => (
                <Tile
                  key={phrase(kpi.label, lang)}
                  label={say(kpi.label, lang)}
                  value={phrase(kpi.value, lang)}
                  delta={phrase(kpi.delta, lang)}
                  tone={kpi.tone}
                />
              ))}
            </TileGrid>
          </View>

          <SectionLabel>{say(board.listLabel, lang)}</SectionLabel>
        </View>
      }
      renderItem={({ item, index }) => <Leader row={item} lang={lang} lead={index === 0} />}
      ListFooterComponent={<Note>{t.vatNote}</Note>}
      ItemSeparatorComponent={() => <View style={[s.rule, { backgroundColor: c.divider }]} />}
    />
  );
}

/**
 * One branch, or one waiter.
 *
 * The revenue is printed without the currency word: five rows each ending in
 * "so'm" is five repetitions of a fact the column heading already gave, and the
 * figures stop lining up.
 */
function Leader({ row, lang, lead }: { row: LeaderRow; lang: Lang; lead: boolean }) {
  const c = useTheme();
  const note = say(row.note, lang);

  // The design colours a delta and leaves a count alone: "+8.1%" is a judgement,
  // "18 chek" is a fact. The leading character is what tells them apart.
  const tone = note.startsWith('+') ? 'up' : note.startsWith('−') ? 'down' : 'flat';

  return (
    <View style={s.row}>
      <LeaderAvatar initials={row.initials} lead={lead} />

      <Text style={[text.small, s.name, { color: c.fg }]} numberOfLines={1}>
        {row.name}
      </Text>

      <View style={s.figures}>
        <Text style={[text.small, text.num, s.money, { color: c.fg }]}>
          {som(row.revenue, lang, false)}
        </Text>
        <Text style={[text.caps, s.delta, { color: toneColour(tone, c) }]}>{note}</Text>
      </View>
    </View>
  );
}

/**
 * The disc at the head of a leader row.
 *
 * Local rather than the shared `<Avatar>` for one conditional the shared disc
 * cannot carry: the design tints **only the first row** `brand-100` / `brand-700`
 * and leaves rows two to five on `--rowav-bg` / `--rowav-fg` — which resolve to
 * `bg-muted` / `fg-muted` in light and to their dark twins in dark, so the pair
 * below is exact in both themes (`Smart Restaurant Xodimlar ilovasi.dc.html`:36,
 * 46, 1941–1942). Every disc was blue, and five equal blue discs say nothing;
 * one says "top of the list", which is the whole point of a ranked list.
 *
 * The rest is the row's own literals from line 174: 32px, `--text-2xs`, weight
 * 700, `letter-spacing:.01em`.
 */
function LeaderAvatar({ initials, lead }: { initials: string; lead: boolean }) {
  const c = useTheme();

  return (
    <View style={[s.avatar, { backgroundColor: lead ? c.brand100 : c.bgMuted }]}>
      <Text style={[s.avatarLine, { color: lead ? c.brand700 : c.fgMuted }]}>{initials}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  page: { paddingHorizontal: 18, paddingTop: size.sp4, paddingBottom: DOCK_HEIGHT + size.sp6 },
  kpis: { marginTop: 10 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 11, paddingVertical: 9, minHeight: 44 },
  avatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarLine: {
    ...sansAt(700, size.text2xs, 1.2),
    letterSpacing: tracking('0.01em', size.text2xs),
  },
  name: { flex: 1, minWidth: 0, ...sans(500) },
  figures: { alignItems: 'flex-end', gap: 1 },
  money: { ...sans(600) },
  delta: { letterSpacing: 0, textTransform: 'none' },
  /* `1px solid var(--divider)` — the design draws no sub-pixel rule. */
  rule: { height: 1 },
});
