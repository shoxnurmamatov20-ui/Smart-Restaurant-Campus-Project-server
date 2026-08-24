'use client';

import { useEffect, useState } from 'react';

import { say, TG_DELIVERY, TG_PICKUP, type Lang } from '@restaurant/surfaces/tg/data';

import { tgGet, useTgSession } from '../../tg-session';

/**
 * Where the food is going, on the guest's own account.
 *
 * The line under the mini app's header used to read "Yetkazish · Chilonzor 24,
 * 47-xonadon" for everybody — the design's guest, their district and their flat
 * number, printed to every person who opened the bot. It is the first line on
 * the screen and the one a guest checks before they order, so a fixture there
 * is not decoration: it is a delivery address that is not theirs.
 *
 * Telegram's signature says who this is (see ../../tg-session.ts) and
 * `GET /public/me` answers with the addresses they have saved. With none saved
 * — or opened outside Telegram, where there is nobody to be — the line says the
 * word for the mode and nothing more, and the guest sets the address in the
 * basket as they always have.
 */
type Profile = {
  data?: {
    addresses?: readonly { label?: string | null; line?: string | null; primary?: boolean }[];
  };
};

export function TgWhereLine({ lang, mode }: { lang: Lang; mode: 'delivery' | 'pickup' }) {
  const session = useTgSession();
  const [address, setAddress] = useState<string | null>(null);

  useEffect(() => {
    if (session.state !== 'ready') return;

    let cancelled = false;

    void tgGet<Profile>(session.token, '/public/me').then((answer) => {
      if (cancelled) return;

      const saved = answer?.data?.addresses ?? [];
      // The one they marked, else the first: an address book with no primary is
      // ordinary, and picking none would drop the line for a guest who has one.
      const chosen = saved.find((entry) => entry.primary === true) ?? saved[0];
      const line = (chosen?.line ?? '').trim();

      setAddress(line === '' ? null : line);
    });

    return () => {
      cancelled = true;
    };
  }, [session]);

  /*
   * Pickup names a branch rather than an address, and this screen does not know
   * which branch — the basket does. The design's word for the mode is the true
   * half of that line, so it stays and the invented venue goes.
   */
  const word = say(mode === 'delivery' ? TG_DELIVERY.where : TG_PICKUP.where, lang).split(' · ')[0];

  return (
    <>
      <span className="block text-sm font-semibold">
        {mode === 'delivery' && address !== null ? `${word} · ${address}` : word}
      </span>
    </>
  );
}
