import { getTranslations } from 'next-intl/server';

import { CARD, PageIntro } from '../screen';

export async function generateMetadata() {
  const nav = await getTranslations('platform.nav');
  return { title: nav('modules') };
}

/**
 * Which parts of the product exist at all.
 *
 * Mirrors `apps/api/modules_statuses.json`. A module switched off here should
 * disappear from every client — which is why the restaurant console reads its
 * capability list from the API rather than hard-coding it.
 *
 * The name is the module's own — `Menu`, `Orders`, `Kitchen` — because that is
 * what the code, the schema and the route prefix all call it. Only the sentence
 * underneath is translated.
 *
 * Drawn as switches, not checkboxes: the same control as the platform settings
 * next door, because it does the same kind of thing.
 *
 * TODO — once the platform API lands:
 *   - A real toggle, saved per tenant in `tenants.settings`
 *   - The audit entry that must accompany turning a module off
 *   - What happens to data in a module that is switched off
 */
const MODULES: readonly { key: string; name: string; on: boolean }[] = [
  { key: 'menu', name: 'Menu', on: true },
  { key: 'orders', name: 'Orders', on: true },
  { key: 'kitchen', name: 'Kitchen', on: true },
  { key: 'tables', name: 'Tables', on: true },
  { key: 'inventory', name: 'Inventory', on: true },
  { key: 'suppliers', name: 'Suppliers', on: true },
  { key: 'staff', name: 'Staff', on: true },
  { key: 'finance', name: 'Finance', on: true },
  { key: 'crm', name: 'CRM', on: true },
  { key: 'analytics', name: 'Analytics', on: true },
  { key: 'telegram', name: 'Telegram', on: true },
  { key: 'pos', name: 'POS', on: true },
];

export default async function ModulesPage() {
  const t = await getTranslations('platform.extra.modules');

  return (
    <>
      <PageIntro>{t('intro')}</PageIntro>

      <div className="grid [grid-template-columns:repeat(auto-fit,minmax(340px,1fr))] gap-3.5">
        {MODULES.map((module) => (
          <div key={module.key} className={`${CARD} flex items-center gap-5 px-5 py-4`}>
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline gap-2">
                <span className="text-sm font-semibold">{module.name}</span>
                <span className="text-fg-subtle text-2xs font-mono">{module.key}</span>
              </div>
              <div className="text-fg-subtle mt-1 text-xs">{t(module.key)}</div>
            </div>

            <button
              type="button"
              role="switch"
              aria-checked={module.on}
              aria-label={module.name}
              className={`rounded-pill flex h-[26px] w-11 flex-none items-center p-[3px] transition-colors ${
                module.on ? 'bg-brand-500' : 'bg-border-strong'
              }`}
            >
              <span
                className={`rounded-pill block size-5 bg-white shadow-sm transition-transform ${
                  module.on ? 'translate-x-[18px]' : ''
                }`}
              />
            </button>
          </div>
        ))}
      </div>
    </>
  );
}
