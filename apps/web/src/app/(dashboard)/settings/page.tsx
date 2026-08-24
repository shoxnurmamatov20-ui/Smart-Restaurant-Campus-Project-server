import Link from 'next/link';
import { getMessages, getTranslations } from 'next-intl/server';

import type { Messages } from '@/i18n';

import { moduleMetadata } from '../module-page';
import { ACTION, PageHead } from '../screen';
import { settingsCopy } from './settings-copy';
import { SettingsPanels } from './settings-panels';
import { settingsScreen } from './settings-server';

export const generateMetadata = () => moduleMetadata('settings');

/**
 * Settings.
 *
 * `Smart Restaurant OS.dc.html:5677-6189` draws one screen here: a strip of
 * eight tabs — terminal, printers, receipt, payment methods, categories, zones,
 * notifications, releases — over the panel the reader chose, and under it the
 * order-state table, three groups of policy switches and the appearance row.
 *
 * What stood here instead was an index of seven cards, five of them with a
 * disabled button. That is not an unfinished version of this screen, it is a
 * different screen: it names the areas a restaurant might configure and lets a
 * manager into two of them. The eight panels are now built, and the two routes
 * that genuinely are their own screens — roles and the site configurator — keep
 * their links in the head, which is also where `nav.test.ts` expects to find
 * them.
 *
 * Most of what the panels draw is now read from the server rather than
 * invented — the requisites at the top of every receipt, the printers, the
 * tills, the zones, which online rails have keys — because all of it looked
 * configured when it was not: every restaurant's receipt preview drew the same
 * STIR, and the identity panel named a terminal called POS-3 that no
 * deployment has ever had. `settings-server.ts` is the seam and it says which
 * read answers which block.
 *
 * The controls that write do so through a route handler on this origin, never
 * to Laravel directly. The ten policy switches under the panels used to be one
 * write and nine toasts; six of them are declared paths with one enforcement
 * point each now (`config/settings.php`, the `policies.*` group). The four that
 * still only move are drawn because the design draws them and are statements
 * rather than levers — a tax rate, a kitchen behaviour nothing implements yet,
 * and three discount ceilings whose single source is the terminal. Each is
 * argued in `settings-panels.tsx`, where it is drawn.
 */
export default async function SettingsPage() {
  const [nav, t, messages] = await Promise.all([
    getTranslations('console.nav'),
    getTranslations('console.settings'),
    getMessages(),
  ]);

  /* The sentences come from the catalogue and the figures from settings-data;
     `settingsCopy` is the seam that hands the panels one object, and
     `settingsScreen` lays the restaurant's own rows over it. */
  const copy = await settingsScreen(settingsCopy((messages as Messages).console.settingsPanels));

  return (
    /* The design holds settings to 900px. Every panel here is a form or a
       narrow table, and a form measured across a 1440px screen is a form
       nobody's eye tracks back across. */
    <div className="mx-auto max-w-[900px]">
      <PageHead title={nav('settings')} subtitle={copy.subtitle}>
        <Link href="/settings/permissions" className={`${ACTION} grid place-items-center`}>
          {t('groupRoles')}
        </Link>
        <Link href="/settings/site" className={`${ACTION} grid place-items-center`}>
          {t('groupSite')}
        </Link>
        <Link href="/settings/branches" className={`${ACTION} grid place-items-center`}>
          {nav('branches')}
        </Link>
      </PageHead>

      <SettingsPanels copy={copy} />
    </div>
  );
}
