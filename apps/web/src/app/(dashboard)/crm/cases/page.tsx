import { getLocale, getTranslations } from 'next-intl/server';
import { formatTiyinAmount } from '@restaurant/utils';

import { moduleMetadata } from '../../module-page';
import { PageHead, Pill, StatStrip } from '../../screen';
import {
  AUTO_REFUND_CEILING,
  DECISION_RULES,
  halfOf,
  say,
  settlesItself,
  type CaseFact,
  type Lang,
  OUTCOME_FLASH,
  OUTCOME_LABEL,
  type CaseOutcome,
} from './cases-data';
import { getSession } from '@/lib/session';

import { getCases, getCasesMonth } from './cases-server';
import { CaseActions } from './case-actions';

export const generateMetadata = () => moduleMetadata('cases');

/**
 * The complaints desk.
 *
 * A queue of cards rather than a table, because a complaint is not a row of
 * comparable numbers — it is somebody's sentence plus the two facts that say
 * whose process failed. A table would show the id, the channel and the amount,
 * which are the three least useful things about it.
 *
 * Left edge carries the state: green where the rule settles it without asking
 * anyone, amber where it needs a person, grey once it is answered. That stripe
 * is doing the triage, so an answerer works down the greens in a minute and
 * spends their attention on the ambers.
 *
 * The four decision buttons are drawn with the amount already on them. Nobody
 * should be dividing 88 000 by two while a guest waits.
 *
 * Live, through `./cases-server.ts`: the queue, the four bars and the month's
 * cost. The rules panel stays a constant because it IS the rule — the ceiling
 * comes from `config/crm.php` and the API enforces it, and the three sentences
 * beside it explain what that means rather than reporting anything.
 */
const FACT_TONE: Record<NonNullable<CaseFact['tone']>, string> = {
  danger: 'text-danger-700',
  warning: 'text-warning-700',
  success: 'text-success-700',
};

export default async function CasesPage() {
  const [t, locale, queue, month, session] = await Promise.all([
    getTranslations('console.cases'),
    getLocale(),
    // The API when there is a session, the fixtures when there is not.
    getCases(),
    getCasesMonth(),
    getSession(),
  ]);
  const lang = locale as Lang;
  const cases = queue.rows;

  /* The four outcome sentences, resolved once. The card's buttons are a client
     leaf and must not carry a catalogue across the boundary to say them. */
  const outcomeFlash = Object.fromEntries(
    (Object.keys(OUTCOME_FLASH) as CaseOutcome[]).map((key) => [
      key,
      say(OUTCOME_FLASH[key], lang),
    ]),
  ) as Record<CaseOutcome, string>;

  const outcomeLabel = Object.fromEntries(
    (Object.keys(OUTCOME_LABEL) as CaseOutcome[]).map((key) => [
      key,
      say(OUTCOME_LABEL[key], lang),
    ]),
  ) as Record<CaseOutcome, string>;
  const money = (tiyin: number) => formatTiyinAmount(tiyin, lang);

  /* Rendered on the server so the label reads the same as every other clock in
     this console — the browser's zone is the guest's, not the venue's. */
  const nowClock = new Intl.DateTimeFormat(locale, {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date());

  const open = cases.filter((c) => c.outcome === undefined);
  /* The queue arrives oldest first, so the oldest still-open complaint is the
     first one without an outcome. `ago` is already a phrase the row prints. */
  const oldestOpen = open[0] === undefined ? undefined : say(open[0].ago, lang);
  const withPhotos = cases.filter((c) => c.photos > 0);
  /* Guarded, because a live month with no complaints in it divides by zero and
     draws five bars of `NaN%`. */
  const biggest = Math.max(1, ...month.causes.map((cause) => cause.count));
  const costTotalTiyin = month.cost.reduce((sum, line) => sum + line.amount, 0);

  return (
    <>
      <PageHead title={t('title')} subtitle={t('sub')} />

      {/*
       * Four captions, none of them a catalogue figure any more.
       *
       * They read "eng qadimgisi 1 soat", "1 842 buyurtmadan 1.8%", "me'yor 15
       * daqiqa" and "aylanmaning 0.4%" — so a tenant with zero complaints was
       * told that 1.8% of its 1 842 orders had drawn one. The age comes from
       * the oldest OPEN case, which is the last row of a queue the API sorts
       * oldest first; the other three say which window they cover, which is
       * the one thing about them that is true and useful.
       */}
      <StatStrip
        stats={[
          {
            label: t('kpiOpen'),
            value: String(open.length),
            note: oldestOpen === undefined ? '' : t('kpiOpenNoteLive', { age: oldestOpen }),
            tone: open.length > 2 ? 'danger' : undefined,
          },
          {
            label: t('kpiMonth'),
            value: String(month.total),
            note: queue.live ? t('windowNote') : t('kpiMonthNote'),
          },
          {
            label: t('kpiAnswer'),
            /* An em dash rather than a zero for a month nobody has answered
               anything in: "0 daqiqa" reads as instant service. */
            value: month.answerMinutes === null ? '—' : t('minutes', { n: month.answerMinutes }),
            note: month.live ? t('kpiAnswerNoteLive') : t('kpiAnswerNote'),
            tone: month.answerMinutes !== null && month.answerMinutes <= 15 ? 'success' : undefined,
          },
          {
            label: t('kpiRefunded'),
            value: money(costTotalTiyin),
            note: month.live ? t('windowNote') : t('kpiRefundedNote'),
          },
        ]}
      />

      <div className="mt-7 grid gap-3 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        {/* ------------------------------------------------------- the queue */}
        <section className="flex flex-col gap-3">
          {/*
           * Counts are live; the control still does not filter, and that is a
           * deliberate half. `GET /crm/cases` takes `filter[open]` and
           * `filter[status]`, so the endpoint is there — but a filter is a place
           * in this console (a link, a search param, a refresh) rather than
           * local state, and the design draws these three as a caption rather
           * than as a segmented control. Making them clickable is a route
           * change, not a wiring one.
           */}
          <div className="text-fg-muted flex items-center gap-3 text-xs">
            <span className="text-fg font-semibold">{t('filterOpen', { n: open.length })}</span>
            <span>·</span>
            <span>{t('filterPhoto', { n: withPhotos.length })}</span>
            <span>·</span>
            <span>{t('filterAll', { n: cases.length })}</span>
          </div>

          {/* A restaurant nobody has complained about reads that, rather than
              the design's three open cases with money attached. */}
          {cases.length === 0 ? (
            <div className="bg-surface rounded-lg border px-5 py-10 text-center">
              <p className="text-md font-semibold">{t('queueEmpty')}</p>
            </div>
          ) : null}

          {cases.map((complaint) => {
            const auto = settlesItself(complaint);

            return (
              <article
                key={complaint.id}
                className="bg-surface rounded-lg border border-l-4 p-5"
                style={{
                  borderLeftColor: complaint.outcome
                    ? 'var(--border)'
                    : auto
                      ? 'var(--success-500)'
                      : 'var(--warning-500)',
                }}
              >
                <header className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span data-num className="text-fg-subtle text-xs font-semibold">
                        {complaint.id}
                      </span>
                      <Pill tone="neutral">{say(complaint.channel, lang)}</Pill>
                      <span className="font-semibold">{t(`kind.${complaint.kind}`)}</span>
                      {complaint.outcome ? (
                        <Pill tone="neutral">{t(`outcome.${complaint.outcome}`)}</Pill>
                      ) : (
                        <Pill tone="warning">{t('open')}</Pill>
                      )}
                    </div>
                    <p className="text-fg-muted mt-1 text-xs">{say(complaint.who, lang)}</p>
                  </div>

                  <div className="text-right">
                    <div data-num className="text-lg font-semibold">
                      {money(complaint.amount)}
                    </div>
                    <div className="text-fg-subtle text-xs">{say(complaint.amountNote, lang)}</div>
                  </div>
                </header>

                {/*
                 * The guest's own words, set apart and never paraphrased. The
                 * wording is the evidence: "the courier said that is what he
                 * was handed" points at packing, not at the courier.
                 */}
                <blockquote className="border-brand-500/40 bg-bg-subtle mt-3.5 border-l-2 py-2 pl-3.5 text-sm leading-normal italic">
                  {say(complaint.quote, lang)}
                </blockquote>

                <p className="text-fg-subtle mt-2 flex items-center gap-2.5 text-xs">
                  <span>{say(complaint.ago, lang)}</span>
                  {complaint.photos > 0 ? (
                    <>
                      <span>·</span>
                      <span className="text-brand-600 font-medium">
                        {t('photos', { n: complaint.photos })}
                      </span>
                    </>
                  ) : null}
                </p>

                <dl className="border-divider mt-3.5 grid gap-x-6 gap-y-1.5 border-t pt-3 text-xs sm:grid-cols-3">
                  {complaint.facts.map((fact) => (
                    <div key={say(fact.label, lang)}>
                      <dt className="text-fg-subtle">{say(fact.label, lang)}</dt>
                      <dd className={`font-medium ${fact.tone ? FACT_TONE[fact.tone] : ''}`}>
                        {say(fact.value, lang)}
                      </dd>
                    </div>
                  ))}
                </dl>

                {auto ? (
                  <p className="border-success-500/30 bg-success-50 text-success-700 mt-3.5 rounded-md border px-3.5 py-2.5 text-xs leading-normal">
                    {t('autoNote', { ceiling: money(AUTO_REFUND_CEILING) })}
                  </p>
                ) : null}

                {complaint.outcome ? (
                  <p className="text-fg-subtle mt-3.5 text-xs">
                    {t('settledBy', { who: complaint.settledBy ?? '—' })}
                  </p>
                ) : (
                  <CaseActions
                    caseId={complaint.apiId ?? null}
                    amounts={{ full: complaint.amount, half: halfOf(complaint.amount) }}
                    lang={lang}
                    labels={{
                      refundFull: t('refundFull', { amount: money(complaint.amount) }),
                      refundHalf: t('refundHalf', { amount: money(halfOf(complaint.amount)) }),
                      givePoints: t('givePoints'),
                      decline: t('decline'),
                    }}
                    messages={outcomeFlash}
                    outcomeLabels={outcomeLabel}
                    /* Whoever is actually signed in, at whatever time it
                       actually is. This was `'Aziza R. · 11:24'`, so every
                       complaint a real manager resolved was attributed on
                       screen to a person who does not work there. */
                    settledBy={t('settledBy', { who: `${session.user.name} · ${nowClock}` })}
                  />
                )}
              </article>
            );
          })}
        </section>

        {/* -------------------------------------------------------- the side */}
        <aside className="flex flex-col gap-3">
          <section className="bg-surface rounded-lg border p-5">
            <h3 className="text-md font-semibold">{t('rulesTitle')}</h3>
            <p className="text-fg-subtle mt-1 text-xs leading-normal">{t('rulesSub')}</p>

            <ol className="mt-3.5 flex flex-col gap-3">
              {DECISION_RULES.map((rule) => (
                <li key={rule.n} className="flex gap-3">
                  <span
                    data-num
                    className="bg-bg-muted text-fg-muted flex size-6 flex-none items-center justify-center rounded-full text-xs font-semibold"
                  >
                    {rule.n}
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm font-medium">{say(rule.title, lang)}</span>
                    <span className="text-fg-subtle block text-xs leading-normal">
                      {say(rule.body, lang)}
                    </span>
                  </span>
                </li>
              ))}
            </ol>
          </section>

          <section className="bg-surface rounded-lg border p-5">
            <h3 className="text-md font-semibold">{t('causesTitle')}</h3>
            <p className="text-fg-subtle mt-1 text-xs leading-normal">{t('causesSub')}</p>

            <ul className="mt-3.5 flex flex-col gap-2.5">
              {month.causes.map((cause) => (
                <li key={cause.kind}>
                  <div className="flex items-baseline justify-between text-sm">
                    <span>{say(cause.label, lang)}</span>
                    <span data-num className="font-semibold">
                      {cause.count}
                    </span>
                  </div>
                  <div className="bg-bg-muted mt-1 h-1.5 overflow-hidden rounded-full">
                    <div
                      className={`h-full rounded-full ${cause.tone}`}
                      style={{ width: `${Math.round((cause.count / biggest) * 100)}%` }}
                    />
                  </div>
                </li>
              ))}
            </ul>

            {/* The catalogue's note asserts a finding — "between 19:00 and
                20:00 one courier takes three orders" — about this restaurant.
                Live, the chart is the finding and the note is guidance. */}
            <p className="text-fg-muted mt-4 text-xs leading-normal">
              {month.live ? t('causesNoteGuide') : t('causesNote')}
            </p>
          </section>

          <section className="bg-surface rounded-lg border p-5">
            <h3 className="text-md font-semibold">{t('costTitle')}</h3>

            <dl className="mt-3.5 text-sm">
              {month.cost.map((line) => (
                <div key={say(line.label, lang)} className="flex justify-between py-1">
                  <dt className="text-fg-muted">{say(line.label, lang)}</dt>
                  <dd data-num className="font-medium">
                    {money(line.amount)}
                  </dd>
                </div>
              ))}
              <div className="border-divider mt-2 flex items-baseline justify-between border-t pt-2.5">
                <dt className="font-semibold">{t('costTotal')}</dt>
                {/* Summed from the three lines above, never written twice. */}
                <dd data-num className="text-xl font-bold">
                  {money(costTotalTiyin)}
                </dd>
              </div>
            </dl>

            <p className="text-fg-muted mt-4 text-xs leading-normal">
              {month.live ? t('costNoteGuide') : t('costNote')}
            </p>
          </section>
        </aside>
      </div>
    </>
  );
}
