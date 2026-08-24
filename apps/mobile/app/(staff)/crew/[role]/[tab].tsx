import { Redirect, useLocalSearchParams } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { copy, PENDING } from '@restaurant/surfaces/crew/copy';
import { findTab, isCrewRole, type CrewRole, type Lang } from '@restaurant/surfaces/crew/data';

import { CrewDock, CrewHeader } from '@/crew/chrome';
import { AlertsPanel } from '@/crew/panels/alerts';
import { ApprovalsPanel } from '@/crew/panels/approvals';
import { BranchesPanel } from '@/crew/panels/branches';
import { CallsPanel } from '@/crew/panels/calls';
import { CashPanel, DeliveriesPanel, RoutePanel } from '@/crew/panels/courier';
import { MenuPanel } from '@/crew/panels/menu';
import { MorePanel } from '@/crew/panels/more';
import { CountPanel, ReceivingPanel, StockPanel } from '@/crew/panels/store';
import { TablesPanel } from '@/crew/panels/tables';
import { TodayPanel } from '@/crew/panels/today';
import { useLocale } from '@/lib/locale';
import { useTheme } from '@/lib/theme-context';
import { sans, text } from '@/type';

/**
 * One route for twenty screens: five roles, four tabs each.
 *
 * A file per tab would have meant five copies of `today`, two of `alerts` and a
 * chrome import in every one of them — and the moment one gained a heading the
 * others would not. `findTab` is the same table the dock draws from, so a slug
 * that exists in one and not the other is impossible rather than merely
 * unlikely: a tab this route cannot draw sends the reader back to the role's
 * first one instead of rendering an empty page under a working dock.
 */
export default function CrewTab() {
  const { role, tab } = useLocalSearchParams<{ role: string; tab: string }>();
  const { lang } = useLocale();
  const insets = useSafeAreaInsets();

  if (!isCrewRole(role)) return <Redirect href="/crew" />;

  const found = findTab(role, tab);

  if (found === undefined) return <Redirect href={`/crew/${role}`} />;

  return (
    <View style={[s.fill, { paddingTop: insets.top }]}>
      <CrewHeader role={role} lang={lang} />

      <View style={s.body}>
        <Panel role={role} tab={tab} lang={lang} built={found.built} />
      </View>

      <CrewDock role={role} tab={tab} lang={lang} />
    </View>
  );
}

function Panel({
  role,
  tab,
  lang,
  built,
}: {
  role: CrewRole;
  tab: string;
  lang: Lang;
  built: boolean;
}) {
  if (!built) return <NotBuilt lang={lang} />;

  switch (tab) {
    case 'today':
      // Only the two roles whose dock carries it reach this — `findTab` has
      // already turned the other three away.
      return <TodayPanel lang={lang} role={role === 'owner' ? 'owner' : 'manager'} />;
    case 'branches':
      return <BranchesPanel lang={lang} role={role} />;
    case 'approvals':
      return <ApprovalsPanel lang={lang} />;
    case 'alerts':
      return <AlertsPanel lang={lang} />;
    case 'tables':
      return <TablesPanel lang={lang} role={role} />;
    case 'calls':
      return <CallsPanel lang={lang} />;
    case 'menu':
      return <MenuPanel lang={lang} />;
    case 'more':
      return <MorePanel lang={lang} role={role} />;
    case 'receiving':
      return <ReceivingPanel lang={lang} role={role} />;
    case 'count':
      return <CountPanel lang={lang} />;
    case 'stock':
      return <StockPanel lang={lang} />;
    case 'deliveries':
      return <DeliveriesPanel lang={lang} />;
    case 'route':
      return <RoutePanel lang={lang} />;
    case 'cash':
      return <CashPanel lang={lang} />;
    default:
      return <NotBuilt lang={lang} />;
  }
}

/**
 * A tab the dock names and this route cannot draw.
 *
 * Empty today, and kept: `CrewTab.built` is the flag that puts a screen here,
 * and the honest thing to show is what is missing rather than a blank page —
 * `PENDING.generic` says the data is ready and the screen is not drawn.
 */
function NotBuilt({ lang }: { lang: Lang }) {
  const c = useTheme();
  const t = copy(PENDING, lang);

  return (
    <View style={s.pending}>
      <Text style={[text.body, s.pendingTitle, { color: c.fg }]}>{t.title}</Text>
      <Text style={[text.small, s.pendingBody, { color: c.fgSubtle }]}>{t.generic}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  fill: { flex: 1 },
  body: { flex: 1 },
  pending: { paddingHorizontal: 26, paddingVertical: 56, alignItems: 'center' },
  pendingTitle: { ...sans(600), textAlign: 'center' },
  pendingBody: { marginTop: 6, textAlign: 'center', lineHeight: 20 },
});
