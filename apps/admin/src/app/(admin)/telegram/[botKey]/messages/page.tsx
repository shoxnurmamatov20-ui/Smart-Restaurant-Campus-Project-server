import { getTranslations } from 'next-intl/server';

import { PageIntro, StatStrip, Stub, Tabs } from '../../../screen';
import { BOT_BY_KEY } from '../../bots';
import { botSections } from '../../sections';

type Props = { params: Promise<{ botKey: string }> };

export async function generateMetadata({ params }: Props) {
  const { botKey } = await params;
  const t = await getTranslations('platform.telegram');
  return { title: `${BOT_BY_KEY[botKey]?.name ?? botKey} · ${t('sections.messages')}` };
}

export default async function BotMessagesPage({ params }: Props) {
  const { botKey } = await params;
  const tg = await getTranslations('platform.extra.tg');
  const sections = await botSections(botKey);

  return (
    <>
      <Tabs items={sections} current={`/telegram/${botKey}/messages`} />

      <PageIntro>{tg('botMessagesIntro')}</PageIntro>

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
