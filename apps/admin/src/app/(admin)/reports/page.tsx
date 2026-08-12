import { getTranslations } from 'next-intl/server';

import { PageIntro, Stub } from '../screen';

export async function generateMetadata() {
  const nav = await getTranslations('platform.nav');
  return { title: nav('reports') };
}

export default async function ReportsPage() {
  const t = await getTranslations('platform.extra.reports');

  return (
    <>
      <PageIntro>{t('intro')}</PageIntro>

      <Stub title={t('stub')}>{t('note')}</Stub>
    </>
  );
}
