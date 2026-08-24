import type { ReactNode } from 'react';

import { InstallPrompt } from '@/components/install-prompt';

import { fetchVenueAccent } from '../../venue-server';

/**
 * One restaurant's colour, on one restaurant's website.
 *
 * The accent is its own axis — `FOUNDATIONS §1.4`, verbatim: "the accent is
 * driven by the picked value, not by tenant id. Tenant selection only *seeds*
 * the default." A venue picks one of four in `/settings/site`, the schema
 * validates it `in:a0,a1,a2,a3`, and `GET /api/v1/public/site` publishes it
 * beside the address and the telephone.
 *
 * This is the layer that reads it, and it exists because of where `params` are
 * available rather than for any visual reason. `(site)/layout.tsx` is a
 * route-group layout above `r/[restaurant]`, so it never receives the slug —
 * which is why the attribute sat there hard-coded to `a1` and gave every
 * restaurant on the platform Osh Xona's terracotta. Here the slug is a prop.
 *
 * A second element rather than a prop passed upward, because that is how CSS
 * custom properties work: `[data-acc='a2']` redeclares `--acc` and everything
 * inside inherits it. Nothing in `site.css` reads `--acc` on `[data-site]`
 * itself, so moving the attribute down changes no pixel except the colour.
 *
 * One HTTP call, shared. `fetchVenueAccent` and the page's own `fetchVenue`
 * both go through the same request-scoped `cache()`, so a render that draws the
 * hero, the branch list and this wrapper asks the API once.
 */
export default async function VenueLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ restaurant: string }>;
}) {
  const { restaurant } = await params;

  return (
    <div data-acc={await fetchVenueAccent(restaurant)}>
      {children}

      {/*
        The restaurant's own app, offered after somebody has read a menu.
        `/r/{slug}/manifest.webmanifest` is already generated per venue, so what
        installs here carries the restaurant's name and colour rather than the
        platform's. On iOS the component draws the Share → Add to Home Screen
        steps, because Safari offers nothing — `Sayt va PWA.dc.html` names that
        as the first limitation of this whole channel.

        Inside the accent wrapper rather than beside it, so the card that offers
        a venue's app is painted in that venue's colour. It is `position: fixed`,
        so nothing about where it lands depends on which element holds it.
      */}
      <InstallPrompt surface="site" lang="uz" delayMs={90_000} />
    </div>
  );
}
