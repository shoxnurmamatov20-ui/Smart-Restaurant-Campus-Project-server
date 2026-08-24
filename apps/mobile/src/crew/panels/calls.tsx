import { useState } from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';

import { CALLS_COPY, copy, FLASH } from '@restaurant/surfaces/crew/copy';
import { say, type Call, type Lang } from '@restaurant/surfaces/crew/data';
import { realId } from '@restaurant/surfaces/crew/live';

import { useTheme } from '../../lib/theme-context';
import { size } from '../../theme';
import { sans, text } from '../../type';
import { Button, Empty } from '../../ui/primitives';
import { DemoLine, Panel } from '../bits';
import { DOCK_HEIGHT } from '../chrome';
import { useFlash } from '../flash';
import { useWaiterCalls } from '../live';
import { enqueue } from '../queue';

/**
 * Three things asking for this waiter, in the order they go stale.
 *
 * A ready plate is first and that is the whole ordering rule: it is losing
 * quality every second under the lamp, while a guest who pressed a button and a
 * table waiting for a bill are both waiting on a person and know it.
 *
 * The waiting clock is the number the guest is counting, so the design draws it
 * in the card's own colour at 11px/600 rather than as quiet metadata
 * (`Xodimlar ilovasi:372`).
 *
 * **No sentence above the list.** `mfAt.calls` (`Xodimlar ilovasi:367`) opens
 * on the first card, and the design's copy has no `callsIntro` key at all —
 * only `callsEmpty`. `CALLS_COPY.intro` stays in the catalogue rather than
 * being rendered here: it is a good sentence with no place in this drawing, and
 * putting it back would push the ready plate below the fold on a small handset,
 * which is the one thing this screen exists to prevent.
 */
export function CallsPanel({ lang }: { lang: Lang }) {
  const t = copy(CALLS_COPY, lang);
  const f = copy(FLASH, lang);
  const flash = useFlash();

  const [done, setDone] = useState<readonly string[]>([]);
  const calls = useWaiterCalls(lang);

  function mark(call: Call) {
    setDone((current) => [...current, call.id]);

    /*
     * The verb, at last — and only when the id is one the server knows.
     *
     * `call_resolve` reaches `FloorPlan::resolveCall()` and takes `call_id` as
     * an integer off `tables.waiter_calls`. While this board drew `CALLS`, a
     * fixture whose ids are words, there was nothing truthful to put in that
     * field: the entry came back `rejected: payload_incomplete` and told a
     * waiter their work had not landed when it was never theirs to send. So it
     * was queued without a kind — visible and unsendable, which is what
     * `queue.ts` asks for.
     *
     * Now the board is live the id is a row number and the verb goes on. The
     * guard stays because the fixture still stands in when the server refuses,
     * and a queued word id is the same lie it always was.
     */
    const id = realId(call.id);

    enqueue(
      say(call.action, lang),
      say(call.title, lang),
      id === null ? undefined : { kind: 'call_resolve', payload: { call_id: id } },
    );
    flash(f.callMarked);
  }

  return (
    <FlatList
      data={calls.data}
      keyExtractor={(call) => call.id}
      contentContainerStyle={s.page}
      showsVerticalScrollIndicator={false}
      ListHeaderComponent={
        calls.live ? null : (
          /* No fixture behind this one. Every card here carries a button that
             writes, and a waiter clearing a sample call has cleared nothing
             while believing they have — the guest is still waiting and the
             screen says they are not. */
          <DemoLine text={t.demoCalls} problem={calls.problem} onRetry={calls.reload} />
        )
      }
      ListEmptyComponent={<Empty title={t.empty} />}
      renderItem={({ item }) => (
        <CallCard
          call={item}
          lang={lang}
          done={done.includes(item.id)}
          doneWord={t.done}
          onDone={() => mark(item)}
        />
      )}
    />
  );
}

function CallCard({
  call,
  lang,
  done,
  doneWord,
  onDone,
}: {
  call: Call;
  lang: Lang;
  done: boolean;
  doneWord: string;
  onDone: () => void;
}) {
  const c = useTheme();

  /*
   * The colour is the design's, per kind — `Xodimlar ilovasi:1652` fixes it on
   * the fixture itself: a ready dish is `success-500`, a guest's call
   * `warning-500`, a bill request `brand-500`.
   *
   * This read red / amber / blue instead, which inverted the screen's meaning:
   * the plate under the lamp — the card that is *good news*, food finished and
   * waiting to be carried — was the alarm colour, and every other card was
   * pushed a level of alarm along with it. A waiter cannot triage a list where
   * the top item always looks like a fault.
   */
  const tint =
    call.kind === 'ready' ? c.success500 : call.kind === 'guest' ? c.warning500 : c.brand500;

  return (
    <Panel edge={tint} style={s.card}>
      <View style={s.head}>
        <Text style={[text.small, s.title, { color: c.fg }]}>{say(call.title, lang)}</Text>
        {/*
         * The bare clock, `0:40`. The design writes `{{c.ago}}` alone; this
         * appended "kutmoqda" after it, and the extra word both broke the
         * column of figures and pushed a long table title onto a second line.
         */}
        <Text style={[text.label, text.num, s.clock, { color: tint }]}>{call.waiting}</Text>
      </View>

      <Text style={[text.caption, s.body, { color: c.fgMuted }]}>{say(call.body, lang)}</Text>

      {done ? (
        /* The design simply drops the button when `c.open` is false. The line
           stays because the toast does not: without it a waiter who marked a
           call on a phone in their apron has nothing on screen saying so. It
           borrows the answered row the same file draws at `Xodimlar
           ilovasi:225` rather than inventing a shape. */
        <View style={[s.done, { backgroundColor: c.bgMuted, borderRadius: size.radiusMd }]}>
          <Text style={[text.caption, s.doneLine, { color: c.fgMuted }]}>{doneWord}</Text>
        </View>
      ) : (
        <Button
          kind="secondary"
          height={42}
          style={s.action}
          textStyle={s.actionLine}
          onPress={onDone}
        >
          {say(call.action, lang)}
        </Button>
      )}
    </Panel>
  );
}

const s = StyleSheet.create({
  page: { paddingHorizontal: 18, paddingTop: size.sp4, paddingBottom: DOCK_HEIGHT + size.sp6 },
  /* `padding:14px 16px;margin-bottom:10px` — `Xodimlar ilovasi:369`. `Panel`'s
     own 15 is overridden on both axes, so the card is the drawing's box. */
  card: { marginBottom: 10, paddingVertical: 14, paddingHorizontal: 16 },
  head: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 10 },
  title: { flex: 1, minWidth: 0, ...sans(600) },
  clock: { flexGrow: 0, flexShrink: 0 },
  body: { marginTop: 4, lineHeight: 18 },
  action: { marginTop: 11 },
  /* `--text-sm`, not the 15px a page CTA carries. */
  actionLine: { fontSize: size.textSm, lineHeight: 16 },
  done: { marginTop: 11, paddingVertical: 9, paddingHorizontal: 12, alignItems: 'center' },
  doneLine: { ...sans(600) },
});
