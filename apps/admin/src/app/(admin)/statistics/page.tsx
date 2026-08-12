import { getTranslations } from 'next-intl/server';

import { PageIntro, Stub, Tabs } from '../screen';
import { statisticsSections } from './sections';

export async function generateMetadata() {
  const nav = await getTranslations('platform.nav');
  return { title: nav('statistics') };
}

/**
 * Deeper analytics than the overview carries.
 *
 * The overview answers "is the platform healthy today". This answers "what has
 * been happening", which needs a column store rather than the operational
 * database — hence ClickHouse, and hence a separate screen.
 *
 * TODO — once the platform API lands:
 *   - GET /api/v1/admin/statistics, backed by ClickHouse
 *   - Charts, at the same weight as the overview's
 *   - A period picker shared by all four tabs
 */
export default async function StatisticsPage() {
  const t = await getTranslations('platform.extra.statistics');
  const sections = await statisticsSections();

  return (
    <>
      <Tabs items={sections} current="/statistics" />

      <PageIntro>{t('intro')}</PageIntro>

      <Stub title={t('generalStub')}>{t('generalNote')}</Stub>
    </>
  );
}
