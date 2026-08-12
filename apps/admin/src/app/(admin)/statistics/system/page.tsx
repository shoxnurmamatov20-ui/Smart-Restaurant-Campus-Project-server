import { getTranslations } from 'next-intl/server';

import { PageIntro, Stub, Tabs } from '../../screen';
import { statisticsSections } from '../../statistics/sections';

export async function generateMetadata() {
  const t = await getTranslations('platform.extra.statistics');
  return { title: t('systemStub') };
}

export default async function SystemStatsPage() {
  const t = await getTranslations('platform.extra.statistics');
  const sections = await statisticsSections();

  return (
    <>
      <Tabs items={sections} current="/statistics/system" />

      <PageIntro>{t('systemIntro')}</PageIntro>

      <Stub title={t('systemStub')}>{t('systemNote')}</Stub>
    </>
  );
}
