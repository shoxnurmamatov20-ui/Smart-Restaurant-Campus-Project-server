import { headers } from 'next/headers';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { copy, LOCK } from '@restaurant/surfaces/crew/copy';
import { isCrewRole, LOCK_PUSHES, say, type PushTone } from '@restaurant/surfaces/crew/data';
import { crewLang } from '../../../crew-session';
import { LockClock } from './lock-clock';

/**
 * The locked state, and the notifications waiting behind it.
 *
 * The design draws this as the phone's own lock screen, which a web page cannot
 * be. What it *can* be — and what the design's own More menu already routes to
 * — is this app locked: the shift is still open, the person put the phone down
 * or handed it over, and what shows through is the same set of notifications
 * with the working screens sealed behind a PIN. That is a real state in a
 * restaurant, where one phone gets passed between two people on the same shift.
 *
 * **The notification type changes entirely with the role**, which is the
 * design's sharpest observation about this app. An owner is asked to approve
 * eight million so'm; a waiter is told three plates are going cold. Flattening
 * those into one generic "you have a new item" card would have thrown away the
 * only thing that makes a push worth sending.
 *
 * Only notifications that need an answer carry buttons, and the buttons
 * navigate — a page has no notification service to act through and no session
 * to act with, so the honest thing is to open the app where the answer is
 * given. `LOCK.actionNote` says so once, under the stack, rather than lying
 * quietly on four cards.
 *
 * At `/crew/lock/<role>` rather than inside the role's own subtree, and that is
 * structural rather than cosmetic: everything under `/crew/<role>/` is wrapped
 * by the app chrome, and a lock screen with a dock across the bottom of it is
 * not locked.
 */
export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Qulflangan',
  robots: { index: false, follow: false },
};

export default async function CrewLockPage({ params }: { params: Promise<{ role: string }> }) {
  const { role } = await params;
  if (!isCrewRole(role)) notFound();

  const lang = crewLang((await headers()).get('accept-language'));
  const t = copy(LOCK, lang);
  const pushes = LOCK_PUSHES[role];

  return (
    <main
      className="flex h-dvh flex-col overflow-hidden px-4 pb-6"
      style={{
        background: 'var(--crew-lock-bg)',
        paddingTop: 'env(safe-area-inset-top, 0px)',
      }}
    >
      <h1 className="sr-only">{t.title}</h1>
      <LockClock lang={lang} />

      <div data-crew-scroll className="grid content-start gap-2.5 pt-5">
        {pushes.map((push) => (
          <article
            key={push.id}
            className="rounded-2xl border p-3.5"
            style={{
              background: 'var(--crew-lock-card)',
              borderColor: 'var(--crew-lock-border)',
              /*
               * The frosted card is the design's own treatment and it is doing
               * work: a notification stack over a photographic wallpaper needs
               * separation from whatever is behind it without going opaque and
               * covering the wallpaper entirely.
               */
              backdropFilter: 'blur(12px)',
            }}
          >
            <div className="flex items-center gap-2.5">
              <span
                aria-hidden
                className={`grid size-[22px] flex-none place-items-center rounded-md text-[10px] font-extrabold text-white ${mark(push.tone)}`}
              >
                {push.mark}
              </span>
              <p
                className={`text-2xs tracking-caps min-w-0 flex-1 truncate font-bold uppercase ${kind(push.tone)}`}
              >
                {say(push.kind, lang)}
              </p>
              <span data-num className="text-2xs flex-none text-[var(--crew-lock-dim)]">
                {say(push.ago, lang)}
              </span>
            </div>

            <h2 className="mt-2 text-sm leading-snug font-semibold text-[var(--crew-lock-fg)]">
              {say(push.title, lang)}
            </h2>
            <p className="mt-1 text-xs leading-normal text-[var(--crew-lock-dim)]">
              {say(push.body, lang)}
            </p>

            {push.actions !== undefined ? (
              <div className="mt-3 flex gap-2">
                {push.actions.map((action) => (
                  <Link
                    key={action.label.en}
                    href={`/crew/${role}/${action.tab}`}
                    data-press
                    className={`text-2xs grid h-11 flex-1 place-items-center rounded-[10px] font-semibold ${
                      action.primary
                        ? 'bg-brand-500 text-white'
                        : 'border text-[var(--crew-lock-fg)]'
                    }`}
                    style={action.primary ? undefined : { borderColor: 'var(--crew-lock-border)' }}
                  >
                    {say(action.label, lang)}
                  </Link>
                ))}
              </div>
            ) : null}
          </article>
        ))}

        <p className="px-1 pt-2 text-[11px] leading-normal text-[var(--crew-lock-dim)]">
          {t.actionNote} {t.note}
        </p>
      </div>

      {/*
       * The way out. On a real lock screen this is a swipe; here it is a
       * 44px target back to the keypad, because a locked screen with no
       * visible way to unlock it is a phone somebody reboots.
       */}
      <Link
        href="/crew"
        data-press
        className="mt-3 grid h-12 flex-none place-items-center rounded-full border text-sm font-semibold text-[var(--crew-lock-fg)]"
        style={{
          borderColor: 'var(--crew-lock-border)',
          background: 'var(--crew-lock-card)',
          marginBottom: 'env(safe-area-inset-bottom, 0px)',
        }}
      >
        {t.unlock}
      </Link>
    </main>
  );
}

/** The square behind the mark. */
function mark(tone: PushTone): string {
  switch (tone) {
    case 'brand':
      return 'bg-brand-500';
    case 'success':
      return 'bg-success-500';
    case 'warning':
      return 'bg-warning-500';
    case 'danger':
      return 'bg-danger-500';
  }
}

/**
 * The category line above the title.
 *
 * Lifted values rather than the semantic `--danger-600` and friends: this card
 * is on a near-black gradient in both themes, and the 600-weight ramp that
 * reads correctly on white fails contrast here. The 300/400 steps are what the
 * design uses on its own dark surfaces.
 */
function kind(tone: PushTone): string {
  switch (tone) {
    case 'brand':
      return 'text-brand-300';
    case 'success':
      return 'text-success-500';
    case 'warning':
      return 'text-warning-500';
    case 'danger':
      return 'text-danger-500';
  }
}
