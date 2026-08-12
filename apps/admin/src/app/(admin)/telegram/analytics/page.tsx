import { getTranslations } from 'next-intl/server';

import { PageIntro, StatStrip, Stub } from '../../screen';

export async function generateMetadata() {
  const t = await getTranslations('platform.telegram');
  return { title: t('analytics') };
}

export default async function TelegramAnalyticsPage() {
  const tg = await getTranslations('platform.extra.tg');

  return (
    <>
      <PageIntro>{tg('analyticsIntro')}</PageIntro>

      <StatStrip
        stats={[
          { label: tg('activeUsers24h'), value: '—' },
          { label: tg('messages24h'), value: '—' },
          { label: tg('topBot'), value: '—' },
          { label: tg('errorRate'), value: '—' },
        ]}
      />

      <Stub title={tg('analyticsStub')}>{tg('analyticsNote')}</Stub>
    </>
  );
}
