import { pathLocale } from '@/lib/server-locale';

import { guestLocale } from '../../../(guest)/guest-session';
import { TG } from '@restaurant/surfaces/tg/copy';
import type { Lang } from '@restaurant/surfaces/tg/data';
import { TgTrackBoard } from './track-board';

export const dynamic = 'force-dynamic';

export async function generateMetadata() {
  const lang = guestLocale(await pathLocale(), null) as Lang;

  return { title: TG.order[lang] };
}

export default async function TelegramOrderPage() {
  const lang = guestLocale(await pathLocale(), null) as Lang;

  return <TgTrackBoard lang={lang} basket="tg:osh-xona" />;
}
