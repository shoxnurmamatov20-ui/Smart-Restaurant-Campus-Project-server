import { getTranslations } from 'next-intl/server';

import { PageIntro, Stub, Tabs } from '../../screen';
import { settingsSections } from '../sections';

export async function generateMetadata() {
  const tab = await getTranslations('platform.settings');
  return { title: tab('sms') };
}

export default async function SmsSettingsPage() {
  const t = await getTranslations('platform.extra.settingsSms');
  const sections = await settingsSections();

  return (
    <>
      <Tabs items={sections} current="/settings/sms" />

      <PageIntro>{t('intro')}</PageIntro>

      <Stub title={t('stub')}>{t('note')}</Stub>
    </>
  );
}
