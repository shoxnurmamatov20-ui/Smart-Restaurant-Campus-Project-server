import { ImageResponse } from 'next/og';

import { fetchGuestMenu } from '../../../(guest)/guest-menu-server';
import { allDishes } from '@restaurant/surfaces/guest/menu-data';
import { BRANCHES, VENUE } from '../../venue-data';

/**
 * The card a restaurant's link becomes when somebody shares it.
 *
 * In Uzbekistan that is almost always Telegram, and a link with no preview is a
 * grey rectangle nobody taps. This is the one image on the platform that is
 * seen more often than the page it points at — a link forwarded through five
 * group chats is five hundred people who saw the card and a handful who opened
 * the site.
 *
 * Generated rather than uploaded, for the reason every other fixture here is
 * honest about: there is no photography in this repository, and an image slot
 * pointing at a missing file renders as a broken preview. This one always
 * exists, always says the restaurant's name, and updates itself when the menu
 * does.
 *
 * No custom font. `next/og` embeds one automatically, and fetching a Google
 * font per share-preview request would make the slowest thing on the platform
 * the thing a crawler hits hardest.
 */
export const runtime = 'nodejs';

export const alt = 'Restaurant';

/** 1200×630 — the size every platform crops from and none crops badly. */
export const size = { width: 1200, height: 630 };

export const contentType = 'image/png';

export default async function OpenGraphImage({
  params,
}: {
  params: Promise<{ restaurant: string }>;
}) {
  const { restaurant } = await params;

  /*
   * The menu is fetched, and its failure is not fatal.
   *
   * A share preview that 500s is a link with no card at all — strictly worse
   * than a card with a dish count of zero. Everything below has a fallback.
   */
  const menu = await fetchGuestMenu(restaurant, 'uz').catch(() => null);
  const name = menu?.restaurant?.name ?? VENUE.name;
  const count = menu === null ? 0 : allDishes(menu).length;

  return new ImageResponse(
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        padding: 72,
        background: 'linear-gradient(135deg, #12100e 0%, #2a211a 55%, #47331f 100%)',
        color: '#ffffff',
        fontSize: 40,
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
        <div style={{ fontSize: 26, letterSpacing: 4, opacity: 0.7 }}>
          {BRANCHES.length} FILIAL · TOSHKENT
        </div>
        <div style={{ fontSize: 92, fontWeight: 700, lineHeight: 1.05 }}>{name}</div>
      </div>

      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {/*
           * Three facts, and they are the three a person decides on: is it
           * any good, how much choice is there, and how long will it take.
           */}
          <div style={{ fontSize: 34, opacity: 0.85 }}>
            ★ {VENUE.rating} · {count} taom
          </div>
          <div style={{ fontSize: 34, opacity: 0.85 }}>
            Yetkazish {BRANCHES[0]?.deliveryEta ?? '25–35'} daqiqa
          </div>
        </div>

        <div style={{ fontSize: 26, opacity: 0.55 }}>{VENUE.since} yildan buyon</div>
      </div>
    </div>,
    size,
  );
}
