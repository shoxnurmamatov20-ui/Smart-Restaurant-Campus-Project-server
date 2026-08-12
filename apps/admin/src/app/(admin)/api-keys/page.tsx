import { getTranslations } from 'next-intl/server';

import { ACTION_PRIMARY, PageIntro, Stub } from '../screen';

export async function generateMetadata() {
  const nav = await getTranslations('platform.nav');
  return { title: nav('apiKeys') };
}

export default async function ApiKeysPage() {
  const t = await getTranslations('platform.extra.apiKeys');

  return (
    <>
      <PageIntro
        actions={
          <>
            <button type="button" className={ACTION_PRIMARY}>
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
