import { FlatList, StyleSheet, Text, View } from 'react-native';

import { copy, MENU_COPY, SHARED } from '@restaurant/surfaces/crew/copy';
import { say, type Lang, type MenuRow } from '@restaurant/surfaces/crew/data';

import { som } from '../../lib/money';
import { useTheme } from '../../lib/theme-context';
import { size } from '../../theme';
import { sans, sansAt, text } from '../../type';
import { Chip, DemoLine, Intro } from '../bits';
import { DOCK_HEIGHT } from '../chrome';
import { useCrewMenu } from '../live';

/**
 * The menu, as the person at the table needs to read it.
 *
 * Not the guest's menu and not the console's: a waiter is answering "is there
 * still lagman" and "how much is the pepperoni", and everything else on a dish
 * card is in the way. So it is a list of names, categories and prices, and the
 * one state that changes an answer — 86'd — is a word, not a shade.
 *
 * Sold-out rows stay in the list and are dimmed rather than removed. A dish that
 * vanished would send a waiter to the kitchen to ask, and the answer is on the
 * screen they were already holding.
 *
 * **There is no search box, and that is the design's answer rather than an
 * omission.** `mfAt.menu` is the intro line and then eight rows, nothing between
 * them (`Smart Restaurant Xodimlar ilovasi.dc.html`:385–401). `mf.menuSearch`
 * exists in the copy object but the template never draws an input for it — the
 * only place a dish is searched is the order flow, and even there the drawing
 * filters with category pills. Eight rows fit on one screen; a field above them
 * costs 44px of the list to save nobody a scroll, and it opened a keyboard over
 * the answer a waiter was reading.
 */
export function MenuPanel({ lang }: { lang: Lang }) {
  const c = useTheme();
  const t = copy(MENU_COPY, lang);
  const shared = copy(SHARED, lang);

  /*
   * The card this restaurant actually sells, with its stop-list state.
   *
   * The sample is left standing when the server refuses, because this screen is
   * read rather than acted on and a waiter mid-service is better served by a
   * recognisable list than by nothing. What makes that safe is the line above
   * it: a price read aloud from a demo is an apology at the table, so the
   * screen says which one it is showing.
   */
  const menu = useCrewMenu(lang);

  return (
    <FlatList
      data={menu.data}
      keyExtractor={(row) => row.id}
      contentContainerStyle={s.page}
      showsVerticalScrollIndicator={false}
      ListHeaderComponent={
        <View>
          {menu.live ? null : (
            <DemoLine text={t.demoMenu} problem={menu.problem} onRetry={menu.reload} />
          )}
          <Intro>{t.intro}</Intro>
        </View>
      }
      renderItem={({ item }) => <Dish row={item} lang={lang} soldOut={shared.soldOut} />}
      ItemSeparatorComponent={() => <View style={[s.rule, { backgroundColor: c.divider }]} />}
    />
  );
}

function Dish({ row, lang, soldOut }: { row: MenuRow; lang: Lang; soldOut: string }) {
  const c = useTheme();

  return (
    <View style={[s.row, row.soldOut && s.dim]}>
      <View style={s.main}>
        <Text style={[text.small, s.name, { color: c.fg }]} numberOfLines={1}>
          {say(row.name, lang)}
        </Text>
        {/* `--text-2xs` (11), not `--text-xs` (12) — design file :394. */}
        <Text style={[s.category, { color: c.fgSubtle }]} numberOfLines={1}>
          {say(row.category, lang)}
        </Text>
      </View>

      {row.soldOut ? (
        <Chip tone="danger">{soldOut}</Chip>
      ) : (
        <Text style={[text.small, text.num, s.price, { color: c.fg }]}>
          {som(row.price, lang, false)}
        </Text>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  page: { paddingHorizontal: 18, paddingTop: size.sp4, paddingBottom: DOCK_HEIGHT + size.sp6 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, minHeight: 44 },
  dim: { opacity: 0.5 },
  main: { flex: 1, minWidth: 0 },
  name: { ...sans(600) },
  category: { ...sansAt(400, size.text2xs, 1.45), marginTop: 2 },
  price: { ...sans(600) },
  /* `1px solid var(--divider)` — the design draws no sub-pixel rule. */
  rule: { height: 1 },
});
