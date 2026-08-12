import { getTranslations } from 'next-intl/server';

import { PageIntro, Stub, Tabs } from '../../screen';
import { statisticsSections } from '../../statistics/sections';

export async function generateMetadata() {
  const t = await getTranslations('platform.extra.statistics');
  return { title: t('usersStub') };
}

export default async function UserStatsPage() {
  const t = await getTranslations('platform.extra.statistics');
  const sections = await statisticsSections();

  return (
    <>
      <Tabs items={sections} current="/statistics/users" />

      <PageIntro>{t('usersIntro')}</PageIntro>

      <Stub title={t('usersStub')}>{t('usersNote')}</Stub>
    </>
  );
}
