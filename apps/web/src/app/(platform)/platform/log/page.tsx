import { getTranslations } from 'next-intl/server';

import { Chip, Head, type ChipTone } from '../../platform-ui';
import { type LogLevel } from '../platform-data';
import { platformLog } from '../platform-server';

export async function generateMetadata() {
  const t = await getTranslations('console.platformNav');
  return { title: t('log') };
}

/**
 * The system event log.
 *
 * Deliberately the least designed screen on this surface: monospaced, dense,
 * newest first, and the message left exactly as the system wrote it. Somebody
 * reading this is comparing it against something else — a ticket, a terminal,
 * a stack trace — and prettifying the text makes that comparison harder.
 *
 * Levels are coloured because a page of identical grey lines is a page nobody
 * scans. Nothing else here is styled at all.
 */
export default async function LogPage() {
  const [t, nav, entries] = await Promise.all([
    getTranslations('console.platformLog'),
    getTranslations('console.platformNav'),
    platformLog(),
  ]);

  const TONE: Record<LogLevel, ChipTone> = {
    info: 'neutral',
    warning: 'warning',
    error: 'danger',
  };

  return (
    <>
      <Head title={nav('log')} subtitle={t('subtitle')} />

      <ul className="bg-surface divide-divider divide-y rounded-lg border">
        {entries.map((entry) => (
          <li key={entry.id} className="flex items-baseline gap-3 px-5 py-2.5">
            <span data-num className="text-fg-subtle w-[68px] flex-none text-xs">
              {entry.at}
            </span>
            <span className="w-[86px] flex-none">
              <Chip tone={TONE[entry.level]}>{t(`level_${entry.level}`)}</Chip>
            </span>
            <span className="text-fg-muted w-[68px] flex-none text-xs">{entry.source}</span>
            <span className="min-w-0 flex-1 font-mono text-xs leading-relaxed break-words">
              {entry.message}
            </span>
          </li>
        ))}
      </ul>
    </>
  );
}
