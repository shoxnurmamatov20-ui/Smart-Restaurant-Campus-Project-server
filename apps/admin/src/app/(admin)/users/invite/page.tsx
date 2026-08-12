import { getTranslations } from 'next-intl/server';

import { PageIntro, Stub } from '../../screen';

export async function generateMetadata() {
  const t = await getTranslations('platform.extra.users');
  return { title: t('invite') };
}

export default async function InviteUserPage() {
  const t = await getTranslations('platform.extra.userInvite');

  return (
    <>
      <PageIntro>{t('intro')}</PageIntro>

      <Stub title={t('stub')}>{t('note')}</Stub>
    </>
  );
}
