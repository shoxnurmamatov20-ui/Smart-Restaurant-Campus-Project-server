'use client';

import { useState } from 'react';
import { flash } from '@restaurant/ui';
import { formatNumber, formatTiyinAmount, formatTiyinCompact } from '@restaurant/utils';

import { post } from '@/lib/console-post';

import type { MarketingBoard } from './marketing-server';

import {
  breakEven,
  CAMPAIGN_STATE,
  DEFAULT_MESSAGE,
  DEFAULT_SEGMENT,
  LOYALTY_KPIS,
  MARKETING_COPY,
  MARKETING_UI,
  POINTS_LIABILITY,
  say,
  smsCost,
  smsParts,
  TIERS,
  type Campaign,
  type Lang,
  type Promotion,
  type Segment,
  type Trigger,
} from './marketing-data';

/**
 * Marketing's four tabs, `Smart Restaurant OS.dc.html:2841-3001`.
 *
 * The composer is the piece worth reading twice. It is not a form that posts a
 * campaign: it is a calculator that runs while you type, and the two figures it
 * lands on — the cost, and how many orders it takes to earn that back — are the
 * only reason a marketer opens this screen before pressing send rather than
 * after. Typing one Cyrillic character halves the characters per part and more
 * than doubles the bill; the alphabet line says so before the invoice does.
 *
 * Three of the four tabs write now. The composer sends, the pause button
 * pauses, the automation switch switches — each through `/api/crm`, which
 * forwards the reader's own token upstream. Every refusal is the API's and
 * arrives with its own sentence; nothing here decides anything, and the
 * ceiling, the quiet hours and the four-part limit all live on the server.
 *
 * The loyalty tab is the exception and is still fixtures. That is a different
 * gap from the one the other three had: tiers and the points liability are a
 * report over `crm.loyalty_transactions` rather than a table of their own, and
 * that report has no endpoint.
 *
 * Every row arrives as a prop from `./marketing-server.ts`. A client component
 * that imported the fixtures directly would have no way to be given the real
 * ones, which is what kept this screen a demonstration.
 */

const CARD = 'bg-surface rounded-lg border';

/** The design's 46×26 toggle on the automation cards, `:2996`. */
function Toggle({
  on,
  label,
  onClick,
  disabled = false,
}: {
  on: boolean;
  label: string;
  onClick: () => void;
  /** While a write is in flight. A switch that can be flipped twice sends twice. */
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className={`rounded-pill flex h-[26px] w-[46px] flex-none cursor-pointer items-center self-center border-0 p-[3px] transition-colors disabled:opacity-60 ${
        on ? 'bg-brand-500 justify-end' : 'bg-n-300 justify-start'
      }`}
    >
      <span className="size-5 rounded-full bg-white shadow-sm" />
    </button>
  );
}

/* =============================================================== campaigns */

function CampaignsPanel({
  lang,
  campaigns,
  segments,
  smsSpend,
}: {
  lang: Lang;
  campaigns: readonly Campaign[];
  segments: readonly Segment[];
  smsSpend: number;
}) {
  const [segmentId, setSegmentId] = useState(DEFAULT_SEGMENT);
  const [text, setText] = useState(say(DEFAULT_MESSAGE, lang));
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  const segment = segments.find((entry) => entry.id === segmentId) ?? segments[1] ?? segments[0]!;
  const { parts, cyrillic } = smsParts(text);
  const cost = smsCost(parts, segment.count);

  return (
    <div data-split className="grid [grid-template-columns:minmax(0,1fr)_380px] items-start gap-5">
      {/* ------------------------------------------------------ what was sent */}
      <div className={`${CARD} overflow-hidden`}>
        <div className="border-divider flex items-center justify-between border-b px-[22px] py-[18px]">
          <span className="text-sm font-semibold">{say(MARKETING_UI.sentHead, lang)}</span>
          <span data-num className="text-fg-subtle text-xs">
            {say(MARKETING_UI.monthCost, lang)} {formatTiyinAmount(smsSpend, lang)}
          </span>
        </div>

        <div data-scroll className="overflow-x-auto">
          <table className="w-full min-w-[660px] border-collapse">
            <thead>
              <tr className="bg-bg-subtle">
                {[
                  { label: say(MARKETING_UI.colName, lang), right: false },
                  { label: say(MARKETING_UI.colTo, lang), right: true },
                  { label: say(MARKETING_UI.colUsed, lang), right: true },
                  { label: say(MARKETING_UI.colRevenue, lang), right: true },
                  { label: say(MARKETING_UI.colCost, lang), right: true },
                ].map((column, index) => (
                  <th
                    key={column.label}
                    className={`text-2xs tracking-caps text-fg-subtle py-2.5 font-semibold uppercase ${
                      column.right ? 'text-right' : 'text-left'
                    } ${index === 0 || index === 4 ? 'px-[22px]' : 'px-3.5'}`}
                  >
                    {column.label}
                  </th>
                ))}
              </tr>
            </thead>

            <tbody>
              {campaigns.map((campaign) => {
                const state = CAMPAIGN_STATE[campaign.state];

                return (
                  <tr key={say(campaign.name, lang)} data-row className="border-divider border-t">
                    <td className="px-[22px] py-[13px]">
                      <div className="text-sm font-semibold">{say(campaign.name, lang)}</div>
                      <div className="mt-1 flex items-center gap-2">
                        <span
                          className={`rounded-pill text-2xs px-2 py-[3px] font-semibold ${state.className}`}
                        >
                          {say(state.label, lang)}
                        </span>
                        <span data-num className="text-fg-subtle text-xs">
                          {say(campaign.segment, lang)} · {campaign.date}
                        </span>
                      </div>
                    </td>

                    <td data-num className="text-fg-muted px-3.5 py-[13px] text-right text-sm">
                      {formatNumber(campaign.recipients, lang)}
                    </td>
                    <td data-num className="px-3.5 py-[13px] text-right text-sm font-semibold">
                      {campaign.redeemed > 0 ? formatNumber(campaign.redeemed, lang) : '—'}
                    </td>
                    <td data-num className="px-3.5 py-[13px] text-right text-sm font-semibold">
                      {campaign.revenue > 0 ? formatTiyinCompact(campaign.revenue, lang) : '—'}
                    </td>
                    <td
                      data-num
                      className="text-fg-muted px-[22px] py-[13px] text-right text-sm font-semibold"
                    >
                      {formatTiyinAmount(campaign.cost, lang)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* -------------------------------------------------------- the composer */}
      <div className={`${CARD} p-[22px]`}>
        <div className="text-sm font-semibold">{say(MARKETING_UI.newCampaign, lang)}</div>

        <span className="text-fg-muted mt-4 block text-xs font-semibold">
          {say(MARKETING_UI.segment, lang)}
        </span>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {segments.map((entry) => {
            const active = entry.id === segmentId;

            return (
              <button
                key={entry.id}
                type="button"
                data-press
                onClick={() => setSegmentId(entry.id)}
                className={`rounded-pill h-[30px] border px-3 text-xs font-semibold ${
                  active
                    ? 'bg-brand-500 border-brand-500 text-white'
                    : 'bg-surface border-border-strong text-fg-muted'
                }`}
              >
                {say(entry.name, lang)} · {formatNumber(entry.count, lang)}
              </button>
            );
          })}
        </div>

        <label className="text-fg-muted mt-4 block text-xs font-semibold">
          {say(MARKETING_UI.messageText, lang)}
          <textarea
            rows={4}
            value={text}
            onChange={(event) => setText(event.target.value)}
            placeholder={say(MARKETING_UI.placeholder, lang)}
            className="border-border-strong bg-surface text-fg mt-2 w-full resize-y rounded-md border px-[13px] py-[11px] text-sm leading-normal font-normal"
          />
        </label>

        <div className="mt-2 flex items-center justify-between">
          <span data-num className="text-fg-subtle text-xs">
            {text.length} {say(MARKETING_UI.characters, lang)} · {parts} SMS
          </span>
          {/*
           * Amber on Cyrillic, and it is not decoration: the same message in
           * Cyrillic costs more than twice as much to send.
           */}
          <span
            data-num
            className={`text-xs font-semibold ${cyrillic ? 'text-warning-600' : 'text-fg-subtle'}`}
          >
            {say(cyrillic ? MARKETING_UI.cyrillic : MARKETING_UI.latin, lang)}
          </span>
        </div>

        <div className="bg-bg-subtle mt-4 rounded-md border p-3.5">
          <div className="flex justify-between text-sm">
            <span className="text-fg-muted">{say(MARKETING_UI.colTo, lang)}</span>
            <span data-num className="font-semibold">
              {formatNumber(segment.count, lang)}
            </span>
          </div>

          <div className="mt-[7px] flex justify-between text-sm">
            <span className="text-fg-muted">{say(MARKETING_UI.estimatedCost, lang)}</span>
            <span data-num className="font-semibold">
              {formatTiyinAmount(cost, lang)}
            </span>
          </div>

          <div className="mt-[7px] flex justify-between border-t pt-[9px] text-sm">
            <span className="text-fg-muted">{say(MARKETING_UI.breakEven, lang)}</span>
            <span data-num className="font-bold">
              {breakEven(cost)} {say(MARKETING_UI.ordersWord, lang)}
            </span>
          </div>
        </div>

        <button
          type="button"
          data-press
          disabled={sending || sent}
          onClick={async () => {
            if (text.trim() === '') {
              flash.problem(say(MARKETING_COPY.emptyMessage, lang));

              return;
            }

            setSending(true);

            /*
             * One press, two calls: the draft is written and then sent.
             *
             * Both happen server-side in `/api/crm` rather than here, so the
             * campaign row exists before a single message leaves — a worker
             * that died between the two would otherwise have sent paid SMS that
             * nothing knows about, and a second press would send them again.
             *
             * The recipient list is frozen at that moment and the delivery rows
             * carry the number each message actually went to. What the gateway
             * charges lands on the same row as the estimate above it, which is
             * the whole reason the estimate is worth showing: a number nobody
             * ever reconciles against an invoice is one a marketer stops
             * believing by the third month.
             *
             * The gateway itself is `App\Contracts\Messaging\SmsSender` — a
             * log driver on a laptop, Eskiz in production. What is missing is
             * an account, not code.
             */
            const answer = await post<unknown>(
              '/api/crm',
              { action: 'campaign-send', body: text, segment: segment.id },
              lang,
            );

            setSending(false);

            if (!answer.ok) {
              flash.problem(answer.message ?? say(MARKETING_COPY.emptyMessage, lang));

              return;
            }

            // The button latches rather than resetting: the list behind it is a
            // server render and will not show the new row until the page is
            // reloaded, and a button that went back to "send" would be pressed
            // again by somebody who could not see the first one land.
            setSent(true);
            flash(`${formatNumber(segment.count, lang)} ${say(MARKETING_COPY.scheduled, lang)}`);
          }}
          className="bg-brand-500 hover:bg-brand-600 mt-3.5 h-[42px] w-full rounded-md text-sm font-semibold text-white disabled:opacity-60"
        >
          {say(MARKETING_UI.scheduleSend, lang)}
        </button>

        <p className="text-fg-subtle mt-3 text-xs leading-normal">
          {say(MARKETING_UI.legalNote, lang)}
        </p>
      </div>
    </div>
  );
}

/* ============================================================== promotions */

function PromotionsPanel({ lang, promotions }: { lang: Lang; promotions: readonly Promotion[] }) {
  const [paused, setPaused] = useState<Readonly<Record<number, boolean>>>({});
  const [busy, setBusy] = useState(false);

  return (
    <div className="flex flex-col gap-3">
      {promotions.map((promo, index) => {
        const on = paused[index] === undefined ? promo.on : !paused[index];

        return (
          <div
            key={say(promo.name, lang)}
            className={`${CARD} px-[22px] py-[18px]`}
            style={{ borderLeft: `3px solid ${on ? promo.accent : 'var(--n-300)'}` }}
          >
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="min-w-[220px] flex-1">
                <div className="flex items-center gap-[9px]">
                  <span className="text-md font-semibold">{say(promo.name, lang)}</span>
                  <span
                    className={`rounded-pill text-2xs px-2 py-[3px] font-semibold ${
                      on ? 'bg-success-50 text-success-700' : 'bg-bg-muted text-fg-muted'
                    }`}
                  >
                    {say(on ? MARKETING_UI.live : MARKETING_UI.paused, lang)}
                  </span>
                </div>

                <div className="text-fg-muted mt-[5px] text-sm">{say(promo.rule, lang)}</div>
                <div data-num className="text-fg-subtle mt-1.5 text-xs">
                  {say(promo.when, lang)} · {say(promo.where, lang)}
                </div>
              </div>

              <div className="flex flex-wrap items-start gap-[26px]">
                <div>
                  <div className="text-2xs text-fg-subtle">{say(MARKETING_UI.colUsed, lang)}</div>
                  <div data-num className="font-display mt-0.5 text-xl font-bold">
                    {formatNumber(promo.used, lang)}
                  </div>
                </div>

                <div>
                  <div className="text-2xs text-fg-subtle">
                    {say(MARKETING_UI.colRevenue, lang)}
                  </div>
                  <div data-num className="font-display mt-0.5 text-xl font-bold">
                    {formatTiyinCompact(promo.revenue, lang)}
                  </div>
                </div>

                <div>
                  <div className="text-2xs text-fg-subtle">
                    {say(MARKETING_UI.marginImpact, lang)}
                  </div>
                  <div
                    data-num
                    className={`font-display mt-0.5 text-xl font-bold ${
                      promo.margin >= 35
                        ? 'text-success-600'
                        : promo.margin >= 28
                          ? ''
                          : 'text-warning-600'
                    }`}
                  >
                    {promo.margin.toFixed(1)}%
                  </div>
                </div>

                <button
                  type="button"
                  data-press
                  disabled={busy}
                  onClick={async () => {
                    /*
                     * The card moves first. A marketer pausing an offer that is
                     * costing money wants it to stop now, and a button that does
                     * nothing for a second is one they press twice.
                     *
                     * `pause` and `resume` are their own endpoints rather than a
                     * PATCH carrying `is_active`, because this control is one tap
                     * with no form behind it: a PATCH assembled from a stale card
                     * could quietly rewrite the hours, the dishes or the channel
                     * while doing nothing more than switching the offer off.
                     */
                    setPaused((current) => ({ ...current, [index]: on }));
                    setBusy(true);

                    // A fixture row has no id — `apiId` is absent — so there is
                    // nothing upstream to aim at, and the card still answers.
                    if (promo.apiId === undefined) {
                      setBusy(false);
                      flash(say(on ? MARKETING_COPY.promoPaused : MARKETING_COPY.promoLive, lang));

                      return;
                    }

                    const answer = await post<unknown>(
                      '/api/crm',
                      {
                        action: on ? 'promotion-pause' : 'promotion-resume',
                        id: promo.apiId,
                      },
                      lang,
                    );

                    setBusy(false);

                    if (!answer.ok) {
                      // Put the card back: the offer is still whatever it was.
                      setPaused((current) => ({ ...current, [index]: !on }));
                      flash.problem(answer.message ?? say(MARKETING_UI.pause, lang));

                      return;
                    }

                    flash(say(on ? MARKETING_COPY.promoPaused : MARKETING_COPY.promoLive, lang));
                  }}
                  className="border-border-strong bg-surface hover:bg-bg-muted text-fg h-[34px] self-center rounded-md border px-3.5 text-sm font-semibold disabled:opacity-60"
                >
                  {say(on ? MARKETING_UI.pause : MARKETING_UI.resume, lang)}
                </button>
              </div>
            </div>

            {promo.warning !== undefined && on ? (
              <div className="bg-warning-50 mt-3.5 flex items-start gap-2.5 rounded-md border border-[rgba(247,144,9,.24)] px-[13px] py-[11px]">
                <span
                  aria-hidden
                  className="bg-warning-500 mt-1.5 size-1.5 flex-none rounded-full"
                />
                <span className="text-warning-600 text-xs leading-normal font-medium">
                  {say(promo.warning, lang)}
                </span>
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

/* ================================================================= loyalty */

function LoyaltyPanel({ lang }: { lang: Lang }) {
  return (
    <>
      <div className="mb-5 grid [grid-template-columns:repeat(auto-fit,minmax(min(190px,100%),1fr))] gap-3">
        {LOYALTY_KPIS.map((kpi) => (
          <div key={say(kpi.label, lang)} className={`${CARD} px-5 py-[18px]`}>
            <div className="text-fg-subtle text-xs font-medium">{say(kpi.label, lang)}</div>
            <div
              data-num
              className={`font-display mt-1.5 text-3xl font-bold tracking-tight ${
                kpi.tone === 'success' ? 'text-success-600' : ''
              }`}
            >
              {kpi.value ?? formatTiyinAmount(kpi.amount ?? 0, lang)}
            </div>
            <div data-num className="text-fg-subtle mt-[5px] text-xs">
              {say(kpi.note, lang)}
            </div>
          </div>
        ))}
      </div>

      <div
        data-split
        className="grid [grid-template-columns:minmax(0,1fr)_400px] items-start gap-5"
      >
        <div className={`${CARD} px-6 py-[22px]`}>
          <div className="text-sm font-semibold">{say(MARKETING_UI.tiers, lang)}</div>

          <div className="mt-4 flex flex-col gap-2.5">
            {TIERS.map((tier) => (
              <div
                key={say(tier.name, lang)}
                className="flex items-center gap-3.5 rounded-md border px-4 py-3.5"
              >
                <span
                  aria-hidden
                  className="size-2 flex-none rounded-full"
                  style={{ background: tier.dot }}
                />

                <div className="min-w-0 flex-1">
                  <div className="text-sm font-semibold">{say(tier.name, lang)}</div>
                  <div data-num className="text-fg-subtle mt-0.5 text-xs">
                    {say(tier.rule, lang)}
                  </div>
                </div>

                <div className="text-right">
                  <div data-num className="text-sm font-bold">
                    {formatNumber(tier.members, lang)}
                  </div>
                  <div className="text-2xs text-fg-subtle mt-px">
                    {say(MARKETING_UI.members, lang)}
                  </div>
                </div>

                <div className="min-w-[74px] text-right">
                  <div data-num className="text-sm font-bold">
                    {formatTiyinAmount(tier.averageOrder, lang)}
                  </div>
                  <div className="text-2xs text-fg-subtle mt-px">
                    {say(MARKETING_UI.averageOrder, lang)}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className={`${CARD} px-6 py-[22px]`}>
          <div className="text-sm font-semibold">{say(MARKETING_UI.liability, lang)}</div>

          <div data-num className="font-display mt-2.5 text-4xl font-bold tracking-tight">
            {formatTiyinAmount(POINTS_LIABILITY.total, lang)}
          </div>
          <div data-num className="text-fg-subtle mt-1.5 text-xs">
            {say(POINTS_LIABILITY.note, lang)}
          </div>

          <div className="bg-bg-subtle mt-4 flex items-start gap-2.5 rounded-md border p-[13px]">
            <span aria-hidden className="bg-brand-500 mt-1.5 size-1.5 flex-none rounded-full" />
            <span className="text-fg-muted text-xs leading-relaxed">
              {say(MARKETING_UI.liabilityNote, lang)}
            </span>
          </div>

          <div className="border-divider mt-[18px] border-t pt-4">
            {[
              { label: MARKETING_UI.issued, amount: POINTS_LIABILITY.issued },
              { label: MARKETING_UI.redeemed, amount: POINTS_LIABILITY.redeemed },
              { label: MARKETING_UI.expired, amount: POINTS_LIABILITY.expired },
            ].map((row, index) => (
              <div
                key={say(row.label, lang)}
                className={`flex justify-between text-sm ${index > 0 ? 'mt-2' : ''}`}
              >
                <span className="text-fg-muted">{say(row.label, lang)}</span>
                <span data-num className="font-semibold">
                  {formatTiyinAmount(row.amount, lang)}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}

/* ============================================================== automation */

function AutomationPanel({ lang, triggers }: { lang: Lang; triggers: readonly Trigger[] }) {
  const [state, setState] = useState<Readonly<Record<string, boolean>>>({});
  const [busy, setBusy] = useState(false);

  return (
    <div className="flex flex-col gap-3">
      {triggers.map((trigger) => {
        const on = state[trigger.id] ?? trigger.on;
        const rate = trigger.sent > 0 ? Math.round((trigger.converted / trigger.sent) * 100) : 0;

        return (
          <div key={trigger.id} className={`${CARD} px-[22px] py-5`}>
            <div className="flex flex-wrap items-start gap-4">
              <div className="min-w-[240px] flex-1">
                <div className="text-md font-semibold">{say(trigger.name, lang)}</div>
                <div className="text-fg-muted mt-[5px] text-sm leading-relaxed">
                  {say(trigger.rule, lang)}
                </div>
                <div
                  data-num
                  className="bg-bg-subtle text-fg-subtle mt-[9px] rounded-sm px-[11px] py-2 font-mono text-xs leading-normal"
                >
                  {say(trigger.message, lang)}
                </div>
              </div>

              <div className="flex flex-wrap items-start gap-6">
                <div>
                  <div className="text-2xs text-fg-subtle">{say(MARKETING_UI.audience, lang)}</div>
                  <div data-num className="font-display mt-0.5 text-xl font-bold">
                    {formatNumber(trigger.audience, lang)}
                  </div>
                </div>

                <div>
                  <div className="text-2xs text-fg-subtle">{say(MARKETING_UI.thisMonth, lang)}</div>
                  <div data-num className="font-display mt-0.5 text-xl font-bold">
                    {on ? formatNumber(trigger.sent, lang) : '—'}
                  </div>
                </div>

                <div>
                  <div className="text-2xs text-fg-subtle">{say(MARKETING_UI.converted, lang)}</div>
                  <div
                    data-num
                    className={`font-display mt-0.5 text-xl font-bold ${
                      on && rate >= 30 ? 'text-success-600' : ''
                    }`}
                  >
                    {on && trigger.sent > 0 ? `${rate}%` : '—'}
                  </div>
                </div>

                <Toggle
                  on={on}
                  label={say(trigger.name, lang)}
                  disabled={busy}
                  onClick={async () => {
                    /*
                     * The switch is the smallest part of what it turns on.
                     *
                     * Behind it: `crm:triggers` walks the guest list every
                     * morning at 09:05 — the first minute a marketing SMS may
                     * legally go out — asks this trigger's own question, drops
                     * everybody who has had the message inside its cooldown, and
                     * hands whoever is left to the same dispatch path a
                     * marketer's own campaign takes. So an automation appears in
                     * the campaign list as a campaign, with a recipient count
                     * and an invoice against it.
                     *
                     * `crm.manage` rather than `crm.update`, which reads
                     * backwards until you notice what the switch does: it starts
                     * sending messages to guests with nobody watching.
                     */
                    setState((current) => ({ ...current, [trigger.id]: !on }));
                    setBusy(true);

                    if (trigger.apiId === undefined) {
                      setBusy(false);
                      flash(
                        say(on ? MARKETING_COPY.automationOff : MARKETING_COPY.automationOn, lang),
                      );

                      return;
                    }

                    const answer = await post<unknown>(
                      '/api/crm',
                      { action: 'trigger-toggle', id: trigger.apiId, on: !on },
                      lang,
                    );

                    setBusy(false);

                    if (!answer.ok) {
                      setState((current) => ({ ...current, [trigger.id]: on }));
                      flash.problem(answer.message ?? say(trigger.name, lang));

                      return;
                    }

                    flash(
                      say(on ? MARKETING_COPY.automationOff : MARKETING_COPY.automationOn, lang),
                    );
                  }}
                />
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ============================================================== the screen */

const TABS = [
  { key: 'camp', label: MARKETING_UI.tabCampaigns },
  { key: 'promo', label: MARKETING_UI.tabPromotions },
  { key: 'loy', label: MARKETING_UI.tabLoyalty },
  { key: 'auto', label: MARKETING_UI.tabAutomated },
] as const;

type TabKey = (typeof TABS)[number]['key'];

/**
 * The strip lives *in the page head*, opposite the title — `:2833`.
 *
 * That is why this screen does not use the shared `<Tabs>`, which puts its
 * strip on the line below. The classes are the same control, copied so the two
 * do not drift.
 *
 * The measurements are `<Tabs>`'s rather than this view's: the design file
 * draws the identical control at 11px/8px/15px on menu, inventory and staff
 * and at 10px/7px/14px here, which is a one-pixel difference between two
 * families of the same file. The console standardised on the first, and one
 * screen a pixel off from the other nine is a worse answer than a pixel off
 * the file.
 */
export function MarketingScreen({
  lang,
  title,
  subtitle,
  board,
}: {
  lang: Lang;
  title: string;
  subtitle: string;
  /** Everything the four tabs draw, read on the server. See ./marketing-server.ts. */
  board: MarketingBoard;
}) {
  const [tab, setTab] = useState<TabKey>('camp');

  return (
    <>
      <div data-pagehead className="mb-[22px] flex flex-wrap items-end justify-between gap-5">
        <div>
          <h2 className="font-display text-2xl font-semibold tracking-tight">{title}</h2>
          <p className="text-fg-muted mt-1.5 text-sm">{subtitle}</p>
        </div>

        <div
          role="tablist"
          aria-label={title}
          className="bg-bg-muted flex max-w-full gap-[3px] overflow-x-auto rounded-[11px] p-[3px]"
        >
          {TABS.map((entry) => (
            <button
              key={entry.key}
              type="button"
              role="tab"
              data-seg
              data-active={tab === entry.key ? 'true' : undefined}
              aria-selected={tab === entry.key}
              aria-controls={`panel-${entry.key}`}
              onClick={() => setTab(entry.key)}
              className="text-fg-muted h-8 rounded-lg border-0 bg-transparent px-[15px] text-sm font-semibold whitespace-nowrap"
            >
              {say(entry.label, lang)}
            </button>
          ))}
        </div>
      </div>

      <div
        id="panel-camp"
        role="tabpanel"
        hidden={tab !== 'camp'}
        data-panel-in={tab === 'camp' ? '' : undefined}
      >
        <CampaignsPanel
          lang={lang}
          campaigns={board.campaigns}
          segments={board.segments}
          smsSpend={board.smsSpend}
        />
      </div>

      <div
        id="panel-promo"
        role="tabpanel"
        hidden={tab !== 'promo'}
        data-panel-in={tab === 'promo' ? '' : undefined}
      >
        <PromotionsPanel lang={lang} promotions={board.promotions} />
      </div>

      <div
        id="panel-loy"
        role="tabpanel"
        hidden={tab !== 'loy'}
        data-panel-in={tab === 'loy' ? '' : undefined}
      >
        <LoyaltyPanel lang={lang} />
      </div>

      <div
        id="panel-auto"
        role="tabpanel"
        hidden={tab !== 'auto'}
        data-panel-in={tab === 'auto' ? '' : undefined}
      >
        <AutomationPanel lang={lang} triggers={board.triggers} />
      </div>
    </>
  );
}
