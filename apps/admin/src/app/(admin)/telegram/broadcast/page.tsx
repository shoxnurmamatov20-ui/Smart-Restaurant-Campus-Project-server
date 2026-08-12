import { getTranslations } from 'next-intl/server';

import { PageIntro, Stub } from '../../screen';

export async function generateMetadata() {
  const t = await getTranslations('platform.telegram');
  return { title: t('broadcast') };
}

export default async function TelegramBroadcastPage() {
  const tg = await getTranslations('platform.extra.tg');

  return (
    <>
      <PageIntro>{tg('broadcastIntro')}</PageIntro>

      <Stub title={tg('broadcastStub')}>{tg('broadcastNote')}</Stub>
    </>
  );
}
