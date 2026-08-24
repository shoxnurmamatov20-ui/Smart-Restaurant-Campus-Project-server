import { useRouter } from 'expo-router';
import { FlatList, StyleSheet, Text, View } from 'react-native';

import { BRANCHES_COPY, copy } from '@restaurant/surfaces/crew/copy';
import { attainment, type BranchRow, type CrewRole } from '@restaurant/surfaces/crew/data';
import type { Lang } from '@restaurant/surfaces/crew/data';
import type { CrewTone } from '@restaurant/surfaces/crew/more-data';

import { som } from '../../lib/money';
import { useTheme } from '../../lib/theme-context';
import { size } from '../../theme';
import { sans, text } from '../../type';
import { Bar, DemoLine, Intro, Panel, toneColour } from '../bits';
import { DOCK_HEIGHT } from '../chrome';
import { useCrewBranches } from '../live';

/**
 * The owner's five branches, ranked, each against its own daily target.
 *
 * The bar is the point of the screen. Revenue alone says Chilonzor is the best
 * branch; revenue against target says Termiz — the smallest of the five — is the
 * only one that beat its day. Sorting by the first and colouring by the second
 * is what lets both readings live on one card.
 */
export function BranchesPanel({ lang, role }: { lang: Lang; role: CrewRole }) {
  const t = copy(BRANCHES_COPY, lang);
  const router = useRouter();
  const branches = useCrewBranches();

  return (
    <FlatList
      data={branches.data}
      keyExtractor={(branch) => branch.id}
      contentContainerStyle={s.page}
      showsVerticalScrollIndicator={false}
      ListHeaderComponent={
        <View>
          {branches.live ? null : (
            <DemoLine text={t.demoBranches} problem={branches.problem} onRetry={branches.reload} />
          )}
          <Intro>{t.intro}</Intro>
        </View>
      }
      renderItem={({ item, index }) => (
        <BranchCard
          branch={item}
          lang={lang}
          labels={t}
          onPress={() => router.push(`/crew/${role}/more/branch?i=${index}`)}
        />
      )}
    />
  );
}

/**
 * Green met, blue above 85%, amber behind — `BRANCHES_COPY.intro` says so on
 * screen, which is the reason the thresholds are written once and read twice.
 */
function toneFor(percent: number): CrewTone {
  if (percent >= 100) return 'success';

  return percent >= 85 ? 'brand' : 'warning';
}

function BranchCard({
  branch,
  lang,
  labels,
  onPress,
}: {
  branch: BranchRow;
  lang: Lang;
  labels: { orders: string; margin: string; staff: string; ofTarget: string };
  onPress: () => void;
}) {
  const c = useTheme();
  const percent = attainment(branch);

  return (
    <Panel onPress={onPress} style={s.card}>
      <View style={s.head}>
        <Text style={[text.small, s.name, { color: c.fg }]} numberOfLines={1}>
          {branch.name}
        </Text>
        <Text style={[text.caption, text.num, { color: c.fgSubtle }]}>{branch.city}</Text>
      </View>

      <View style={s.money}>
        <Text style={[text.title, text.num, { color: c.fg }]}>
          {som(branch.revenue, lang, false)}
        </Text>
        <Text
          style={[
            text.caption,
            text.num,
            s.delta,
            { color: toneColour(branch.up ? 'up' : 'down', c) },
          ]}
        >
          {branch.delta}
        </Text>
      </View>

      <Bar percent={percent} tone={toneFor(percent)} />

      <Text style={[text.caption, text.num, { color: c.fgSubtle, marginTop: 5 }]}>
        {percent}% {labels.ofTarget} · {som(branch.target, lang, false)}
      </Text>

      <View style={[s.foot, { borderTopColor: c.divider }]}>
        <Fact label={labels.orders} value={String(branch.orders)} />
        <Fact label={labels.margin} value={branch.margin} />
        <Fact label={labels.staff} value={String(branch.staff)} />
      </View>
    </Panel>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  const c = useTheme();

  return (
    <Text style={[text.caption, { color: c.fgSubtle }]}>
      {label} <Text style={[text.num, s.factValue, { color: c.fg }]}>{value}</Text>
    </Text>
  );
}

const s = StyleSheet.create({
  page: { paddingHorizontal: 18, paddingTop: size.sp4, paddingBottom: DOCK_HEIGHT + size.sp6 },
  card: { marginBottom: 10 },
  head: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 10 },
  name: { flex: 1, minWidth: 0, ...sans(600) },
  money: { flexDirection: 'row', alignItems: 'baseline', gap: 12, marginTop: 7 },
  delta: { ...sans(600) },
  foot: {
    flexDirection: 'row',
    gap: 16,
    marginTop: 11,
    paddingTop: 11,
    borderTopWidth: 1,
  },
  factValue: { ...sans(600) },
});
