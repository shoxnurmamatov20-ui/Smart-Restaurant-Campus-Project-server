import { getTranslations } from 'next-intl/server';

import { ACTION, PageIntro, Stub } from '../screen';

export async function generateMetadata() {
  const nav = await getTranslations('platform.nav');
  return { title: nav('backups') };
}

export default async function BackupsPage() {
  const t = await getTranslations('platform.extra.backups');

  return (
    <>
      <PageIntro
        actions={
          <>
            <button type="button" className={ACTION}>
              {t('action')}
            </button>
          </>
        }
      >
        {t('intro')}
      </PageIntro>

      <Stub title={t('stub')}>{t('note')}</Stub>
    </>
  );
}
