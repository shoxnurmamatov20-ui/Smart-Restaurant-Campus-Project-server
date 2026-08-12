import { getTranslations } from 'next-intl/server';

import { PageIntro, StatStrip, Stub, Tabs } from '../../../screen';
import { BOT_BY_KEY } from '../../bots';
import { botSections } from '../../sections';

type Props = { params: Promise<{ botKey: string }> };

export async function generateMetadata({ params }: Props) {
  const { botKey } = await params;
  const t = await getTranslations('platform.telegram');
  return { title: `${BOT_BY_KEY[botKey]?.name ?? botKey} · ${t('sections.commands')}` };
}

export default async function BotCommandsPage({ params }: Props) {
  const { botKey } = await params;
  const tg = await getTranslations('platform.extra.tg');
  const sections = await botSections(botKey);

  return (
    <>
      <Tabs items={sections} current={`/telegram/${botKey}/commands`} />

      <PageIntro>{tg('botCommandsIntro')}</PageIntro>

      <StatStrip
        stats={[
          { label: tg('commands24h'), value: '—' },
          { label: tg('topCommand'), value: '—' },
          { label: tg('avgLatency'), value: '—' },
          { label: tg('errorRate'), value: '—' },
        ]}
      />

      <Stub title={tg('botCommandsStub')}>{tg('botCommandsNote')}</Stub>
    </>
  );
}
