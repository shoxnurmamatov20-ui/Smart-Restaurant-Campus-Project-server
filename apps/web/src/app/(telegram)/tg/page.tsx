import { pathLocale } from '@/lib/server-locale';

import { guestLocale } from '../../(guest)/guest-session';
import { TgChatBoard } from './chat-board';
import { TG_BOT, type Lang } from '@restaurant/surfaces/tg/data';

export const dynamic = 'force-dynamic';

export const metadata = { title: TG_BOT.name };

/**
 * `/tg` is the bot conversation, not a redirect to the menu.
 *
 * It used to `redirect('/tg/menu')`, which is the shape of the product read
 * backwards: the design's three stages are chat, mini app, notifications, and
 * the chat is the one every guest passes through. Skipping it removed the only
 * door into the mini app and, with it, the rate-and-report buttons that are the
 * whole of `GAPS.md §4.1 K3`.
 */
export default async function TelegramChatPage() {
  const lang = guestLocale(await pathLocale(), null) as Lang;

  return <TgChatBoard lang={lang} />;
}
