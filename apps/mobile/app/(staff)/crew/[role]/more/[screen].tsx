import { Redirect, useLocalSearchParams } from 'expo-router';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { copy, fill, STORE_COPY, SUB_NOTES } from '@restaurant/surfaces/crew/copy';
import { isCrewRole, MORE, say, type CrewRole, type Lang } from '@restaurant/surfaces/crew/data';
import { moreCopy } from '@restaurant/surfaces/crew/more-copy';

import { SubHeader, SubScreen } from '@/crew/chrome';
import {
  ClosingScreen,
  EndShiftScreen,
  HandbackScreen,
  PurchaseScreen,
  SwapScreen,
  WasteScreen,
} from '@/crew/panels/more-forms';
import {
  BookingsScreen,
  BranchScreen,
  ControlScreen,
  ExpiryScreen,
  FinanceScreen,
  KitchenSpeedScreen,
  MyDayScreen,
  MyShiftScreen,
  PeopleScreen,
  RotaScreen,
} from '@/crew/panels/more-screens';
import { ScanScreen } from '@/crew/panels/scan';
import { useLocale } from '@/lib/locale';
import { size } from '@/theme';

/**
 * One route for the seventeen screens the More menu names.
 *
 * The same argument the tab route makes: seventeen files would have meant
 * seventeen copies of the back link and the heading, and the moment one gained a
 * subtitle the others would not. `MORE` — the table the menu itself draws from —
 * is what decides whether a slug exists at all, so a row in the menu with no
 * case here goes nowhere useful and a case with no row is unreachable.
 *
 * **Which role may open which screen.** `MORE[role]` is per role, so a waiter
 * asking for `.../more/control` is turned away rather than shown the owner's
 * loss-prevention scores. That is a *drawing* boundary and not a security one —
 * the real one is the server's permission check on whatever a screen fetches,
 * and none of these fetches anything yet.
 */

const SCREENS = [
  'finance',
  'people',
  'control',
  'closing',
  'rota',
  'kitchen',
  'waste',
  'expiry',
  'porder',
  'swap',
  'handback',
  'endshift',
  'myshift',
  'bookings',
  'myday',
  'branch',
  'scan',
] as const;

type Screen = (typeof SCREENS)[number];

const isScreen = (value: string): value is Screen => (SCREENS as readonly string[]).includes(value);

/**
 * Two screens are not named in a More row, and both are reached by tapping
 * something on a tab: a branch card on the owner's list, and the scanner on the
 * storekeeper's receiving screen. Their headings come from where they were
 * opened rather than from a menu row that does not exist.
 */
const OFF_MENU: readonly string[] = ['branch', 'scan'];

export default function CrewMoreScreen() {
  const { role, screen, i } = useLocalSearchParams<{ role: string; screen: string; i?: string }>();
  const { lang } = useLocale();
  const insets = useSafeAreaInsets();

  if (!isCrewRole(role) || !isScreen(screen)) return <Redirect href="/crew" />;

  const row = MORE[role].find((entry) => entry.id === screen);

  if (row === undefined && !OFF_MENU.includes(screen)) return <Redirect href={`/crew/${role}`} />;

  const index = Number.parseInt(i ?? '0', 10);
  const t = moreCopy(lang);
  const store = copy(STORE_COPY, lang);
  const notes = copy(SUB_NOTES, lang);

  const title =
    screen === 'scan'
      ? store.scanTitle
      : screen === 'branch'
        ? (t.branches[index]?.name ?? '')
        : row === undefined
          ? ''
          : say(row.label, lang);

  const note =
    screen === 'branch'
      ? fill(notes.branch, { city: t.branches[index]?.city ?? '' })
      : notes[screen];

  return (
    <SubScreen>
      <View style={{ paddingTop: insets.top }}>
        <SubHeader title={title} note={note} />
      </View>

      {/*
       * Ten of the seventeen bring their own `FlatList`; the six forms are
       * `ScrollView`s and need no second scroller around them. The wrapper is
       * only for the one screen that is a fixed block — `branch` — so it gets a
       * page to sit on rather than a scroll region it does not fill.
       */}
      {screen === 'branch' ? (
        <ScrollView contentContainerStyle={[s.page, { paddingBottom: insets.bottom + size.sp9 }]}>
          <BranchScreen lang={lang} index={index} />
        </ScrollView>
      ) : (
        <Body screen={screen} lang={lang} role={role} />
      )}
    </SubScreen>
  );
}

function Body({ screen, lang }: { screen: Screen; lang: Lang; role: CrewRole }) {
  switch (screen) {
    case 'finance':
      return <FinanceScreen lang={lang} />;
    case 'people':
      return <PeopleScreen lang={lang} />;
    case 'control':
      return <ControlScreen lang={lang} />;
    case 'closing':
      return <ClosingScreen lang={lang} />;
    case 'rota':
      return <RotaScreen lang={lang} />;
    case 'kitchen':
      return <KitchenSpeedScreen lang={lang} />;
    case 'waste':
      return <WasteScreen lang={lang} />;
    case 'expiry':
      return <ExpiryScreen lang={lang} />;
    case 'porder':
      return <PurchaseScreen lang={lang} />;
    case 'swap':
      return <SwapScreen lang={lang} />;
    case 'handback':
      return <HandbackScreen lang={lang} />;
    case 'endshift':
      return <EndShiftScreen lang={lang} />;
    case 'myshift':
      return <MyShiftScreen lang={lang} />;
    case 'bookings':
      return <BookingsScreen lang={lang} />;
    case 'myday':
      return <MyDayScreen lang={lang} />;
    case 'scan':
      return <ScanScreen lang={lang} />;
    default:
      return null;
  }
}

const s = StyleSheet.create({
  page: { paddingHorizontal: 0 },
});
