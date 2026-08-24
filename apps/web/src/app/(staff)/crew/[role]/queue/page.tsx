import { headers } from 'next/headers';
import { notFound } from 'next/navigation';

import { copy, QUEUE_COPY } from '@restaurant/surfaces/crew/copy';
import { isCrewRole } from '@restaurant/surfaces/crew/data';
import { crewLang } from '../../../crew-session';
import { QueueBoard } from './queue-board';

export const dynamic = 'force-dynamic';

export async function generateMetadata() {
  const lang = crewLang((await headers()).get('accept-language'));

  return { title: copy(QUEUE_COPY, lang).title, robots: { index: false, follow: false } };
}

export default async function CrewQueuePage({ params }: { params: Promise<{ role: string }> }) {
  const { role } = await params;
  if (!isCrewRole(role)) notFound();

  const lang = crewLang((await headers()).get('accept-language'));

  return <QueueBoard lang={lang} role={role} />;
}
