import { getTranslations } from 'next-intl/server';

import { PageIntro, Stub, Tabs } from '../../screen';
import { settingsSections } from '../sections';

export async function generateMetadata() {
  const tab = await getTranslations('platform.settings');
  return { title: tab('email') };
}

export default async function EmailSettingsPage() {
  const t = await getTranslations('platform.extra.settingsEmail');
  const sections = await settingsSections();

  return (
    <>
      <Tabs items={sections} current="/settings/email" />

      <PageIntro>{t('intro')}</PageIntro>

      <Stub title={t('stub')}>{t('note')}</Stub>
    </>
  );
}
