import { getLocale, getTranslations } from 'next-intl/server';

import { moduleMetadata } from '../module-page';
import { CallsScreen } from './calls-panels';
import {
  getComposeMenu,
  getDeliveryBoard,
  getIntakeQueue,
  getIntakeRules,
  getIntakeStats,
} from './calls-server';
import type { Lang } from './calls-data';

export const generateMetadata = () => moduleMetadata('calls');

/**
 * Order intake — every order that did not start at a table.
 *
 * `Smart Restaurant OS.dc.html:3872-4247`. The module an operator lives in, and
 * the reason it exists as one screen rather than five: an order from the phone,
 * the bot, the site, Yandex and Uzum are the same job.
 *
 * The design's five tabs are five tabs. An earlier build rendered them as five
 * stacked sections, arguing that the queue should never be hidden behind a tab
 * — but the design already answers that: the four intake figures sit *above*
 * the strip and stay put whichever tab is open, so the operator never loses
 * sight of how the line is doing while they look at a courier. Stacking cost
 * the compose flow, the aggregator switches, the routing rules and the prep
 * timer, none of which had anywhere to live.
 *
 * The body is a client island (`calls-panels.tsx`) because every one of the five
 * tabs is stateful in the design itself — the channel filter, accept/decline,
 * the cart, courier assignment, six switch groups. Nothing here can be settled
 * on the server that the first click would not immediately replace.
 *
 * Three of the five are live, and all three are stitched here — on the server,
 * where the session cookie is — and handed down. `GET /orders/deliveries`
 * answers the courier board; `GET /orders/orders?filter[intake]=true` answers
 * the queue, which became possible when `intake_channel` gave the platform a
 * way to tell a phone order waiting for an answer from a table's first ticket;
 * and `GET /menu/items` gives the compose flow tiles with real ids behind them,
 * without which the cart could not be posted.
 *
 * The two that remain are the aggregator tabs, and what they are waiting for is
 * a contract with Yandex, Uzum and Wolt rather than code. `calls-data.ts`
 * carries the shapes those endpoints will answer with.
 *
 * The four figures above the strip are live too, off the operator arm of
 * `GET /dashboard` — the same aggregate that role's own dashboard reads, so the
 * two cannot disagree. Time to answer is the one card that went rather than
 * being filled: it lives in a telephony log this platform does not have.
 *
 * Fetched together rather than in sequence: four independent reads behind one
 * render, and doing them one after another would make the screen as slow as
 * their sum.
 */
export default async function CallsPage() {
  const [t, locale, delivery, queue, menu, stats, rules] = await Promise.all([
    getTranslations('console.calls'),
    getLocale(),
    getDeliveryBoard(),
    getIntakeQueue(),
    getComposeMenu(),
    getIntakeStats(),
    // The channels tab's right-hand column: four automation switches and the
    // prep time. They wrote React state and nothing else until this read and
    // its POST existed.
    getIntakeRules(),
  ]);

  return (
    <CallsScreen
      lang={locale as Lang}
      title={t('title')}
      subtitle={t('sub')}
      delivery={delivery}
      queue={queue}
      menu={menu}
      stats={stats}
      rules={rules}
    />
  );
}
