import { getTranslations } from 'next-intl/server';

import { PageIntro, StatStrip, Stub } from '../../screen';

export async function generateMetadata() {
  const t = await getTranslations('platform.telegram');
  return { title: t('sections.commands') };
}

export default async function TelegramAuditPage() {
  const tg = await getTranslations('platform.extra.tg');

  return (
    <>
      <PageIntro>{tg('auditIntro')}</PageIntro>

      <StatStrip
        stats={[
          { label: tg('commands24h'), value: '—' },
          { label: tg('topBot'), value: '—' },
          { label: tg('topCommand'), value: '—' },
          { label: tg('errorRate'), value: '—' },
        ]}
      />

      <Stub title={tg('auditStub')}>{tg('auditNote')}</Stub>
    </>
  );
}
