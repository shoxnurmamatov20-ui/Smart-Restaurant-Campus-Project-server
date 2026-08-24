import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { copy, SHARED, TABLE_STATE } from '@restaurant/surfaces/crew/copy';
import {
  isCrewRole,
  say,
  type CrewRole,
  type Lang,
  type MenuRow,
  type TableState,
} from '@restaurant/surfaces/crew/data';
import type { CrewTone } from '@restaurant/surfaces/crew/more-data';
import type { FoundTable } from '@restaurant/surfaces/crew/live';

import { Chip, DemoLine, SectionLabel } from '@/crew/bits';
import { SubHeader, SubScreen } from '@/crew/chrome';
import { PRESSED } from '@/ui/primitives';
import { useCrewSearch } from '@/crew/live';
import { useLocale } from '@/lib/locale';
import { som } from '@/lib/money';
import { useTheme } from '@/lib/theme-context';
import { size } from '@/theme';
import { sans, sansAt, text } from '@/type';

/**
 * The screen behind the dock's search pill.
 *
 * A static route rather than another `[tab]`, and it has to be: the dock's tabs
 * come from `DOCK[role]`, and a fifth entry there would have put a fifth disc on
 * every role's bar — the design draws four discs and one pill.
 *
 * **Two things, and it says which two.** The design's own handler is a toast
 * reading "order, table, guest, item"; two of those four have an endpoint that
 * can answer a partial word, and two do not. So the field searches the menu and
 * the floor, and `searchScope` under it names that reach in the reader's own
 * language. A box that silently searches half of what somebody expects is the
 * thing that teaches them to stop using it.
 *
 * **Whoever is holding the phone decides what comes back.** Both reads sit
 * behind their own permission, so a cook gets dishes and no tables while a
 * waiter gets both — from this one screen, with no role branching here. The
 * refusal is the server's answer rather than this file's guess about who may see
 * what.
 */
export default function CrewSearch() {
  const { role } = useLocalSearchParams<{ role: string }>();
  const { lang } = useLocale();
  const insets = useSafeAreaInsets();

  if (!isCrewRole(role)) return <Redirect href="/crew" />;

  return (
    <View style={[s.fill, { paddingTop: insets.top }]}>
      <SearchBody role={role} lang={lang} />
    </View>
  );
}

/** `free` is the one state that is good news; a booked table is a warning, not a fault. */
const STATE_TONE: Readonly<Record<TableState, CrewTone>> = {
  free: 'success',
  reserved: 'warning',
  occupied: 'danger',
  'awaiting-payment': 'warning',
};

function SearchBody({ role, lang }: { role: CrewRole; lang: Lang }) {
  const c = useTheme();
  const shared = copy(SHARED, lang);
  const [typed, setTyped] = useState('');

  /*
   * A quarter second behind the keyboard.
   *
   * Firing per keystroke would send "l", "la", "lag", "lagm" — four round trips
   * to be told about most of the menu, and on a restaurant's wifi the answer to
   * "l" can land after the answer to "lagm" and overwrite it. `useLive` keys off
   * this settled value, so the request is made once per word rather than once
   * per finger.
   */
  const [term, setTerm] = useState('');

  useEffect(() => {
    const timer = setTimeout(() => setTerm(typed), 250);

    return () => clearTimeout(timer);
  }, [typed]);

  const found = useCrewSearch(term, lang);
  const asked = term.trim().length >= 2;
  const nothing = asked && found.live && found.data.dishes.length + found.data.tables.length === 0;

  return (
    <SubScreen>
      <SubHeader title={shared.search} note={shared.searchScope} />

      <View style={s.fieldWrap}>
        <TextInput
          value={typed}
          onChangeText={setTyped}
          placeholder={shared.searchPlaceholder}
          placeholderTextColor={c.fgSubtle}
          autoFocus
          autoCorrect={false}
          autoCapitalize="none"
          returnKeyType="search"
          accessibilityLabel={shared.search}
          /*
           * 16px, like every field in this product. RN does not zoom on focus
           * the way a phone browser does, but the number is the platform's floor
           * for something typed one-handed, and a search box held over a tray is
           * the worst place to make text small.
           */
          style={[
            s.field,
            text.body,
            { backgroundColor: c.surface, borderColor: c.border, color: c.fg },
          ]}
        />
      </View>

      <ScrollView
        contentContainerStyle={s.page}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Only once something has been asked. A problem line over an empty
            field reports a failure nobody has asked for yet. */}
        {asked && !found.live && found.problem !== null ? (
          <DemoLine text={shared.searchOffline} problem={found.problem} onRetry={found.reload} />
        ) : null}

        {/* Tables first. Somebody typing while carrying plates is looking for a
            number far more often than for a price. */}
        {found.data.tables.length > 0 ? (
          <View style={s.group}>
            <SectionLabel>{shared.searchTables}</SectionLabel>
            {found.data.tables.map((row) => (
              <TableHit key={row.id} row={row} role={role} lang={lang} />
            ))}
          </View>
        ) : null}

        {found.data.dishes.length > 0 ? (
          <View style={s.group}>
            <SectionLabel>{shared.searchDishes}</SectionLabel>
            {found.data.dishes.map((row) => (
              <DishHit key={row.id} row={row} lang={lang} soldOut={shared.soldOut} />
            ))}
          </View>
        ) : null}

        {nothing ? (
          <Text style={[text.small, s.nothing, { color: c.fgSubtle }]}>{shared.searchNothing}</Text>
        ) : null}
      </ScrollView>
    </SubScreen>
  );
}

/**
 * A table, and the one control that follows from having found it.
 *
 * Tapping opens the table detail — the screen somebody wanted when they typed
 * the number. The room and the seats are what tell two similarly-named tables
 * apart in a restaurant with an A-1 upstairs and an A-1 on the terrace.
 */
function TableHit({ row, role, lang }: { row: FoundTable; role: CrewRole; lang: Lang }) {
  const c = useTheme();
  const router = useRouter();
  const states = copy(TABLE_STATE, lang);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={row.label}
      onPress={() => router.push(`/crew/${role}/table/${row.id}`)}
      style={({ pressed }) => [s.hit, s.hitRow, { borderColor: c.divider }, pressed && PRESSED]}
    >
      <View style={s.main}>
        <Text style={[text.small, s.name, text.num, { color: c.fg }]} numberOfLines={1}>
          {row.label}
        </Text>
        <Text style={[s.sub, { color: c.fgSubtle }]} numberOfLines={1}>
          {row.zone === '' ? `${row.seats}` : `${row.zone} · ${row.seats}`}
        </Text>
      </View>

      <Chip tone={STATE_TONE[row.state]}>{states[row.state]}</Chip>
    </Pressable>
  );
}

/** A dish, read rather than opened — this app has no dish screen to send anyone to. */
function DishHit({ row, lang, soldOut }: { row: MenuRow; lang: Lang; soldOut: string }) {
  const c = useTheme();

  return (
    <View style={[s.hit, s.hitRow, row.soldOut && s.dim, { borderColor: c.divider }]}>
      <View style={s.main}>
        <Text style={[text.small, s.name, { color: c.fg }]} numberOfLines={1}>
          {say(row.name, lang)}
        </Text>
        <Text style={[s.sub, { color: c.fgSubtle }]} numberOfLines={1}>
          {say(row.category, lang)}
        </Text>
      </View>

      {row.soldOut ? (
        <Chip tone="danger">{soldOut}</Chip>
      ) : (
        <Text style={[text.small, s.name, text.num, { color: c.fg }]}>
          {som(row.price, lang, false)}
        </Text>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  fill: { flex: 1 },
  fieldWrap: { paddingHorizontal: 18, paddingTop: size.sp3 },
  field: { height: 46, borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, ...sans(500) },
  page: { paddingHorizontal: 18, paddingTop: size.sp4, paddingBottom: size.sp8 },
  group: { marginBottom: size.sp5 },
  hit: { paddingVertical: 12, borderBottomWidth: 1, minHeight: 44 },
  hitRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  main: { flex: 1, minWidth: 0 },
  name: { ...sans(600) },
  sub: { ...sansAt(400, size.text2xs, 1.45), marginTop: 2 },
  dim: { opacity: 0.5 },
  nothing: { paddingTop: size.sp4, textAlign: 'center' },
});
