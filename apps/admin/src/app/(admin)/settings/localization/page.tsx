import { getTranslations } from 'next-intl/server';

import { PageIntro, Stub, Tabs } from '../../screen';
import { settingsSections } from '../sections';

export async function generateMetadata() {
  const tab = await getTranslations('platform.settings');
  return { title: tab('localization') };
}

export default async function LocalizationSettingsPage() {
  const t = await getTranslations('platform.extra.settingsLocalization');
  const sections = await settingsSections();

  return (
    <>
      <Tabs items={sections} current="/settings/localization" />

      <PageIntro>{t('intro')}</PageIntro>

      <Stub title={t('stub')}>{t('note')}</Stub>
    </>
  );
}
