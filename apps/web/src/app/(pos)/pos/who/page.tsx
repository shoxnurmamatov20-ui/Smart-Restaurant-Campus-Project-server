import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';

import { pairedTerminal } from '@/lib/pos-session';

import '../pos.css';
import { WhoPanel } from './who-panel';

export async function generateMetadata() {
  const t = await getTranslations('console.pos');

  return { title: t('whoTitle') };
}

/**
 * The step between the idle screen and the order screen.
 *
 * Gated on pairing rather than trusting the link that got here: this URL can
 * be typed, and an unpaired tablet reaching it would show an empty staff list
 * with no explanation. Sending it back to /pos puts the pairing panel in front
 * of whoever is holding it, which is the thing they actually need to do.
 */
export default async function PosWhoPage() {
  if ((await pairedTerminal()) === null) {
    redirect('/pos');
  }

  return <WhoPanel />;
}
