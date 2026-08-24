'use client';

import { useEffect, useState } from 'react';

/**
 * "Add this to your home screen" — and the two entirely different ways that
 * happens.
 *
 * `Smart Restaurant Sayt va PWA.dc.html:limits` states the problem in one line:
 * **"iOS da o'rnatish qo'lda"** — Safari shows no install banner and fires no
 * event, so on an iPhone the only way in is for us to say *Share → Add to Home
 * Screen* in words. Chrome and the Android browsers do the opposite: they fire
 * `beforeinstallprompt`, and if nothing calls `preventDefault()` on it they may
 * show their own bar wherever they like.
 *
 * So this component is two components wearing one name, and that is the design's
 * shape rather than an accident:
 *
 *   **Chrome and friends** — capture the event, suppress the browser's own bar,
 *   and offer a button that calls `prompt()` at a moment the guest chose.
 *
 *   **iOS Safari** — no event will ever arrive, so detect the browser and draw
 *   the three-step instruction with the share glyph the system actually uses.
 *   A generic "install this app" on iOS is a sentence nobody can act on.
 *
 * The design's argument for bothering at all is in the same file: an installed
 * PWA is ~1.4 MB, publishes in thirty seconds, pays no store commission and
 * updates without a download. The whole channel strategy rests on guests
 * actually installing it, and they only do that if asked.
 *
 * ---------------------------------------------------------------------------
 * What it will not do
 *
 * It does not ask on first paint. A prompt over a menu somebody has not read is
 * the pattern that trained people to dismiss these without looking — `delayMs`
 * exists so a surface can wait until the guest has done something. Dismissal is
 * remembered, and it is remembered per surface: declining the customer app says
 * nothing about the staff app.
 */

/** The Chrome-family event, which TypeScript's DOM lib still does not name. */
type InstallEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
};

type Copy = {
  /** "Ilovani o'rnating" — the heading, on both paths. */
  title: string;
  /** Why it is worth a tap. One sentence. */
  body: string;
  /** The action, where there is one to take. */
  action: string;
  /** iOS only: the three steps, already numbered by the layout. */
  steps: readonly string[];
  dismiss: string;
};

const COPY: Readonly<Record<'uz' | 'ru' | 'en', Copy>> = {
  uz: {
    title: 'Ilovani telefonga qo‘shing',
    body: 'Bosh ekrandan bir bosishda ochiladi va menyu tarmoqsiz ham ko‘rinadi.',
    action: 'Qo‘shish',
    steps: [
      'Pastdagi «Ulashish» tugmasini bosing',
      '«Bosh ekranga qo‘shish» ni tanlang',
      '«Qo‘shish» ni bosing',
    ],
    dismiss: 'Hozir emas',
  },
  ru: {
    title: 'Добавьте приложение на телефон',
    body: 'Открывается с домашнего экрана одним касанием, меню работает и без сети.',
    action: 'Добавить',
    steps: ['Нажмите «Поделиться» внизу', 'Выберите «На экран «Домой»»', 'Нажмите «Добавить»'],
    dismiss: 'Не сейчас',
  },
  en: {
    title: 'Add the app to your phone',
    body: 'One tap from the home screen, and the menu works without a connection.',
    action: 'Add',
    steps: ['Tap Share at the bottom', 'Choose Add to Home Screen', 'Tap Add'],
    dismiss: 'Not now',
  },
};

/** Already running as an installed app — nothing to offer. */
function isStandalone(): boolean {
  if (typeof window === 'undefined') return false;

  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    // Safari's own, non-standard flag. Still the only signal on iOS.
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

/**
 * iOS Safari, where no install event exists.
 *
 * Chrome and Firefox on iOS report as Safari too and cannot install either, so
 * treating the whole platform the same way is correct rather than lazy.
 */
function isIos(): boolean {
  if (typeof window === 'undefined') return false;

  return /iphone|ipad|ipod/i.test(window.navigator.userAgent);
}

export function InstallPrompt({
  surface,
  lang,
  delayMs = 20_000,
}: {
  /** Which app is being offered. Dismissal is remembered against this. */
  surface: 'customer' | 'crew' | 'mp' | 'site';
  lang: 'uz' | 'ru' | 'en';
  /** How long to let somebody use the surface before asking. */
  delayMs?: number;
}) {
  const [event, setEvent] = useState<InstallEvent | null>(null);
  const [manual, setManual] = useState(false);
  const [open, setOpen] = useState(false);

  const key = `srcp-install-${surface}`;
  const t = COPY[lang];

  useEffect(() => {
    if (isStandalone()) return;

    /*
     * A refusal is remembered. Not forever — six months, because a guest who
     * declined in March may have changed their mind by September and the cost
     * of asking twice a year is one dismissal.
     */
    try {
      const declined = window.localStorage.getItem(key);
      if (declined !== null && Date.now() - Number(declined) < 180 * 24 * 60 * 60 * 1000) return;
    } catch {
      // Private browsing, or a browser configured to refuse site data. The
      // prompt still works; it just cannot remember a refusal.
    }

    const onBeforeInstall = (raw: Event) => {
      // Suppress the browser's own bar so the ask happens where the design puts
      // it rather than over whatever the guest is reading.
      raw.preventDefault();
      setEvent(raw as InstallEvent);
    };

    window.addEventListener('beforeinstallprompt', onBeforeInstall);

    /*
     * Both decisions happen when the prompt is about to show, not on mount.
     *
     * Arming the iOS path with a synchronous `setState` inside the effect is a
     * cascading render for a value nothing reads for another two minutes — and
     * React's own lint rule says so. Deciding inside the timer is also more
     * honest: on a browser that will fire `beforeinstallprompt`, it usually has
     * by then, and the manual instructions are only drawn where no event came.
     */
    const timer = window.setTimeout(() => {
      setManual(isIos());
      setOpen(true);
    }, delayMs);

    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstall);
      window.clearTimeout(timer);
    };
  }, [key, delayMs]);

  const close = () => {
    setOpen(false);

    try {
      window.localStorage.setItem(key, String(Date.now()));
    } catch {
      // See above: a browser that refuses storage still gets a working prompt.
    }
  };

  const install = async () => {
    if (event === null) return;

    await event.prompt();
    // Whatever they chose, the event is single-use — Chrome will fire a fresh
    // one on a later visit if the app is still not installed.
    setEvent(null);
    close();
  };

  if (!open || (event === null && !manual)) return null;

  return (
    <div
      data-sheet
      role="dialog"
      aria-label={t.title}
      className="bg-surface border-border fixed inset-x-3 bottom-3 z-[200] rounded-xl border p-4 shadow-xl"
      style={{ marginBottom: 'env(safe-area-inset-bottom)' }}
    >
      <p className="text-md font-semibold">{t.title}</p>
      <p className="text-fg-muted mt-1 text-sm leading-normal">{t.body}</p>

      {event !== null ? (
        <div className="mt-3.5 flex gap-2">
          <button
            type="button"
            onClick={() => void install()}
            className="bg-brand-500 h-11 flex-1 rounded-md text-sm font-semibold text-white"
          >
            {t.action}
          </button>
          <button
            type="button"
            onClick={close}
            className="border-border-strong h-11 rounded-md border px-4 text-sm font-semibold"
          >
            {t.dismiss}
          </button>
        </div>
      ) : (
        <>
          {/* The iOS path: no button can do this, so the steps are the content. */}
          <ol className="mt-3 flex flex-col gap-2">
            {t.steps.map((step, index) => (
              <li key={step} className="flex items-start gap-2.5 text-sm">
                <span
                  data-num
                  className="bg-bg-muted text-fg-muted mt-px grid size-5 flex-none place-items-center rounded-full text-[11px] font-bold"
                >
                  {index + 1}
                </span>
                <span className="leading-snug">{step}</span>
              </li>
            ))}
          </ol>

          <button
            type="button"
            onClick={close}
            className="border-border-strong mt-3.5 h-11 w-full rounded-md border text-sm font-semibold"
          >
            {t.dismiss}
          </button>
        </>
      )}
    </div>
  );
}
