import { getTranslations } from 'next-intl/server';

import Link from 'next/link';

import { ACTION, ACTION_PRIMARY, PageIntro, Stub } from '../screen';

export async function generateMetadata() {
  const nav = await getTranslations('platform.nav');
  return { title: nav('users') };
}

export default async function UsersPage() {
  const t = await getTranslations('platform.extra.users');

  return (
    <>
      <PageIntro
        actions={
          <>
            <Link href="/users/invite" className={ACTION}>
              {t('invite')}
            </Link>
            <Link href="/users/new" className={ACTION_PRIMARY}>
              {t('create')}
            </Link>
          </>
        }
      >
        {t('intro')}
      </PageIntro>

      <Stub title={t('stub')}>{t('note')}</Stub>
    </>
  );
}
