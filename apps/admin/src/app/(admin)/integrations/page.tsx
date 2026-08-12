import { getTranslations } from 'next-intl/server';

import { CARD, PageIntro } from '../screen';

export async function generateMetadata() {
  const nav = await getTranslations('platform.nav');
  return { title: nav('integrations') };
}

/**
 * The outside services this platform depends on.
 *
 * Grouped by what they do rather than listed alphabetically, because the
 * question somebody arrives with is "can we take Payme yet", not "what starts
 * with P".
 *
 * The status chip is the whole point of the page and is deliberately honest:
 * one integration is live and eleven are not. A page that showed twelve logos
 * with no state would read as twelve working integrations.
 *
 * TODO — once the platform API lands:
 *   - Credentials per integration, held in the secret manager rather than here
 *   - A connection test, and when it last succeeded
 *   - Per-tenant enablement, since not every restaurant takes every payment
 */
type Status = 'active' | 'planned';

const STATUS: Record<Status, { key: string; tone: string }> = {
  active: { key: 'active', tone: 'bg-success-50 text-success-700' },
  planned: { key: 'plannedState', tone: 'bg-bg-muted text-fg-muted' },
};

const GROUPS: readonly {
  key: string;
  items: readonly { name: string; detail: string; status: Status }[];
}[] = [
  {
    key: 'payment',
    items: [
      { name: 'Payme', detail: "To'lov tizimi", status: 'planned' },
      { name: 'Click', detail: "To'lov tizimi", status: 'planned' },
      { name: 'Uzum Bank', detail: "To'lov va bo'lib to'lash", status: 'planned' },
      {
        name: 'Fiskal modul',
        detail: 'Onlayn-kassa · chek va Z-hisobot, soliq.uz',
        status: 'planned',
      },
    ],
  },
  {
    key: 'delivery',
    items: [
      { name: 'Yandex Eats', detail: 'Agregator', status: 'planned' },
      { name: 'Express24', detail: 'Agregator', status: 'planned' },
      { name: 'Uzum Tezkor', detail: 'Agregator', status: 'planned' },
    ],
  },
  {
    key: 'messaging',
    items: [
      {
        name: 'Telegram Bot API',
        detail: 'Mehmon, ofitsiant va oshxona botlari',
        status: 'active',
      },
      { name: 'Eskiz', detail: 'SMS gateway', status: 'planned' },
    ],
  },
  {
    key: 'other',
    items: [
      { name: 'E-IMZO', detail: 'Yetkazib beruvchi shartnomalari uchun ERI', status: 'planned' },
      { name: 'Anthropic Claude', detail: 'Menyu maslahatchi, sharh tahlili', status: 'planned' },
      { name: 'Keycloak', detail: 'SSO · tarmoqlar uchun', status: 'planned' },
    ],
  },
];

export default async function IntegrationsPage() {
  const t = await getTranslations('platform.extra.integrations');

  const live = GROUPS.flatMap((group) => group.items).filter(
    (item) => item.status === 'active',
  ).length;
  const total = GROUPS.reduce((sum, group) => sum + group.items.length, 0);

  return (
    <>
      <PageIntro>
        {t('intro')} · <span data-num>{live}</span> {t('connected')},{' '}
        <span data-num>{total - live}</span> {t('planned')}
      </PageIntro>

      <div className="flex flex-col gap-5">
        {GROUPS.map((group) => (
          <section key={group.key}>
            <h3 className="text-fg-subtle text-2xs tracking-caps mb-2.5 font-semibold uppercase">
              {t(group.key)}
            </h3>

            <div className="grid [grid-template-columns:repeat(auto-fit,minmax(280px,1fr))] gap-3.5">
              {group.items.map((item) => {
                const status = STATUS[item.status];

                return (
                  <div key={item.name} className={`${CARD} flex items-start gap-3 px-5 py-4`}>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-semibold">{item.name}</div>
                      <div className="text-fg-subtle mt-1 text-xs">{item.detail}</div>
                    </div>

                    <span
                      className={`rounded-pill text-2xs flex-none px-[9px] py-1 font-semibold whitespace-nowrap ${status.tone}`}
                    >
                      {t(status.key)}
                    </span>
                  </div>
                );
              })}
            </div>
          </section>
        ))}
      </div>
    </>
  );
}
