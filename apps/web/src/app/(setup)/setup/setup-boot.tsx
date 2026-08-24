'use client';

import dynamic from 'next/dynamic';

import type { Lang } from './setup-data';

/**
 * Mounting the wizard in the browser and nowhere else.
 *
 * `ssr: false`, deliberately, and it is the one decision on this surface that
 * needs defending.
 *
 * The wizard resumes from local storage — no endpoint holds a half-finished
 * setup, so the draft lives in the browser. That means the markup the server
 * would produce (an empty form) and the markup the browser wants (the form as
 * it was left) disagree on the very first render, which is a hydration
 * mismatch: React logs an error and throws the server's tree away. The usual
 * dodge is to restore in an effect instead, and it is worse — the empty form
 * paints first and is replaced a frame later, so a wizard somebody spent
 * twenty minutes on appears, for one frame, to have lost everything.
 *
 * There is nothing here worth server-rendering anyway. Every value on this
 * screen is client state, the page is behind a session and never indexed, and
 * the eight panes are one form. So the wizard is a browser component and the
 * server sends a skeleton in the shape it will fill.
 *
 * `ssr: false` is only permitted inside a client component, which is the whole
 * reason this file exists between the page and the wizard.
 */
const SetupWizard = dynamic(() => import('./setup-wizard').then((module) => module.SetupWizard), {
  ssr: false,
  loading: () => <SetupSkeleton />,
});

export function SetupBoot({ initialLang }: { initialLang: Lang }) {
  return <SetupWizard initialLang={initialLang} />;
}

/**
 * The shape of the screen before the screen.
 *
 * Blocks matching the final layout rather than a spinner — FOUNDATIONS §5 — so
 * nothing jumps when the real thing arrives: the same 64px header, the same
 * 296px rail, a heading and a first field where they will be.
 *
 * `aria-hidden` with a live region beside it: a reader using a screen reader
 * gains nothing from eight grey rectangles, and everything from being told the
 * page is still loading.
 */
function SetupSkeleton() {
  return (
    <div className="sw">
      <span className="sr-only" role="status">
        Smart Restaurant
      </span>

      <div aria-hidden className="sw-header">
        <span className="bg-bg-muted size-[30px] flex-none rounded-[9px]" />
        <span className="bg-bg-muted h-4 w-40 rounded-[6px]" />
        <span className="flex-1" />
        <span className="sw-progress" />
      </div>

      <div aria-hidden className="sw-body">
        <div className="sw-rail">
          <div className="flex flex-col gap-2.5">
            {[0, 1, 2, 3, 4, 5, 6, 7].map((row) => (
              <div key={row} className="flex items-center gap-3 px-2.5 py-[11px]">
                <span className="bg-bg-muted size-6 flex-none rounded-full" />
                <span className="bg-bg-muted h-3.5 flex-1 rounded-[6px]" />
              </div>
            ))}
          </div>
        </div>

        <div className="sw-pane">
          <div className="grid gap-5">
            <span className="bg-bg-muted h-3 w-24 rounded-[6px]" />
            <span className="bg-bg-muted h-8 w-72 rounded-[8px]" />
            <span className="bg-bg-muted h-4 w-full max-w-[560px] rounded-[6px]" />
            <span className="bg-bg-muted mt-6 h-11 w-full rounded-[10px]" />
            <span className="bg-bg-muted h-11 w-full rounded-[10px]" />
          </div>
        </div>
      </div>
    </div>
  );
}
