'use client';

import { TG_POINTS, say, type Lang } from '@restaurant/surfaces/tg/data';

import { useTgSession, tgGet } from '../../tg-session';
import { useEffect, useState } from 'react';

/**
 * This guest's own balance, inside Telegram.
 *
 * The card drew `TG_POINTS` — 2 840 points, silver tier, 71% of the way to
 * gold — to everyone who opened it, which is the design's guest and nobody
 * else's. The signature Telegram hands the WebView says who this is
 * (see tg-session.ts), and `GET /public/me` answers what they have.
 *
 * Three states and each says something true: loading (a moment), a real
 * balance, or "open this inside Telegram" — which is what a browser visiting
 * the URL directly deserves to be told.
 */
type Profile = { data?: { points?: number; tier?: string | null; name?: string | null } };

export function TgPointsBalance({
  lang,
  labels,
}: {
  lang: Lang;
  labels: { balance: string; outside: string; notConfigured: string; loading: string };
}) {
  const session = useTgSession();
  const [profile, setProfile] = useState<Profile['data'] | null>(null);

  useEffect(() => {
    if (session.state !== 'ready') return;

    let cancelled = false;

    void tgGet<Profile>(session.token, '/public/me').then((answer) => {
      if (!cancelled) setProfile(answer?.data ?? null);
    });

    return () => {
      cancelled = true;
    };
  }, [session]);

  const grouped = (value: number): string => value.toLocaleString('ru-RU').replace(/[, \s]/g, ' ');

  if (session.state === 'unavailable') {
    return (
      <>
        <p data-num className="font-display mt-1 text-3xl leading-none font-bold tracking-tight">
          —
        </p>
        <p className="mt-1.5 text-[11px]" style={{ color: 'rgba(255,255,255,.82)' }}>
          {session.reason === 'not_configured' ? labels.notConfigured : labels.outside}
        </p>
      </>
    );
  }

  const points = profile?.points ?? null;

  return (
    <>
      <p data-num className="font-display mt-1 text-3xl leading-none font-bold tracking-tight">
        {session.state === 'loading' || points === null ? '…' : grouped(points)}
      </p>
      <p className="mt-1.5 text-[11px]" style={{ color: 'rgba(255,255,255,.82)' }}>
        {profile?.tier ?? say(TG_POINTS.tier, lang)}
      </p>
    </>
  );
}

/**
 * What the balance is worth in money, under the history.
 *
 * The same read as the card, made once more rather than lifted into a shared
 * provider: two reads of one cached endpoint on one screen is cheaper than
 * the state plumbing, and the second one is free — the browser has it.
 */
export function TgPointsWorth({
  lang,
  template,
  worthPerPoint,
}: {
  lang: Lang;
  /** `costs` from the Telegram catalogue: "{n} ball". */
  template: string;
  /** Tiyin one point is worth — a platform rule, not a guest's figure. */
  worthPerPoint: number;
}) {
  const session = useTgSession();
  const [points, setPoints] = useState<number | null>(null);

  useEffect(() => {
    if (session.state !== 'ready') return;

    let cancelled = false;

    void tgGet<Profile>(session.token, '/public/me').then((answer) => {
      if (!cancelled) setPoints(answer?.data?.points ?? null);
    });

    return () => {
      cancelled = true;
    };
  }, [session]);

  if (points === null) return null;

  const money = new Intl.NumberFormat(lang === 'en' ? 'en-GB' : 'ru-RU').format(
    Math.round((points * worthPerPoint) / 100),
  );

  return (
    <p data-num className="mt-4 text-[11px]" style={{ color: 'var(--tg-hint)' }}>
      {template.replace('{n}', points.toLocaleString('ru-RU').replace(/[, \s]/g, ' '))} · {money}
    </p>
  );
}
