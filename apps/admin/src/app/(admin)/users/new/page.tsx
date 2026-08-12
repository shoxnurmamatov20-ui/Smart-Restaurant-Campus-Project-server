import { getTranslations } from 'next-intl/server';

import { PageIntro, Stub } from '../../screen';

export async function generateMetadata() {
  const t = await getTranslations('platform.extra.users');
  return { title: t('create') };
}

export default async function NewUserPage() {
  const t = await getTranslations('platform.extra.userNew');

  return (
    <>
      <PageIntro>{t('intro')}</PageIntro>

      <Stub title={t('stub')}>{t('note')}</Stub>
    </>
  );
}
