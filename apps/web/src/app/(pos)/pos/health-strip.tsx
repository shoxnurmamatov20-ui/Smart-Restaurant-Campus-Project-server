'use client';

import { useEffect, useState, useSyncExternalStore } from 'react';
import { useLocale } from 'next-intl';
import { flash } from '@restaurant/ui';

import { fill, POS_COPY, say, type Trilingual } from './pos-copy';
import { serverSnapshot, snapshot, subscribe } from './pos-queue';

/**
 * The 38px strip along the bottom of the till, and the panel behind it.
 *
 * `Smart Restaurant OS.dc.html:6643` draws it and the build had nothing there.
 * Everything on it is something a cashier finds out about *late* otherwise: the
 * printer that stopped answering two orders ago, the live link that dropped so
 * the kitchen never saw the last docket, the queue that is holding four writes.
 *
 * **A chip that is fine is quiet.** Grey pill, no animation. A chip that is not
 * turns red and pulses once a second and a half — which is the only motion on
 * this surface, and it is there because a till stands in a room where nobody is
 * looking at it until something is wrong.
 *
 * ---------------------------------------------------------------------------
 * Every chip is a button, because a red dot is not an instruction
 *
 * The strip shipped as five `<span>`s with a `title` on each. On a tablet there
 * is no pointer, so the tooltip was unreachable and the whole strip said exactly
 * one thing: *something*. The design never drew it that way — `dc.html:12555`
 * gives every chip a `tap`, and `dc.html:7916` is the panel it opens: what broke,
 * what it means for the next order, what to do about it, and the one or two
 * buttons that do it.
 *
 * That panel is why the copy is long. It is read by whoever is standing at the
 * till at the moment it goes wrong — not by an engineer later — so it answers
 * "can I keep taking orders" before it says anything about the cause.
 *
 * The right-hand meta — terminal, version, clock — is the design's and is the
 * first thing anybody reads out over the phone to support.
 */
type Chip = {
  key: string;
  label: string;
  up: boolean;
  /** The one-line status. Also the panel's body while the thing is fine. */
  tip: string;
  /** What broke, in the reader's language. Absent for a chip that cannot break. */
  down?: { title: Trilingual; body: Trilingual; fix: Trilingual };
  /**
   * Printers get a different pair of buttons.
   *
   * `dc.html:12567` — a printer is a thing in the room, so its actions are "try
   * it again" and "open its settings". Everything else on this strip is the
   * network in one form or another, and there is only one thing to do about
   * that: look at what is waiting.
   */
  isPrinter?: boolean;
};

/** A stable empty array — a fresh `[]` per render would loop the store. */
const EMPTY: never[] = [];

function subscribeOnline(onChange: () => void) {
  window.addEventListener('online', onChange);
  window.addEventListener('offline', onChange);

  return () => {
    window.removeEventListener('online', onChange);
    window.removeEventListener('offline', onChange);
  };
}

export function HealthStrip({
  terminal,
  labels,
  onSeeQueue,
  onDiagnosing,
}: {
  /** `POS-3 · Chilonzor`, already joined. Null before the tablet is paired. */
  terminal: string | null;
  labels: Record<string, string>;
  /**
   * Told whenever the diagnosis panel opens or closes.
   *
   * The till binds `1`–`9` to the tables and `+`/`−` to the last line, and it
   * mutes them while any overlay is up — a digit pressed over an open sheet
   * used to reach past it and start a bill on table 3. The panel is one more
   * overlay, so it has to say so; the flag lives with the keyboard rather than
   * here because that is where the muting is decided.
   */
  onDiagnosing?: (open: boolean) => void;
  /**
   * Opens the sync panel — the design's one action for every network chip.
   *
   * Passed in rather than owned here because the queue panel belongs to the
   * till, not to this strip: two copies of it could disagree about how many
   * writes are outstanding, which is the single number this whole surface
   * exists to be trusted about.
   */
  onSeeQueue: () => void;
}) {
  const locale = useLocale();
  const word = (phrase: Trilingual) => say(locale, phrase);

  const online = useSyncExternalStore(
    subscribeOnline,
    () => navigator.onLine,
    () => true,
  );

  /*
   * The queue, read through the same store the sync panel uses.
   *
   * `snapshot()` is the cached one — it must be, or `useSyncExternalStore`
   * compares two fresh arrays every render and loops. `queuedFor` filters it to
   * what is still waiting.
   */
  const entries = useSyncExternalStore(
    subscribe,
    () => (terminal === null ? EMPTY : snapshot(terminal)),
    serverSnapshot,
  );

  /*
   * Counted from the snapshot React just handed us, not from a second read.
   *
   * An entry with a `conflict` is waiting on a *person*, not on the network, so
   * it is not part of "four writes the router is holding" — it belongs to the
   * sync panel's question queue and is counted there.
   */
  const queued = entries.filter((entry) => entry.conflict === undefined).length;

  /** Which chip's diagnosis is open. One at a time — the panel is modal. */
  const [openKey, setOpenKey] = useState<string | null>(null);

  /**
   * What the print queue says about itself, or null before the first answer.
   *
   * Null reads as fine, and that is the right direction to be wrong in on this
   * one chip: a strip that went red for the two seconds before its first answer
   * would go red every time a till was switched on, and a printer that is
   * genuinely down announces itself on the next poll rather than on the next
   * order.
   */
  const [printers, setPrinters] = useState<string | null>(null);

  /**
   * Bumped to ask the printers again before the timer would have.
   *
   * A re-queue changes the answer within a second or two, and thirty seconds of
   * a red chip over a queue that has just been refilled is thirty seconds of a
   * cashier believing the button did nothing. A counter rather than a callback
   * because the poll owns its own `alive` guard and its own interval, and two
   * ways of starting it would eventually run two of them.
   */
  const [repolls, setRepolls] = useState(0);

  /** True while the re-queue is in flight, so the button cannot be double-tapped. */
  const [requeueing, setRequeueing] = useState(false);

  /*
   * Polled, not pushed.
   *
   * A printer failing is not an event anybody publishes — it is a job that
   * stopped being claimed, which is a thing you notice by looking. Thirty
   * seconds is the same tempo as the clock beside it and well inside the window
   * that matters: the question this chip answers is "is the docket I just fired
   * coming out", and a cashier asks it about once a table.
   *
   * Only while somebody is signed in. The endpoint takes the shift token, and a
   * till showing its idle screen has none — asking anyway is a 409 every thirty
   * seconds for the whole night.
   */
  useEffect(() => {
    if (terminal === null) return;

    let alive = true;

    const ask = async () => {
      try {
        const response = await fetch('/api/pos/printers', { cache: 'no-store' });

        if (!response.ok) {
          // A refusal or a restart. Kept quiet rather than drawn as a failed
          // printer — this chip is about the hardware, and the two network
          // chips beside it already say when the API is unreachable.
          if (alive) setPrinters(null);

          return;
        }

        // The one word of the payload this strip draws. The queue depths and
        // the per-printer rows belong to a settings screen, not to a chip.
        const body = (await response.json()) as { state: string };

        if (alive) setPrinters(body.state);
      } catch {
        if (alive) setPrinters(null);
      }
    };

    void ask();

    const id = setInterval(() => void ask(), 30_000);

    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [terminal, repolls]);

  /**
   * Put this venue's failed dockets back in the queue.
   *
   * `POST /pos/print-queue/requeue` — no body, `pos.sell`, and the venue is the
   * terminal's own rather than anything this tablet sends. It touches `failed`
   * jobs only: a `queued` one is already being retried by the backoff and a
   * `claimed` one is in an agent's hands, so re-queueing either prints the same
   * receipt a second time.
   *
   * **The count is the answer, and zero is an answer.** The design flashes
   * `"{printer} · ulandi"` unconditionally, which is a claim about a machine in
   * another room that this tablet cannot see; a cashier who reads it walks away
   * from a printer that is still dead. So: a number when jobs moved, and a
   * problem toast naming the printer itself when none did.
   *
   * The panel closes only when something moved. If nothing did, the diagnosis —
   * check the paper, check the cable — is exactly what the person is now
   * supposed to read, and taking it off the screen would be the same walking
   * away by another route.
   */
  async function requeuePrinting() {
    if (requeueing) return;

    setRequeueing(true);

    try {
      const response = await fetch('/api/pos/print-queue', { method: 'POST', cache: 'no-store' });

      const body = (await response.json().catch(() => null)) as { requeued?: number } | null;

      if (!response.ok || typeof body?.requeued !== 'number') {
        flash.problem(word(POS_COPY.hzRetryFailed));

        return;
      }

      if (body.requeued === 0) {
        flash.problem(word(POS_COPY.hzRetryNone));

        return;
      }

      flash(fill(word(POS_COPY.hzRetryDone), { n: String(body.requeued) }));

      setOpenKey(null);
      onDiagnosing?.(false);
      setRepolls((count) => count + 1);
    } catch {
      flash.problem(word(POS_COPY.hzRetryFailed));
    } finally {
      setRequeueing(false);
    }
  }

  /*
   * The clock ticks, and it is rendered only after mount.
   *
   * A server-rendered time is the server's, which on a tablet in another
   * timezone is simply wrong — and it would differ between the server pass and
   * the first client pass, which is a hydration mismatch. Empty until the first
   * tick, which lasts one paint.
   */
  const [clock, setClock] = useState('');

  useEffect(() => {
    const tick = () => {
      const now = new Date();

      setClock(
        `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`,
      );
    };

    tick();

    const id = setInterval(tick, 30_000);

    return () => clearInterval(id);
  }, []);

  /*
   * The order is the design's: the live link, then the network, then the
   * hardware — `dc.html:12522`, where the printers are `.concat()`ed onto
   * `[ws, net]`. It reads outward from the thing a waiter notices first.
   */
  const chips: readonly Chip[] = [
    {
      key: 'link',
      /* No live link without a network — a green "connected" over a dead
         router is the one lie this strip must not tell. */
      label: labels.link,
      up: online,
      tip: online ? labels.linkUp : labels.linkDown,
      down: {
        title: POS_COPY.hzLinkTitle,
        body: POS_COPY.hzLinkBody,
        fix: POS_COPY.hzLinkFix,
      },
    },
    {
      key: 'net',
      label: labels.net,
      up: online,
      tip: online ? labels.netUp : labels.netDown,
      down: {
        title: POS_COPY.hzNetTitle,
        body: POS_COPY.hzNetBody,
        fix: POS_COPY.hzNetFix,
      },
    },
    {
      key: 'printer',
      label: labels.printer,
      /*
       * `GET /api/v1/kitchen/printers/health` — four words, read as two.
       *
       * `ok` and `none` are quiet. `none` is the arguable one: a venue with no
       * printer configured at all is a job for whoever fits the hardware, not
       * for the person standing at the till tonight, and a dot that pulses
       * every evening about something nobody in the room can fix is a dot
       * everybody learns to ignore — including the evening it means a jam.
       *
       * `degraded` is loud, which is the whole point of the chip. One of three
       * printers down is exactly the failure this strip was built for: the bar
       * docket is not coming out, everything else is, and nothing on any other
       * screen says so.
       */
      up: printers === null || printers === 'ok' || printers === 'none',
      tip:
        printers === null || printers === 'ok' || printers === 'none'
          ? labels.printerUp
          : fill(word(POS_COPY.hzPrinterTitle), { name: labels.printer }),
      isPrinter: true,
      down: {
        title: POS_COPY.hzPrinterTitle,
        body: POS_COPY.hzPrinterBody,
        fix: POS_COPY.hzPrinterFix,
      },
    },
    {
      key: 'fiscal',
      label: labels.fiscal,
      up: true,
      tip: word(POS_COPY.hzFiscalUp),
      down: {
        /* The design's own "{name} is not responding" frame — the fiscal module
           is the third thing in the room that can stop answering. */
        title: POS_COPY.hzPrinterTitle,
        body: POS_COPY.hzFiscalBody,
        fix: POS_COPY.hzFiscalFix,
      },
    },
  ];

  const open = chips.find((chip) => chip.key === openKey) ?? null;

  return (
    <>
      <div
        data-hstrip
        className="bg-surface flex h-[38px] flex-none items-center gap-1.5 overflow-x-auto border-t pr-2 pl-4"
      >
        {chips.map((chip) => (
          <button
            key={chip.key}
            type="button"
            title={chip.tip}
            aria-expanded={openKey === chip.key}
            onClick={() => {
              setOpenKey(chip.key);
              onDiagnosing?.(true);
            }}
            className={`rounded-pill text-2xs flex h-[26px] flex-none items-center gap-[7px] px-2.5 font-semibold ${
              chip.up ? 'bg-bg-subtle text-fg-muted' : 'bg-danger-50 text-danger-700'
            }`}
          >
            {/*
             * The dot pulses when the thing is **down**, not when it is up —
             * `dc.html:12552` (`x.up ? "none" : "softPulse … infinite"`). A strip
             * of five dots all breathing says nothing; one breathing says which.
             *
             * `data-live` rather than Tailwind's `animate-pulse`: the design's
             * keyframe is `softPulse` at 1.6s on `--ease-standard`, which is what
             * `motion.css` binds, and it carries the reduced-motion escape with
             * it. `animate-pulse` is a different curve at a different tempo, so
             * this dot used to breathe out of step with every other live dot in
             * the product.
             */}
            <span
              aria-hidden
              data-live={chip.up ? undefined : 'true'}
              className={`size-1.5 flex-none rounded-full ${
                chip.up ? 'bg-success-500' : 'bg-danger-500'
              }`}
            />
            {chip.label}
          </button>
        ))}

        {/*
         * The queue, and only when it holds something. A permanent "0 queued"
         * is a chip nobody reads.
         *
         * This one goes straight to the panel rather than to a diagnosis: it is
         * not a service that can be up or down, it is a count, and the design's
         * answer to a count is `offSee` — show me the queue (`dc.html:9940`).
         */}
        {queued > 0 ? (
          <button
            type="button"
            onClick={onSeeQueue}
            className="bg-warning-50 text-warning-700 rounded-pill text-2xs flex h-[26px] flex-none items-center gap-[7px] px-2.5 font-semibold"
          >
            <span aria-hidden className="bg-warning-500 size-1.5 flex-none rounded-full" />
            {labels.queued.replace('{n}', String(queued))}
          </button>
        ) : null}

        <span className="min-w-3 flex-1" />

        <span
          data-hmeta
          className="text-fg-subtle text-2xs flex flex-none items-center gap-3.5 pr-2 font-mono"
        >
          <span data-num>{terminal ?? '—'}</span>
          <span data-num>v2.4.0</span>
          <span data-num>{clock}</span>
        </span>
      </div>

      {open === null ? null : (
        <HealthPanel
          chip={open}
          word={word}
          onClose={() => {
            setOpenKey(null);
            onDiagnosing?.(false);
          }}
          onSeeQueue={() => {
            setOpenKey(null);
            onDiagnosing?.(false);
            onSeeQueue();
          }}
          onRetryPrinting={() => void requeuePrinting()}
          retrying={requeueing}
        />
      )}
    </>
  );
}

/**
 * What broke, what it means, and what to do — `dc.html:7916`.
 *
 * A card at the bottom of the screen rather than a centred modal, because it is
 * opened from a chip at the bottom of the screen and a dialog that jumps to the
 * middle makes a cashier look for what they just tapped.
 */
function HealthPanel({
  chip,
  word,
  onClose,
  onSeeQueue,
  onRetryPrinting,
  retrying,
}: {
  chip: Chip;
  word: (phrase: Trilingual) => string;
  onClose: () => void;
  onSeeQueue: () => void;
  /** Re-queues this venue's failed dockets. Owned by the strip — see `requeuePrinting`. */
  onRetryPrinting: () => void;
  retrying: boolean;
}) {
  /*
   * A chip that is fine still opens, and says so.
   *
   * The design does this deliberately (`dc.html:12563` reads `sel.up ? … : …`
   * on every line of the panel): somebody tapping a green chip is checking, and
   * "nothing to do" is the answer they came for. A panel that only opened on
   * failure would train them not to tap.
   */
  const title = chip.up
    ? fill(word(POS_COPY.hzUp), { name: chip.label })
    : fill(word(chip.down?.title ?? POS_COPY.hzNetTitle), { name: chip.label });

  const body = chip.up ? chip.tip : word(chip.down?.body ?? POS_COPY.hzNetBody);
  const fix = chip.up ? word(POS_COPY.hzNothing) : word(chip.down?.fix ?? POS_COPY.hzNetFix);

  return (
    <>
      <button
        type="button"
        aria-label={word(POS_COPY.hzClose)}
        onClick={onClose}
        data-fade
        className="fixed inset-0 z-[120] cursor-default bg-[rgba(15,19,32,0.44)]"
      />

      <div
        role="dialog"
        aria-modal
        aria-label={title}
        className="border-border bg-surface fixed bottom-6 left-1/2 z-[121] w-[min(460px,calc(100vw-32px))] -translate-x-1/2 rounded-[20px] border p-6 pt-[22px] pb-5 shadow-xl"
      >
        <div className="flex items-start gap-3">
          <span
            aria-hidden
            className={`mt-[7px] size-[9px] flex-none rounded-full ${
              chip.up ? 'bg-success-500' : 'bg-danger-500'
            }`}
          />

          <div className="min-w-0 flex-1">
            <div className="font-display tracking-snug text-lg font-bold">{title}</div>
            <p className="text-fg-muted mt-[5px] text-sm leading-relaxed">{body}</p>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label={word(POS_COPY.hzClose)}
            title={word(POS_COPY.hzClose)}
            className="border-border bg-surface text-fg-muted grid size-[30px] flex-none place-items-center rounded-[8px] border"
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.1"
              strokeLinecap="round"
              aria-hidden
            >
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="border-divider bg-bg-subtle mt-4 rounded-md border px-[15px] py-[13px]">
          <div className="text-2xs text-fg-subtle tracking-caps font-semibold uppercase">
            {word(POS_COPY.hzWhat)}
          </div>
          <p className="mt-[5px] text-sm leading-relaxed">{fix}</p>
        </div>

        <div className="mt-4 flex gap-[9px]">
          {chip.isPrinter === true ? (
            /*
             * The design's two, in the design's order — `dc.html:12568`.
             *
             * *Qayta urinish* first and in brand, because it is the thing that
             * might fix this without anybody leaving the counter; *Sozlamalarga
             * o'tish* second and quiet, because it is a trip to another screen.
             *
             * The retry could not be drawn until there was a door a cashier
             * could open. Kitchen's own two writes —
             * `POST /kitchen/print-jobs/{job}/retry` (`kitchen.update`) and
             * `POST /kitchen/printers/{printer}/test` (`kitchen.manage`) — ask
             * for permissions this role does not hold, and should not: the
             * person on the counter has no business reconfiguring hardware.
             * `POST /pos/print-queue/requeue` carries `pos.sell` instead and
             * does the one thing that is a cashier's business — put this
             * venue's failed dockets back in the queue.
             *
             * What it says afterwards is the count, never "reconnected". This
             * tablet cannot see the printer; it can only see how many jobs
             * moved, and zero moving means the paper was not the problem. See
             * `requeuePrinting` for the three answers.
             */
            <>
              <button
                type="button"
                onClick={onRetryPrinting}
                disabled={retrying}
                className="bg-brand-500 grid h-[42px] flex-1 place-items-center rounded-md text-sm font-semibold text-white disabled:opacity-45"
              >
                {word(POS_COPY.hzRetry)}
              </button>

              <a
                href="/settings"
                className="border-border-strong bg-surface text-fg grid h-[42px] flex-1 place-items-center rounded-md border text-sm font-semibold"
              >
                {word(POS_COPY.hzOpenSettings)}
              </a>
            </>
          ) : (
            <button
              type="button"
              onClick={onSeeQueue}
              className="bg-brand-500 grid h-[42px] flex-1 place-items-center rounded-md text-sm font-semibold text-white"
            >
              {word(POS_COPY.hzSeeQueue)}
            </button>
          )}
        </div>
      </div>
    </>
  );
}
