import { getTranslations } from 'next-intl/server';

import { PageIntro, Stub, Tabs } from '../../../screen';
import { BOT_BY_KEY } from '../../bots';
import { botSections } from '../../sections';

type Props = { params: Promise<{ botKey: string }> };

export async function generateMetadata({ params }: Props) {
  const { botKey } = await params;
  const t = await getTranslations('platform.telegram');
  return { title: `${BOT_BY_KEY[botKey]?.name ?? botKey} · ${t('sections.settings')}` };
}

export default async function BotSettingsPage({ params }: Props) {
  const { botKey } = await params;
  const tg = await getTranslations('platform.extra.tg');
  const sections = await botSections(botKey);

  return (
    <>
      <Tabs items={sections} current={`/telegram/${botKey}/settings`} />

      <PageIntro>{tg('botSettingsIntro')}</PageIntro>

      <Stub title={tg('botSettingsStub')}>{tg('botSettingsNote')}</Stub>
    </>
  );
}
