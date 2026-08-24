import { useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';

import { APPROVALS_COPY, copy, FLASH, SHARED } from '@restaurant/surfaces/crew/copy';
import { say, type Approval, type ApprovalKind } from '@restaurant/surfaces/crew/data';

import { useApprovalQueue } from '../live';
import type { Lang } from '@restaurant/surfaces/crew/data';

import { Button, Empty } from '../../ui/primitives';
import { useTheme } from '../../lib/theme-context';
import { size } from '../../theme';
import { displayAt, sans, sansAt, text } from '../../type';
import { Intro, Panel, phrase } from '../bits';
import { DOCK_HEIGHT } from '../chrome';
import { useFlash } from '../flash';
import { enqueue } from '../queue';

/**
 * The manager's queue: three things a waiter cannot do alone.
 *
 * A discount, a void after firing and a refund. The design's point about this
 * screen is in `APPROVALS_COPY.intro` — the notification finds the manager
 * wherever they are, so the queue exists to be answered from a car park, not
 * from the office.
 *
 * Every card carries its **reason**, which is the only field that makes an
 * answer possible: "15%" is not a decision, "15%, regular guest, birthday" is.
 *
 * Answering records the decision on this handset and says so on the card — there
 * is no staff-app write endpoint yet, and a manager who declines and walks away
 * believing the waiter was told is worse off than one who never looked. That
 * disclosure and the demo-queue warning are now one quiet block at the foot:
 * `mfAt.approve` (`Xodimlar ilovasi:207`) goes straight from `mf.apprIntro` to
 * the cards, and two banners above the first card were most of the reason this
 * screen did not read as the drawing. Neither sentence was dropped — they are
 * still on the same screen, under the queue they are about.
 */
export function ApprovalsPanel({ lang }: { lang: Lang }) {
  const t = copy(APPROVALS_COPY, lang);
  const c = useTheme();
  const f = copy(FLASH, lang);
  const shared = copy(SHARED, lang);
  const flash = useFlash();

  /** Answered on this phone, by id. Not a mutation of the fixture. */
  const [answered, setAnswered] = useState<Readonly<Record<string, 'yes' | 'no'>>>({});

  /*
   * Live from `pos/approvals?filter[status]=pending`, through the same
   * `queueFrom()` the web build reads — a refund approved as a discount is the
   * mistake that function exists to prevent, and it has to be one function.
   */
  const queue = useApprovalQueue();

  const kindWord = (kind: ApprovalKind): string =>
    kind === 'discount' ? t.kindDiscount : kind === 'void' ? t.kindVoid : t.kindRefund;

  function answer(item: Approval, verdict: 'yes' | 'no') {
    setAnswered((current) => ({ ...current, [item.id]: verdict }));

    enqueue(
      verdict === 'yes' ? t.approved : t.declined,
      `${kindWord(item.kind)} · ${item.requester} · ${phrase(item.amount, lang)}`,
    );

    flash(verdict === 'yes' ? f.approved : f.declined, verdict === 'yes' ? 'ok' : 'problem');
  }

  return (
    <FlatList
      data={queue.data.items}
      keyExtractor={(item) => item.id}
      contentContainerStyle={s.page}
      showsVerticalScrollIndicator={false}
      ListHeaderComponent={<Intro>{t.intro}</Intro>}
      ListEmptyComponent={<Empty title={t.empty} />}
      renderItem={({ item }) => (
        <Card
          item={item}
          lang={lang}
          kindWord={kindWord(item.kind)}
          verdict={answered[item.id]}
          labels={t}
          onAnswer={(verdict) => answer(item, verdict)}
        />
      )}
      ListFooterComponent={
        <View style={s.foot}>
          {queue.live ? null : (
            <Pressable onPress={queue.reload} accessibilityRole="button" style={s.demo}>
              <Text style={[text.caption, { color: c.warning700 }]}>
                {t.demoQueue}
                {queue.problem === null ? '' : ` · ${queue.problem}`}
              </Text>
            </Pressable>
          )}
          <Text style={[text.caption, s.footLine, { color: c.fgSubtle }]}>{shared.notWired}</Text>
        </View>
      }
    />
  );
}

function Card({
  item,
  lang,
  kindWord,
  verdict,
  labels,
  onAnswer,
}: {
  item: Approval;
  lang: Lang;
  kindWord: string;
  verdict: 'yes' | 'no' | undefined;
  labels: { approve: string; decline: string; approved: string; declined: string };
  onAnswer: (verdict: 'yes' | 'no') => void;
}) {
  const c = useTheme();

  /*
   * The edge colour is the design's, per kind — `Xodimlar ilovasi:1456`: a
   * discount request is `warning-500`, a delete-after-firing and a **refund**
   * are both `danger-500`. The refund was drawn in brand blue, which made money
   * leaving the till the calmest-looking card in the queue.
   */
  const edge = item.kind === 'discount' ? c.warning500 : c.danger500;

  return (
    <Panel edge={edge} style={s.card}>
      <View style={s.head}>
        {/*
         * A plain 13px line at 600, not a chip. `Xodimlar ilovasi:212` draws
         * `<span style="font-size:var(--text-sm);font-weight:600">` and nothing
         * around it. The tinted pill this used to be repeated the left edge's
         * colour in a second place and pushed the amount — the figure actually
         * being decided — down a row.
         */}
        <Text style={[text.small, s.kind, { color: c.fg }]}>{kindWord}</Text>
        <Text style={[s.ago, text.num, { color: c.fgSubtle }]}>{say(item.ago, lang)}</Text>
      </View>

      {/* `--text-2xl` (24) in the display face at `--tracking-tight`, `Xodimlar
          ilovasi:214`. It was 20px in a section-heading preset, so the one
          number the manager is answering about read as a subheading. */}
      <Text style={[s.amount, text.num, { color: c.fg }]}>{phrase(item.amount, lang)}</Text>

      <Text style={[text.caption, s.detail, { color: c.fgMuted }]}>{say(item.detail, lang)}</Text>

      {/*
       * One muted line, not a labelled box (`Xodimlar ilovasi:217`). It reads as
       * a sentence continuing the detail above it, which is what it is — and a
       * captioned `Sabab:` panel framed the waiter's explanation as evidence
       * filed against them rather than as the context that makes an answer
       * possible.
       */}
      <Text style={[text.caption, s.reason, { color: c.fgSubtle }]}>{say(item.reason, lang)}</Text>

      {verdict === undefined ? (
        <View style={s.actions}>
          {/*
           * Approve first, filled; decline second, outlined — `Xodimlar
           * ilovasi:220`. The two were the other way round, so the button under
           * the thumb of a manager glancing at a phone was the destructive one.
           */}
          <Button
            height={44}
            style={s.action}
            textStyle={s.actionLine}
            onPress={() => onAnswer('yes')}
          >
            {labels.approve}
          </Button>
          <Button
            kind="secondary"
            height={44}
            style={s.action}
            textStyle={s.actionLine}
            onPress={() => onAnswer('no')}
          >
            {labels.decline}
          </Button>
        </View>
      ) : (
        /*
         * One background for both verdicts. `Xodimlar ilovasi:225` keeps the box
         * at `--bg-muted` and reads only the *text* colour off `{{a.doneColor}}`
         * — a filled green or red panel restates the decision loudly enough to
         * be read as a verdict on the person who asked.
         */
        <View style={[s.done, { backgroundColor: c.bgMuted, borderRadius: size.radiusMd }]}>
          <Text
            style={[
              text.caption,
              s.doneLine,
              { color: verdict === 'yes' ? c.success700 : c.danger700 },
            ]}
          >
            {verdict === 'yes' ? labels.approved : labels.declined}
          </Text>
        </View>
      )}
    </Panel>
  );
}

const s = StyleSheet.create({
  page: { paddingHorizontal: 18, paddingTop: size.sp4, paddingBottom: DOCK_HEIGHT + size.sp6 },
  /* `padding:15px 16px;margin-bottom:10px` — `Xodimlar ilovasi:210`. `Panel`
     brings the 15, so only the horizontal half is written here. */
  card: { marginBottom: 10, paddingHorizontal: 16 },
  head: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 10 },
  kind: { flex: 1, minWidth: 0, ...sans(600) },
  /* `--text-2xs` with no weight beside it: the design's body face is 400. */
  ago: { ...sansAt(400, size.text2xs, 1.45) },
  amount: { ...displayAt(700, size.text2xl), marginTop: 6 },
  detail: { marginTop: 5, lineHeight: 18 },
  reason: { marginTop: 4, lineHeight: 18 },
  actions: { flexDirection: 'row', gap: 8, marginTop: 13 },
  action: { flex: 1 },
  /* The buttons carry `--text-sm`, not the 15px a page CTA gets. */
  actionLine: { fontSize: size.textSm, lineHeight: 16 },
  done: { marginTop: 12, paddingVertical: 9, paddingHorizontal: 12 },
  doneLine: { ...sans(600) },
  foot: { marginTop: 4 },
  footLine: { lineHeight: 17 },
  demo: { minHeight: 44, justifyContent: 'center', paddingVertical: 6 },
});
