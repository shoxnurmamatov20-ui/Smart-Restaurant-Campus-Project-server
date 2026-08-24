import { FlatList, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { copy, fill, FLASH, QUEUE_COPY } from '@restaurant/surfaces/crew/copy';

import { Note } from '@/crew/bits';
import { SubHeader, SubScreen } from '@/crew/chrome';
import { useFlash } from '@/crew/flash';
import { drain, useQueue, type QueuedAction } from '@/crew/queue';
import { useLocale } from '@/lib/locale';
import { useTheme } from '@/lib/theme-context';
import { size } from '@/theme';
import { sansAt, text } from '@/type';
import { Button } from '@/ui/primitives';

/**
 * Everything this handset did that the server has not been told about.
 *
 * Flow F13. Every button in the app that changes something writes here first —
 * an approval, a delivered drop, a saved count — and `drain()` hands the batch
 * to `POST /staff/actions` in the order it was worked.
 *
 * What leaves the list is what the server said it applied. A refusal stays,
 * with its reason, because the person who logged four kilos of spoiled chicken
 * has to find out that the store would not take it — and an entry the app has
 * no verb for yet stays too, marked failed, rather than disappearing into a
 * request that was never made.
 *
 * **Order is kept, and the screen says why.** First queued is first sent, or the
 * kitchen sees a dish after it was cancelled. That sentence is on the screen
 * rather than in this comment because it is the reason a courier should not
 * expect their last drop to clear first.
 *
 * **A queued action is a row, not a card.** `queueRows` is
 * `display:flex;gap:12px;padding:13px 0;border-bottom:1px solid var(--divider)`
 * (Xodimlar:751) — a ring, a label and one meta line. It was drawn as a bordered
 * panel with a third line for the state, which made a list of six pending
 * actions look like six documents.
 */
export default function QueueScreen() {
  const c = useTheme();
  const { lang } = useLocale();
  const insets = useSafeAreaInsets();
  const flash = useFlash();

  const t = copy(QUEUE_COPY, lang);
  const f = copy(FLASH, lang);
  const actions = useQueue();

  return (
    <SubScreen>
      <View style={{ paddingTop: insets.top }}>
        <SubHeader title={t.title} note={t.sub} />
      </View>

      <FlatList
        data={actions}
        keyExtractor={(action) => action.id}
        contentContainerStyle={[s.page, { paddingBottom: insets.bottom + size.sp9 }]}
        showsVerticalScrollIndicator={false}
        /*
         * `padding:30px 0;text-align:center;font-size:var(--text-sm);
         * color:var(--fg-subtle);line-height:1.5` — Xodimlar:748, and it is one
         * muted line. `<Empty>` draws a bold 15px title over a second line at 56
         * of padding, which is the shape of a screen that failed; an empty queue
         * is the shape of a screen that is up to date.
         */
        ListEmptyComponent={
          <Text style={[s.empty, { color: c.fgSubtle }]}>{`${t.empty}. ${t.emptySub}`}</Text>
        }
        renderItem={({ item }) => <Line action={item} labels={t} />}
        ListFooterComponent={
          <View>
            {actions.length === 0 ? null : (
              /* `height:48px;margin-top:16px;font-size:var(--text-sm)` — Xodimlar:760. */
              <Button
                height={48}
                style={s.action}
                textStyle={sansAt(600, size.textSm)}
                onPress={() => {
                  void drain().then((result) => {
                    /*
                     * The count is what landed, not what was tried. Flashed as
                     * a problem when nothing did — a toast that says "0 actions
                     * sent" in the same green as a success is a toast that
                     * teaches a courier to stop reading it.
                     */
                    flash(
                      fill(f.queueSent, { n: result.sent }),
                      result.sent === 0 ? 'problem' : undefined,
                    );
                  });
                }}
              >
                {t.retry}
              </Button>
            )}

            <Note>{t.order}</Note>
          </View>
        }
      />
    </SubScreen>
  );
}

function Line({
  action,
  labels,
}: {
  action: QueuedAction;
  labels: { waiting: string; sending: string; failed: string };
}) {
  const c = useTheme();

  const state =
    action.state === 'failed'
      ? { word: labels.failed, tone: c.danger500 }
      : action.state === 'sending'
        ? { word: labels.sending, tone: c.brand500 }
        : { word: labels.waiting, tone: c.warning500 };

  /*
   * `q.meta` is `HH:MM · yuborilmagan` (Xodimlar:1381) — the clock and the state
   * on one line, which is where the state belongs. It had a third line of its
   * own in caps; the ring now carries the colour and this line carries the word,
   * because a state said in a tint alone is a state a colour-blind reader does
   * not have.
   *
   * The detail sits between them: the design's queue has no such field, and ours
   * does — "Stol 12 · 284 000 so'm" is how a waiter tells two identical labels
   * apart.
   */
  const meta = [at(action.at), action.detail, state.word].filter(Boolean).join(' · ');

  return (
    <View style={[s.row, { borderBottomColor: c.divider }]}>
      {/* `width:22px;height:22px;border:1.5px solid {ring};margin-top:1px` —
          Xodimlar:752. Empty, as drawn: `q.mark` is the empty string. */}
      <View style={[s.ring, { borderColor: state.tone }]} />

      <View style={s.main}>
        <Text style={[s.label, { color: c.fg }]} numberOfLines={2}>
          {action.label}
        </Text>
        <Text style={[s.meta, text.num, { color: c.fgSubtle }]} numberOfLines={2}>
          {meta}
        </Text>
      </View>
    </View>
  );
}

/** The clock time the action was taken, which is the only ordering a reader has. */
const at = (stamp: number): string => {
  const when = new Date(stamp);

  return `${String(when.getHours()).padStart(2, '0')}:${String(when.getMinutes()).padStart(2, '0')}`;
};

const s = StyleSheet.create({
  page: { paddingHorizontal: size.sp5 },
  /* `gap:12px;padding:13px 0;border-bottom:1px solid var(--divider)` — the rule
     is one point, never the sub-pixel default, which is a third of that at @3x. */
  row: { flexDirection: 'row', gap: 12, paddingVertical: 13, borderBottomWidth: 1 },
  ring: { width: 22, height: 22, borderRadius: 11, borderWidth: 1.5, marginTop: 1 },
  main: { flex: 1, minWidth: 0 },
  /* `font-size:var(--text-sm);font-weight:600;line-height:1.35` — Xodimlar:754. */
  label: { ...sansAt(600, size.textSm, 1.35) },
  /* `--text-2xs;margin-top:3px` — Xodimlar:755. */
  meta: { ...sansAt(400, size.text2xs, 1.45), marginTop: 3 },
  /* One centred line at `--text-sm`, `line-height:1.5` — Xodimlar:748. */
  empty: { ...sansAt(400, size.textSm, 1.5), paddingVertical: 30, textAlign: 'center' },
  action: { marginTop: 16 },
});
