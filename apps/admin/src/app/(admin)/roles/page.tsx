import { getTranslations } from 'next-intl/server';

import { PageIntro, Stub } from '../screen';

export async function generateMetadata() {
  const nav = await getTranslations('platform.nav');
  return { title: nav('roles') };
}

export default async function RolesPage() {
  const t = await getTranslations('platform.extra.roles');

  return (
    <>
      <PageIntro>{t('intro')}</PageIntro>

      <Stub title={t('stub')}>{t('note')}</Stub>
    </>
  );
}
