import { headers } from 'next/headers';
import { notFound } from 'next/navigation';

import { copy, ORDER_COPY, TABLES_COPY } from '@restaurant/surfaces/crew/copy';
import { isCrewRole } from '@restaurant/surfaces/crew/data';
import { crewLang } from '../../../../../crew-session';
import { crewMenu, tableDetail } from '../../../../../crew-server';
import { OrderBoard } from './order-board';

export const dynamic = 'force-dynamic';

export async function generateMetadata() {
  const lang = crewLang((await headers()).get('accept-language'));

  return { title: copy(ORDER_COPY, lang).title, robots: { index: false, follow: false } };
}

export default async function CrewTableOrderPage({
  params,
}: {
  params: Promise<{ role: string; table: string }>;
}) {
  const { role, table } = await params;
  if (!isCrewRole(role)) notFound();

  const lang = crewLang((await headers()).get('accept-language'));

  /*
   * Both reads, in parallel, because the pad is useless without either: the
   * table says which bill the lines land on and the menu carries the ids they
   * are named by. The floor is asked first for the same reason the table detail
   * asks it — a live table is keyed by its database id, and looking it up in
   * the fixture alone turned every real table into a 404.
   */
  const [detail, menu] = await Promise.all([tableDetail(table, lang), crewMenu(lang)]);

  if (detail === null) notFound();

  const word = copy(TABLES_COPY, lang).table;

  return (
    <OrderBoard
      lang={lang}
      role={role}
      table={table}
      tableLabel={`${word} ${detail.table.number}`}
      tableId={detail.table.id}
      orderId={detail.table.orderId}
      dishes={menu.rows}
      live={menu.live && detail.live}
    />
  );
}
