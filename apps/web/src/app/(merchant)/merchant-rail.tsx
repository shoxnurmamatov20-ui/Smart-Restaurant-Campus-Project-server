'use client';

import Link from 'next/link';
import { useLocalePath } from '@/lib/use-locale-path';

import { NavBackdrop, useNavDrawer } from '@restaurant/ui';

import { merchantCopy } from './merchant-copy';
import { DISPUTES, MERCHANT_NAV, MERCHANT_ORDERS, say, type Lang } from './merchant-data';

/**
 * The merchant's rail — `Do'kon paneli.dc.html:85-122`.
 *
 * **Three groups and seven rows, and they are the design's own.** This had
 * invented a different three — Hozir · Do‘kon · Pul — with nine rows, four of
 * which were dimmed placeholders: a merchant looking for "Nizolar" found it
 * under "Hozir" beside a dead "Kuryerlar", and a merchant looking for
 * "Natijalar" found "Tahlil" under "Pul". Naming things differently from the
 * design is not a style difference on a panel a business is paid through; it is
 * a merchant who cannot find their money.
 *
 * The two badges count work rather than decorate: orders that have not been
 * answered in red, open disputes in amber. Nothing else carries one, because a
 * badge on every row is a rail with no badges.
 *
 * Settings sits below a divider at the foot, out of the three groups — it is
 * the one destination that is never part of a day's work.
 */
const TONE: Readonly<Record<'danger' | 'warning', string>> = {
  danger: 'bg-danger-500',
  warning: 'bg-warning-500',
};

export function MerchantRail({ lang, shop }: { lang: Lang; shop: string | null }) {
  // `here` is the path without its language; `to()` puts it back on a href.
  const { here, to } = useLocalePath();
  const t = merchantCopy(lang);

  /*
   * The counts are the fixture's own opening position — three orders awaiting
   * an answer, two disputes open. They do not move as a merchant works through
   * the queue, and that is deliberate rather than missed: the number belongs to
   * the server, and a rail that counted a client component's local state would
   * be inventing a figure that disagrees with the one the API will send.
   */
  const drawer = useNavDrawer(here);
  const pending = MERCHANT_ORDERS.filter((order) => order.state === 'new').length;
  const disputes = DISPUTES.filter((dispute) => dispute.resolved === undefined).length;

  const GROUP_LABEL = { daily: t.text.secDaily, money: t.text.secMoney, grow: t.text.secGrow };

  return (
    <>
      <NavBackdrop shown={drawer} />

      <aside
        data-mrail
        data-open={drawer ? 'true' : undefined}
        className="bg-surface flex w-[246px] flex-none flex-col overflow-hidden border-r"
      >
        <div className="flex h-16 flex-none items-center gap-3 border-b px-5">
          <div className="bg-n-900 font-display grid size-7 flex-none place-items-center rounded-[8px] text-[14px] font-bold tracking-[-0.04em] text-white">
            MP
          </div>
          <div className="min-w-0">
            {/* The signed-in restaurant's own name; the design's shop only for
                the demo reader, who has no restaurant to name. */}
            <div className="font-display text-md truncate leading-[1.1] font-semibold tracking-[-0.03em]">
              {shop ?? 'Osh Xona'}
            </div>
            <div className="text-fg-subtle text-2xs mt-px tracking-wide">{t.text.partner}</div>
          </div>
        </div>

        <nav data-scroll className="flex min-h-0 flex-1 flex-col gap-0.5 px-2.5 py-3.5">
          {MERCHANT_NAV.map((group, index) => (
            <div key={group.key} className="contents">
              <div
                className={`text-2xs tracking-caps text-fg-subtle px-2 pb-1.5 font-semibold uppercase ${
                  index === 0 ? 'pt-0.5' : 'pt-[18px]'
                }`}
              >
                {GROUP_LABEL[group.key]}
              </div>

              {group.items.map((item) => {
                const count = item.badge === 'pending' ? pending : disputes;

                return (
                  <Link
                    key={item.key}
                    href={to(item.href)}
                    data-navitem
                    data-active={here.startsWith(item.href) ? 'true' : undefined}
                    data-press
                    className="text-fg-muted flex h-[38px] flex-none items-center gap-3 rounded-[10px] px-2 text-sm font-medium"
                  >
                    <span className="min-w-0 flex-1 truncate">{say(item.label, lang)}</span>

                    {item.badge !== undefined && count > 0 ? (
                      <span
                        data-num
                        className={`grid h-[19px] min-w-[19px] flex-none place-items-center rounded-full px-1.5 text-[11px] font-bold text-white ${
                          TONE[item.badgeTone ?? 'danger']
                        }`}
                      >
                        {count}
                      </span>
                    ) : null}
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>

        <div className="border-divider flex-none border-t p-2.5">
          <Link
            href={to('/merchant/settings')}
            data-navitem
            data-active={here.startsWith('/merchant/settings') ? 'true' : undefined}
            data-press
            className="text-fg-muted flex h-[38px] flex-none items-center gap-3 rounded-[10px] px-2 text-sm font-medium"
          >
            {t.text.navSettings}
          </Link>
        </div>
      </aside>
    </>
  );
}
