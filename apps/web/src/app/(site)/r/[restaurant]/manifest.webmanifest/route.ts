import { NextResponse } from 'next/server';

import { fetchGuestMenu } from '../../../../(guest)/guest-menu-server';
import { VENUE } from '../../../venue-data';

/**
 * A manifest per restaurant, so the installed app is the restaurant's.
 *
 * `public/manifest.json` describes the platform: it is called "Smart Restaurant
 * Campus" and starts at `/dashboard`, which is the staff console behind a
 * login. Correct for the product, and exactly wrong for a guest — somebody who
 * installs from a restaurant's website would get an icon named after a piece of
 * back-office software that opens on a sign-in form they have no account for.
 *
 * This one is named after the venue and starts on the venue's page. It is what
 * makes "add Osh Xona to my home screen" a thing that means something, on the
 * one surface where a consumer would want to.
 *
 * ---------------------------------------------------------------------------
 * The icons are still the platform's
 *
 * Deliberately, and it is the honest state rather than an oversight: there is
 * no per-tenant branding anywhere in this system — no upload, no colour, no
 * logo — so a per-restaurant icon would have to be invented. When a venue can
 * choose one, it is two fields here and nothing else moves.
 */
export const dynamic = 'force-dynamic';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ restaurant: string }> },
) {
  const { restaurant } = await params;

  if (restaurant === '' || restaurant.length > 120) {
    return new NextResponse('Not found', { status: 404 });
  }

  const menu = await fetchGuestMenu(restaurant, 'uz').catch(() => null);
  const name = menu?.restaurant?.name ?? VENUE.name;
  const home = `/r/${encodeURIComponent(restaurant)}`;

  return NextResponse.json(
    {
      name,
      short_name: name.slice(0, 12),
      description: 'Menyu, yetkazib berish va stol bandlash',
      /*
       * The venue's own page, not the platform's dashboard.
       *
       * `start_url` is what the icon opens, and it is the whole reason this
       * file exists. `scope` is narrowed to the same subtree so a link out of
       * the installed app opens in a browser tab rather than replacing the app
       * with the staff console.
       */
      start_url: home,
      scope: home,
      display: 'standalone',
      background_color: '#ffffff',
      /*
       * `--brand-500` from FOUNDATIONS §1.1, which is what every primary on
       * every surface uses. This shipped as `#c5521c` — an orange the design
       * does not contain — on all three manifests, so an installed app's title
       * bar was a colour no screen inside it draws.
       */
      theme_color: '#2E74EA',
      lang: 'uz',
      categories: ['food', 'lifestyle'],
      icons: [
        { src: '/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
        { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any maskable' },
        { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
      ],
      shortcuts: [
        { name: 'Menyu', url: `${home}/menu` },
        { name: 'Stol bandlash', url: `${home}/book` },
      ],
    },
    {
      headers: {
        'Content-Type': 'application/manifest+json; charset=utf-8',
        'Cache-Control': 'public, max-age=3600',
      },
    },
  );
}
