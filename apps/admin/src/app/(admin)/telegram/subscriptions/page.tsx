import { getTranslations } from 'next-intl/server';

import { PageIntro, StatStrip, Stub } from '../../screen';

export async function generateMetadata() {
  const t = await getTranslations('platform.telegram');
  return { title: t('sections.messages') };
}

export default async function TelegramSubscriptionsPage() {
  const tg = await getTranslations('platform.extra.tg');

  return (
    <>
      <PageIntro>{tg('subscriptionsIntro')}</PageIntro>

      <StatStrip
        stats={[
          { label: tg('channels'), value: '—' },
          { label: tg('subscriptions'), value: '—' },
          { label: tg('channelsPerPerson'), value: '—' },
        ]}
      />

      <Stub title={tg('subscriptionsStub')}>{tg('subscriptionsNote')}</Stub>
    </>
  );
}
