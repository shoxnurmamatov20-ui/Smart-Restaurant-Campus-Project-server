import { getLocale, getTranslations } from 'next-intl/server';

import { moduleMetadata } from '../module-page';
import { WebScreen } from './web-panels';
import { getBookingGrid, getSiteDishes, getSiteIdentity, getSiteTraffic } from './web-server';
import type { Lang } from './web-data';

export const generateMetadata = () => moduleMetadata('web');

/**
 * The restaurant's own website, managed from the console —
 * `Smart Restaurant OS.dc.html:2570-2825`.
 *
 * Four tabs, and the head that binds them: the live domain on the left of the
 * Publish button, because everything on this screen changes what a stranger
 * sees and the design collects those changes rather than applying them one at a
 * time.
 *
 * The whole module rests on one sentence in `t.wSub` — the site runs on the
 * same data as the POS, so menu, prices and stock are never maintained twice.
 * What is left to manage is presentation: which sections exist, which dishes
 * are shown and how well they are described, which windows are bookable, and
 * where the visits are being lost.
 *
 * Fixtures: there is no traffic endpoint and the site's configuration is not
 * stored per tenant yet. Shapes in `web-data.ts`.
 *
 * The bookings tab is the exception and is live. `tables.booking_windows` is a
 * real table with a real venue on every row, so the grid is read here — on the
 * server, where the session cookie is — and handed down. See ./web-server.ts.
 */

/**
 * The seven headings, in the catalogue's order.
 *
 * Borrowed from `console.shifts` rather than copied into `console.web`: the
 * rota screen already names all seven days in three languages, and two
 * catalogues of weekday names is two places for Wednesday to be spelled
 * differently. Short forms — `Du`, `Se`, `Ch` — because they label the rows of
 * a grid whose columns are twenty-four hours wide.
 */
const WEEKDAYS = [
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
  'sunday',
] as const;

export default async function WebPage() {
  const locale = await getLocale();

  // The word a shut day wears, read before the batch: `getSiteIdentity` needs
  // it, and a translator cannot be awaited from inside the same Promise.all
  // that creates it.
  const web = await getTranslations('console.web');

  const [t, rota, bookings, site, dishes, traffic] = await Promise.all([
    getTranslations('console.web'),
    getTranslations('console.shifts'),
    getBookingGrid(),
    // The restaurant's own address, and whether there is one. The head used to
    // print the demo's domain beside a green dot on every console.
    getSiteIdentity(web('closedDay')),
    /* The menu as the website publishes it, with the two flags the tab used to
       invent: a photograph, and a description in the reader's own language. */
    getSiteDishes(locale),
    /* The week's visits. `live: false` means nothing has been counted here yet
       — which is different from "nobody came", and the tab says which. */
    getSiteTraffic(),
  ]);

  return (
    <WebScreen
      lang={locale as Lang}
      title={t('title')}
      subtitle={t('sub')}
      bookings={bookings}
      weekdays={WEEKDAYS.map((day) => rota(day))}
      site={site}
      dishes={dishes}
      traffic={traffic}
      words={{
        sampleContent: t('sampleContent'),
        addressUnknown: t('siteAddressUnknown'),
        trafficVisits: t('trafficVisits'),
        trafficVsBefore: t.raw('trafficVsBefore') as string,
        trafficNone: t('trafficNone'),
        trafficPages: t('trafficPages'),
        trafficNoConversion: t('trafficNoConversion'),
        colPath: t('colPath'),
      }}
    />
  );
}
