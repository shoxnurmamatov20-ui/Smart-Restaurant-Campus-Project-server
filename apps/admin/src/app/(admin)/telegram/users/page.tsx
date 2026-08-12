import { getTranslations } from 'next-intl/server';

import { ACTION, PageIntro, StatStrip, Stub } from '../../screen';

export async function generateMetadata() {
  const t = await getTranslations('platform.telegram');
  return { title: t('sections.users') };
}

export default async function TelegramUsersPage() {
  const tg = await getTranslations('platform.extra.tg');

  return (
    <>
      <PageIntro
        actions={
          <button type="button" className={ACTION}>
            {tg('usersExport')}
          </button>
        }
      >
        {tg('usersIntro')}
      </PageIntro>

      <StatStrip
        stats={[
          { label: tg('linked'), value: '—' },
          { label: tg('botsPerPerson'), value: '—' },
          { label: tg('blocked'), value: '—' },
          { label: tg('active7d'), value: '—' },
        ]}
      />

      <Stub title={tg('usersStub')}>{tg('usersNote')}</Stub>
    </>
  );
}
