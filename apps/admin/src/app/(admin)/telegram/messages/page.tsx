import { getTranslations } from 'next-intl/server';

import { PageIntro, StatStrip, Stub } from '../../screen';

export async function generateMetadata() {
  const t = await getTranslations('platform.telegram');
  return { title: t('sections.messages') };
}

export default async function TelegramMessagesPage() {
  const tg = await getTranslations('platform.extra.tg');

  return (
    <>
      <PageIntro>{tg('messagesIntro')}</PageIntro>

      <StatStrip
        stats={[
          { label: tg('total24h'), value: '—' },
          { label: tg('sent'), value: '—' },
          { label: tg('queued'), value: '—' },
          { label: tg('failed'), value: '—' },
        ]}
      />

      <Stub title={tg('messagesStub')}>{tg('messagesNote')}</Stub>
    </>
  );
}
