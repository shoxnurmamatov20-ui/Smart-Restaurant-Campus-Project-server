import { pathLocale } from '@/lib/server-locale';

import { guestLocale } from '../../../(guest)/guest-session';
import { t, TG } from '@restaurant/surfaces/tg/copy';
import { TgAppBar } from '../../tg-app-bar';
import { say, TG_HISTORY, TG_OFFERS, TG_POINTS, type Lang } from '@restaurant/surfaces/tg/data';
import { TgDock } from '../../tg-dock';
import { TgPointsBalance, TgPointsWorth } from './points-balance';

export const dynamic = 'force-dynamic';

export async function generateMetadata() {
  const lang = guestLocale(await pathLocale(), null) as Lang;

  return { title: TG.points[lang] };
}

/**
 * Screen 4 of 4 — points, tier and offers.
 *
 * The accent card at the top is the design's — `Telegram.dc.html:352-360`,
 * solid accent with white on it and the tier rail at **71%**. Under the balance
 * is the sentence that decides what the number is worth: "1 ball = 1 so'm ·
 * hisobning 30% gacha ishlatiladi". That ceiling is not a footnote; the cart
 * enforces it, and stating it here is what stops a guest arriving at the basket
 * expecting 28 400 so'm off.
 *
 * **The identity problem is on the screen, not hidden.** A Telegram id is not
 * the phone number the loyalty programme is keyed on, so a guest can end up
 * with two balances — `GAPS.md §4`. The note says so and names the fix (ask the
 * manager to merge them) rather than letting somebody discover it by finding
 * half their points missing.
 */
export default async function TelegramPointsPage() {
  const lang = guestLocale(await pathLocale(), null) as Lang;

  const TONE: Readonly<Record<string, { background: string; color: string }>> = {
    acc: { background: 'var(--acc-soft)', color: 'var(--acc)' },
    warning: { background: 'var(--warning-50)', color: 'var(--warning-600)' },
    success: { background: 'var(--success-50)', color: 'var(--success-700)' },
  };

  return (
    <div className="flex min-h-dvh flex-col">
      <TgAppBar lang={lang} title={t('points', lang)} />

      <main className="flex-1 px-4 pt-4 pb-24">
        <section
          className="rounded-[14px] px-5 py-5 text-white"
          style={{ background: 'var(--acc)' }}
        >
          <p className="text-xs" style={{ color: 'rgba(255,255,255,.8)' }}>
            {t('loyalPts', lang)}
          </p>

          {/* The guest's own balance and tier, read with the token Telegram's
              signature bought — see points-balance.tsx. The rail and the
              "1 160 to gold" line are gone with the fixture that carried
              them: a step to the next tier is a rule this platform does not
              publish, and inventing one over a real balance is worse than
              showing the balance alone. */}
          <TgPointsBalance
            lang={lang}
            labels={{
              balance: t('loyalPts', lang),
              outside: t('loyalOutside', lang),
              notConfigured: t('loyalNoBot', lang),
              loading: t('loyalPts', lang),
            }}
          />
        </section>

        {/* -------------------------------------------------------- offers */}
        <h2
          className="text-2xs tracking-caps mt-5.5 font-bold uppercase"
          style={{ color: 'var(--tg-hint)' }}
        >
          {t('loyalOffers', lang)}
        </h2>

        <ul className="mt-2 flex flex-col gap-2.5">
          {TG_OFFERS.map((offer) => (
            <li
              key={offer.id}
              className="flex items-center gap-3 rounded-[14px] border px-4 py-3"
              style={{ background: 'var(--tg-card)', borderColor: 'var(--border)' }}
            >
              <span
                aria-hidden
                className="grid size-8.5 flex-none place-items-center rounded-[9px] text-base"
                style={TONE[offer.tone]}
              >
                {offer.icon}
              </span>

              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold">{say(offer.title, lang)}</span>
                <span
                  className="block text-[11px] leading-normal"
                  style={{ color: 'var(--tg-hint)' }}
                >
                  {say(offer.note, lang)}
                </span>
              </span>

              <span
                data-num
                className="flex-none text-[11px] font-bold"
                style={{
                  color: offer.costs === null ? 'var(--success-600)' : 'var(--fg-muted)',
                }}
              >
                {offer.costs === null
                  ? t('free', lang)
                  : offer.costs.toLocaleString('ru-RU').replace(/[,\s]/g, ' ')}
              </span>
            </li>
          ))}
        </ul>

        {/* ------------------------------------------------------- history */}
        <h2
          className="text-2xs tracking-caps mt-5.5 font-bold uppercase"
          style={{ color: 'var(--tg-hint)' }}
        >
          {t('loyalHistory', lang)}
        </h2>

        <ul className="mt-2 flex flex-col">
          {TG_HISTORY.map((entry) => (
            <li
              key={entry.id}
              className="flex items-center justify-between gap-3 border-b py-3 last:border-0"
              style={{ borderColor: 'var(--divider)' }}
            >
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium">{say(entry.what, lang)}</span>
                <span data-num className="block text-[11px]" style={{ color: 'var(--tg-hint)' }}>
                  {say(entry.when, lang)}
                </span>
              </span>

              <span
                data-num
                className="flex-none text-sm font-bold"
                style={{
                  color: entry.points > 0 ? 'var(--success-600)' : 'var(--danger-600)',
                }}
              >
                {entry.points > 0 ? '+' : '−'}{' '}
                {Math.abs(entry.points).toLocaleString('ru-RU').replace(/[,\s]/g, ' ')}
              </span>
            </li>
          ))}
        </ul>

        {/* What the balance buys today, in money — a point count alone decides
            nothing for somebody choosing whether to spend it. */}
        {/* What the balance buys today, from the same read as the card above —
            a point count alone decides nothing for somebody choosing whether
            to spend it, and the design's 2 840 decided it for everybody. */}
        <TgPointsWorth lang={lang} template={t('costs', lang)} worthPerPoint={TG_POINTS.worth} />

        {/* Said out loud, because the alternative is finding out by loss. */}
        <p className="mt-2 text-[11px] leading-normal" style={{ color: 'var(--tg-hint)' }}>
          {t('identityNote', lang)}
        </p>
      </main>

      <TgDock lang={lang} basket="tg:osh-xona" />
    </div>
  );
}
