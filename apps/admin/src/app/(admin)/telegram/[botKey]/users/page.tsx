import { getTranslations } from 'next-intl/server';

import { PageIntro, StatStrip, Stub, Tabs } from '../../../screen';
import { BOT_BY_KEY } from '../../bots';
import { botSections } from '../../sections';

type Props = { params: Promise<{ botKey: string }> };

export async function generateMetadata({ params }: Props) {
  const { botKey } = await params;
  const t = await getTranslations('platform.telegram');
  return { title: `${BOT_BY_KEY[botKey]?.name ?? botKey} · ${t('sections.users')}` };
}

export default async function BotUsersPage({ params }: Props) {
  const { botKey } = await params;
  const tg = await getTranslations('platform.extra.tg');
  const sections = await botSections(botKey);

  return (
    <>
      <Tabs items={sections} current={`/telegram/${botKey}/users`} />

      <PageIntro>{tg('botUsersIntro')}</PageIntro>

      <StatStrip
        stats={[
          { label: tg('linked'), value: '—' },
          { label: tg('active7d'), value: '—' },
          { label: tg('blocked'), value: '—' },
          { label: tg('new7d'), value: '—' },
        ]}
      />

      <Stub title={tg('usersStub')}>{tg('usersNote')}</Stub>
    </>
  );
}
