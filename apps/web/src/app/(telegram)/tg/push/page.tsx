import { pathLocale } from '@/lib/server-locale';

import { guestLocale } from '../../../(guest)/guest-session';
import { TG } from '@restaurant/surfaces/tg/copy';
import type { Lang } from '@restaurant/surfaces/tg/data';
import { TgPushBoard } from './push-board';

export const dynamic = 'force-dynamic';

export async function generateMetadata() {
  const lang = guestLocale(await pathLocale(), null) as Lang;

  return { title: TG.pushTab[lang] };
}

export default async function TelegramPushPage() {
  const lang = guestLocale(await pathLocale(), null) as Lang;

  return <TgPushBoard lang={lang} />;
}
