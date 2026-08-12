import { getTranslations } from 'next-intl/server';

import { PageIntro, Stub, Tabs } from '../../screen';
import { statisticsSections } from '../../statistics/sections';

export async function generateMetadata() {
  const t = await getTranslations('platform.extra.statistics');
  return { title: t('activityStub') };
}

export default async function ActivityStatsPage() {
  const t = await getTranslations('platform.extra.statistics');
  const sections = await statisticsSections();

  return (
    <>
      <Tabs items={sections} current="/statistics/activity" />

      <PageIntro>{t('activityIntro')}</PageIntro>

      <Stub title={t('activityStub')}>{t('activityNote')}</Stub>
    </>
  );
}
