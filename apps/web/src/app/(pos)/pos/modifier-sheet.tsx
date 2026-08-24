'use client';

import { useState } from 'react';
import { useLocale, useMessages } from 'next-intl';
import { formatTiyinAmount } from '@restaurant/utils';

import { dishImageFrom } from '@restaurant/surfaces/media/image';

import type { Messages } from '@/i18n';
import { DishPhoto } from '@/components/dish-photo';
import type { PosDish, PosQuestion } from '@/lib/pos-session';
import { POS_COPY, say } from './pos-copy';

/**
 * What goes with the dish.
 *
 * Opened only when there is something to ask — most dishes have nothing, and
 * for those the tap rings the line straight up. That is the design's
 * "bir teginishda qo'shish" and it is the difference between a till a waiter
 * can use during a rush and one they fight.
 *
 * The rules come from the server and are enforced there too. Here they only
 * shape the screen: a single-choice group draws as radios so the previous
 * answer clears itself, and a multi-choice group stops accepting taps at its
 * maximum rather than letting somebody pick a sixth and be refused after they
 * have already put the tablet down.
 *
 * The running total is the sum of the deltas the server sent, not a price this
 * component worked out. Nothing here decides money — the line is priced when
 * the API takes it.
 */
export function ModifierSheet({
  dish,
  questions,
  busy,
  onCancel,
  onConfirm,
}: {
  dish: PosDish;
  questions: PosQuestion[];
  busy: boolean;
  onCancel: () => void;
  /** The chosen options, and whatever the waiter typed for the kitchen. */
  onConfirm: (choiceIds: number[], note: string) => void;
}) {
  const messages = useMessages() as Messages;
  const m = messages.console.pos;
  const locale = useLocale() as 'uz' | 'ru' | 'en';

  /** Chosen option ids, per question. */
  const [picked, setPicked] = useState<Record<number, number[]>>({});
  const [note, setNote] = useState('');

  const chosenIn = (question: PosQuestion) => picked[question.id] ?? [];

  function toggle(question: PosQuestion, choiceId: number) {
    setPicked((current) => {
      const already = current[question.id] ?? [];

      if (already.includes(choiceId)) {
        return { ...current, [question.id]: already.filter((id) => id !== choiceId) };
      }

      // Single choice replaces; multiple choice appends until the ceiling. The
      // ceiling is the server's number, not a guess.
      if (!question.is_multi || question.max_choices <= 1) {
        return { ...current, [question.id]: [choiceId] };
      }

      if (already.length >= question.max_choices) {
        return current;
      }

      return { ...current, [question.id]: [...already, choiceId] };
    });
  }

  const allChoiceIds = Object.values(picked).flat();

  /**
   * Whether every required question has been answered.
   *
   * Checked here so the button is honestly disabled rather than the waiter
   * discovering the requirement from a refusal. The server checks it again,
   * because a client's check is not a rule.
   */
  const complete = questions.every((question) => chosenIn(question).length >= question.min_choices);

  const extra = questions
    .flatMap((question) =>
      question.choices.filter((choice) => chosenIn(question).includes(choice.id)),
    )
    .reduce((sum, choice) => sum + choice.price_delta_tiyin, 0);

  return (
    <div
      data-fade
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/45 sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-label={dish.title}
    >
      {/* `data-sheet` / `data-fade` — the design's one overlay motion, 200ms up
          fourteen pixels behind a fade. Every sheet on this surface used to
          appear instantly, which on a tablet reads as a redraw rather than as
          something opening. `motion.css` owns the curve and the
          reduced-motion escape. */}
      {/* `--surface-raised` behind a border and the extra-large shadow — the
          design lifts every modal off the page (`dc.html:8223`), and on a till
          the sheet and the ticket panel behind it are otherwise the same flat
          white. */}
      <div
        data-sheet
        className="bg-surface-raised border-border flex max-h-[86vh] w-full max-w-[520px] flex-col rounded-t-[20px] border shadow-xl sm:rounded-[20px]"
      >
        <header className="border-divider flex-none border-b px-[26px] pt-6 pb-[18px]">
          {/*
           * The eyebrow the design puts over the dish name — `dc.html:8225`.
           *
           * A sheet that opens with a dish name and nothing else looks like a
           * dish being *ordered*; the caps line above it says this is the step
           * where it gets adjusted, which is what a waiter needs to know before
           * they read the options. `console.pos.modTitle` and `modSub` have
           * been in all three catalogues since the screen was drawn and nothing
           * read either of them.
           */}
          <div className="flex items-start gap-4">
            <div className="min-w-0 flex-1">
              <div className="text-fg-subtle text-2xs tracking-caps font-semibold uppercase">
                {say(locale, POS_COPY.mCustomise)}
              </div>
              <div className="font-display tracking-snug mt-2 text-xl leading-tight font-semibold">
                {dish.title}
              </div>
              <div data-num className="text-fg-subtle mt-1 text-sm">
                {formatTiyinAmount(dish.price_tiyin, locale)}
                {extra !== 0 ? ` + ${formatTiyinAmount(extra, locale)}` : ''} {m.som}
              </div>
            </div>

            {/* The plate beside the questions, when the kitchen has a picture
                of it. 72px — the one place on the till where the photograph
                is large enough to check "is this the one with the egg" before
                answering how it should be cooked. Nothing is drawn without
                one: the header is complete as text. */}
            <DishPhoto
              image={dishImageFrom(dish.image, dish.image_url)}
              alt=""
              sizes="72px"
              className="size-[72px] flex-none rounded-[12px]"
            />
          </div>
        </header>

        <div data-scroll className="min-h-0 flex-1 px-[26px] py-[22px]">
          {questions.map((question) => {
            const chosen = chosenIn(question);
            const atCeiling = question.is_multi && chosen.length >= question.max_choices;

            return (
              <section key={question.id} className="mb-6 last:mb-0">
                <div className="flex items-baseline justify-between gap-3">
                  <h3 className="text-sm font-semibold">{question.title}</h3>

                  <span className="text-fg-subtle text-2xs font-semibold">
                    {question.min_choices > 0
                      ? m.modRequired
                      : question.is_multi
                        ? m.modUpTo.replace('{n}', String(question.max_choices))
                        : m.modPickOne}
                  </span>
                </div>

                <div className="mt-2.5 grid gap-2">
                  {question.choices.map((choice) => {
                    const on = chosen.includes(choice.id);

                    return (
                      <button
                        key={choice.id}
                        type="button"
                        // A choice past the ceiling is not tappable, but an
                        // already-chosen one always is — otherwise the only way
                        // to change your mind is to close the sheet.
                        disabled={busy || (atCeiling && !on)}
                        onClick={() => toggle(question, choice.id)}
                        className={`flex min-h-[52px] items-center gap-3.5 rounded-md border px-4 text-left disabled:opacity-40 ${
                          on ? 'border-brand-500 bg-brand-50' : 'border-border'
                        }`}
                      >
                        {/*
                         * The 20px box the design puts at the head of every row
                         * (`dc.html:8238`). Without it the only thing marking a
                         * chosen option was a tinted background, which on the
                         * terrace at midday is not a difference — and there is
                         * no hover on a tablet to fall back on.
                         *
                         * A tick, not a radio dot, even for single-choice
                         * groups: the design draws one shape, and the exclusive
                         * ones enforce themselves by clearing the other row.
                         */}
                        <span
                          aria-hidden
                          className={`grid size-5 flex-none place-items-center rounded-[4px] border-[1.5px] text-white ${
                            on ? 'border-brand-500 bg-brand-500' : 'border-border-strong'
                          }`}
                        >
                          {on ? (
                            <svg
                              width="12"
                              height="12"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="3"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            >
                              <path d="M5 12.5 10 17.5 19 7" />
                            </svg>
                          ) : null}
                        </span>

                        <span className="flex-1 text-sm font-medium">{choice.title}</span>

                        <span data-num className="text-fg-muted flex-none text-sm">
                          {choice.price_delta_tiyin === 0
                            ? m.modFree
                            : `+${formatTiyinAmount(choice.price_delta_tiyin, locale)}`}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </section>
            );
          })}

          {/*
           * The note to the kitchen — `specs/01-os.md §5.19`.
           *
           * Not a modifier, and that is why it needs its own field: modifiers
           * are a closed set the menu decided on, and this is the sentence
           * nobody anticipated. "The child is allergic to sesame" has no
           * checkbox and must not be lost because there is nowhere to type it.
           */}
          <section className="border-divider mt-6 border-t pt-5">
            <h3 className="text-sm font-semibold">{say(locale, POS_COPY.mNote)}</h3>
            <input
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder={say(locale, POS_COPY.mNotePh)}
              disabled={busy}
              className="border-border bg-bg-subtle mt-2.5 h-12 w-full rounded-md border px-3.5 text-sm"
            />
          </section>
        </div>

        {/* `dc.html:8248` — 1 : 1.4, not 1 : 1. The confirm is the wider of the
            two because it is the one being aimed at; equal halves make a
            thumb-width difference between saving and discarding. */}
        <footer className="border-divider flex flex-none gap-2.5 border-t px-[26px] pt-[18px] pb-[22px]">
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="border-border h-12 flex-1 rounded-md border text-sm font-semibold disabled:opacity-40"
          >
            {m.pinCancel}
          </button>

          <button
            type="button"
            onClick={() => onConfirm(allChoiceIds, note.trim())}
            disabled={busy || !complete}
            className="bg-brand-500 h-12 flex-[1.4] rounded-md text-sm font-semibold text-white disabled:opacity-40"
          >
            {busy ? m.lineWorking : m.modDone}
          </button>
        </footer>
      </div>
    </div>
  );
}
