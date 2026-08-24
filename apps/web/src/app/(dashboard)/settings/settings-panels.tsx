'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { flash } from '@restaurant/ui';
import { formatTiyinAmount } from '@restaurant/utils';

import { useTheme } from '@/components/providers/theme-provider';
import { apiId, post } from '@/lib/console-post';

import type { SettingsCopy } from './settings-copy';
import type { SettingsScreen } from './settings-server';

/**
 * Settings — the design's eight screens behind one strip.
 *
 * `Smart Restaurant OS.dc.html:5677-6189`. Every panel here is drawn in the
 * file: the idle-screen configurator with its live preview, the printer table,
 * the receipt constructor, payment methods, income and expense categories,
 * zones, the Telegram notification rules and the release log. Under all eight
 * sit three things the file keeps on the page whichever tab is open — the
 * order-state table, the three policy groups, and the appearance row.
 *
 * **Which controls write, and which only move.** Most of them now reach the API
 * through a route handler on this origin — the idle preview, adding a printer
 * and testing one, adding a zone and correcting its seats, six of the ten house
 * rules, offering a tender and switching one off, and adding, archiving or
 * removing a ledger heading. What is left holding local state is drawn because
 * the design draws it and is a statement rather than a lever: a tax RATE, a
 * kitchen behaviour nothing implements yet, and three discount ceilings whose
 * single source is the terminal. Each is argued where it is drawn — see
 * `POLICY_PATHS` — and each still moves and still says what it did, which is
 * honest about being a statement in a way a dead switch is not.
 *
 * **Nothing here talks to Laravel directly.** The session token is an httpOnly
 * cookie a client component cannot read, so every write posts to
 * `src/app/api/**` and Node forwards the reader's own token — which is also
 * what makes the API decide on their permissions and the audit row name them.
 */

/* ------------------------------------------------------------------ pieces */

const CARD = 'bg-surface rounded-lg border';
const SECTION_HEAD = 'text-md tracking-snug font-semibold';

/** The design's 38×22 switch — the one used inside the eight panels. */
function Switch({ on, label, onClick }: { on: boolean; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={onClick}
      className={`rounded-pill flex h-[22px] w-[38px] flex-none items-center p-0.5 transition-colors ${
        on ? 'bg-brand-500 justify-end' : 'bg-n-300 justify-start'
      }`}
    >
      <span className="size-[18px] rounded-full bg-white shadow-xs" />
    </button>
  );
}

/** The larger 44×26 switch the policy groups use. */
function BigSwitch({ on, label, onClick }: { on: boolean; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={onClick}
      className={`rounded-pill flex h-[26px] w-11 flex-none items-center p-[3px] transition-colors ${
        on ? 'bg-brand-500 justify-end' : 'bg-border-strong justify-start'
      }`}
    >
      <span className="size-5 rounded-full bg-white shadow-sm" />
    </button>
  );
}

/** A −/+ pair around a figure, as the design draws its steppers. */
function Stepper({
  value,
  onLess,
  onMore,
  lessLabel,
  moreLabel,
  width = 'w-[58px]',
}: {
  value: string;
  onLess: () => void;
  onMore: () => void;
  lessLabel: string;
  moreLabel: string;
  width?: string;
}) {
  const button =
    'border-border-strong bg-surface text-fg grid size-8 place-items-center rounded-[9px] border text-base font-semibold';

  return (
    <span className="flex flex-none items-center gap-2">
      <button type="button" aria-label={lessLabel} onClick={onLess} className={button}>
        −
      </button>
      <span data-num className={`font-display text-md text-center font-bold ${width}`}>
        {value}
      </span>
      <button type="button" aria-label={moreLabel} onClick={onMore} className={button}>
        +
      </button>
    </span>
  );
}

const TONE_PILL: Record<'neutral' | 'brand' | 'warning' | 'success' | 'danger', string> = {
  neutral: 'bg-n-300',
  brand: 'bg-brand-500',
  warning: 'bg-warning-500',
  success: 'bg-success-500',
  danger: 'bg-danger-500',
};

/* -------------------------------------------------------------------- main */

type TabKey = keyof SettingsCopy['tabs'];

/** The design's own order, and its own default: printers, not the first tab. */
const TAB_ORDER: readonly TabKey[] = [
  'terminal',
  'printers',
  'receipt',
  'pays',
  'cats',
  'zones',
  'notify',
  'releases',
];

export function SettingsPanels({ copy }: { copy: SettingsScreen }) {
  const [tab, setTab] = useState<TabKey>('printers');

  return (
    <>
      <div
        data-scroll
        role="tablist"
        aria-label={copy.subtitle}
        className="bg-bg-muted mb-[22px] flex gap-[3px] overflow-x-auto rounded-md p-[3px]"
      >
        {TAB_ORDER.map((key) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={tab === key}
            onClick={() => setTab(key)}
            className={`h-[34px] flex-none rounded-[8px] px-[15px] text-sm font-semibold whitespace-nowrap ${
              tab === key ? 'bg-surface text-fg shadow-xs' : 'text-fg-muted'
            }`}
          >
            {copy.tabs[key]}
          </button>
        ))}
      </div>

      <div data-panel-in key={tab}>
        {tab === 'terminal' ? <TerminalPanel copy={copy} /> : null}
        {tab === 'printers' ? <PrintersPanel copy={copy} /> : null}
        {tab === 'receipt' ? <ReceiptPanel copy={copy} /> : null}
        {tab === 'pays' ? <PaysPanel copy={copy} /> : null}
        {tab === 'cats' ? <CatsPanel copy={copy} /> : null}
        {/*
         * Keyed on the zones themselves, so a `router.refresh()` after a write
         * actually shows the result. The panel holds its rows in local state —
         * a stepper has to move under the finger, not after a round trip — and
         * `useState` ignores a new initial value on re-render, so without this
         * a zone that was just opened would stay invisible until a reload.
         */}
        {tab === 'zones' ? (
          <ZonesPanel key={copy.zones.rows.map((zone) => zone.id).join('·')} copy={copy} />
        ) : null}
        {tab === 'notify' ? <NotifyPanel copy={copy} /> : null}
        {tab === 'releases' ? <ReleasesPanel copy={copy} /> : null}
      </div>

      <StatesTable copy={copy} />
      <PolicyGroups copy={copy} />
      <AppearanceRow copy={copy} />
    </>
  );
}

/* ---------------------------------------------------------------- terminal */

type BlockKey = 'clock' | 'brand' | 'stats' | 'health' | 'msg';

/**
 * Which blocks a mode forces off.
 *
 * The design's `forced` table. It is not styling: the calm screen exists so
 * that nothing moves, and the brand screen exists so that a guest standing at
 * the host desk does not read the day's turnover off the wall.
 */
const FORCED: Record<string, Partial<Record<BlockKey, boolean>>> = {
  minimal: { stats: false, health: false, msg: false },
  brand: { stats: false },
  status: {},
};

function TerminalPanel({ copy }: { copy: SettingsScreen }) {
  const t = copy.terminal;
  const till = copy.till;
  const shell = useTranslations('console.shell');
  const blank = useTranslations('console.empty');

  const [mode, setMode] = useState<'minimal' | 'status' | 'brand'>('status');
  const [background, setBackground] = useState('night');
  const [blocks, setBlocks] = useState<Record<BlockKey, boolean>>({
    clock: true,
    brand: true,
    stats: true,
    health: true,
    msg: false,
  });
  const [lock, setLock] = useState(5);
  const [security, setSecurity] = useState({ pinSet: true, pinShift: false });
  const [headline, setHeadline] = useState('');
  const [subline, setSubline] = useState('');

  const forced = FORCED[mode] ?? {};
  const shown = (key: BlockKey) => (forced[key] === undefined ? blocks[key] : forced[key]);

  const swatch = t.backgrounds.find((entry) => entry.key === background) ?? t.backgrounds[0];
  const big = mode === 'minimal';
  const modeNote = t.modes.find((entry) => entry.key === mode)?.modeNote ?? '';

  const scrim =
    background === 'photo'
      ? 'linear-gradient(180deg,rgba(11,14,22,.55) 0%,rgba(11,14,22,.78) 100%)'
      : 'radial-gradient(120% 90% at 50% 0%,rgba(46,116,234,.18) 0%,transparent 62%)';

  return (
    <>
      <div className="mb-1.5 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h3 className="font-display tracking-snug text-xl font-bold">{t.title}</h3>
          <p className="text-fg-muted mt-[5px] max-w-[640px] text-sm leading-normal">{t.sub}</p>
        </div>

        {/*
         * The draft, on the counter.
         *
         * `POST /api/v1/pos/terminals/{id}/preview` through the proxy at
         * `/api/pos/terminals/preview`; it broadcasts on `terminal.{id}`, which
         * the till already listens on, and stores nothing.
         *
         * The id is the missing half that used to make this a `TODO`, and it is
         * now `GET /api/v1/pos/terminals` — see `settings-server.ts`, which
         * prefers an online till because a preview pushed at a dark screen goes
         * nowhere. With no terminal at all the button is disabled rather than
         * hopeful: a guessed id is a message on a screen in somebody else's
         * dining room.
         */}
        <button
          type="button"
          disabled={till === null}
          title={till === null ? blank('genericSub') : till.name}
          onClick={() => {
            if (till === null) return;

            void (async () => {
              const answer = await post('/api/pos/terminals/preview', {
                terminal: till.id,
                mode,
                background,
                blocks,
                headline,
                subline,
              });

              if (!answer.ok) {
                flash.problem(answer.message ?? shell('offline'));
                return;
              }

              flash(`${till.name} · ${t.previewFlash}`);
            })();
          }}
          className="border-border-strong bg-surface text-fg flex h-[38px] flex-none items-center gap-2 rounded-md border px-4 text-sm font-semibold disabled:opacity-55"
        >
          <svg
            width="15"
            height="15"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
          >
            <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7z" />
            <circle cx="12" cy="12" r="3" />
          </svg>
          {t.preview}
        </button>
      </div>

      <div
        data-split
        className="mt-5 grid [grid-template-columns:minmax(0,1.15fr)_minmax(0,1fr)] items-start gap-5"
      >
        {/* ------------------------------------------------- the live screen */}
        <div className={`${CARD} px-[22px] pt-5 pb-[22px]`}>
          <div className="text-2xs tracking-caps text-fg-subtle mb-3 font-semibold uppercase">
            {t.livePreview}
          </div>

          <div
            className="relative flex aspect-video flex-col overflow-hidden rounded-lg border text-white"
            style={{ background: swatch.swatch }}
          >
            <div className="pointer-events-none absolute inset-0" style={{ background: scrim }} />

            <div className="relative flex flex-none items-start justify-between px-4 py-3.5">
              {shown('clock') ? (
                <div>
                  <div
                    data-num
                    className="font-display leading-none font-bold tracking-[-.03em]"
                    style={{ fontSize: big ? '34px' : '22px' }}
                  >
                    18:22
                  </div>
                  <div className="mt-[3px] text-[9px] text-white/60">{t.date}</div>
                </div>
              ) : (
                <span />
              )}
              <span className="size-5 flex-none rounded-[6px] border border-white/20 bg-white/[.07]" />
            </div>

            <div
              className="relative flex min-h-0 flex-1 flex-col items-center justify-center px-[18px] text-center"
              style={{ gap: big ? '18px' : '12px' }}
            >
              {shown('brand') ? (
                <div className="flex flex-col items-center gap-[7px]">
                  <span
                    className="bg-brand-500 font-display flex items-center justify-center rounded-xl font-extrabold tracking-[-.02em] text-white"
                    style={{
                      width: big ? '40px' : '30px',
                      height: big ? '40px' : '30px',
                      fontSize: big ? '15px' : '12px',
                    }}
                  >
                    SR
                  </span>
                  <div>
                    <div
                      className="font-display leading-[1.15] font-bold tracking-tight"
                      style={{ fontSize: big ? '16px' : '13px' }}
                    >
                      Smart Restaurant
                    </div>
                    <div className="mt-[2px] text-[9px] text-white/60">{t.branch}</div>
                  </div>
                </div>
              ) : null}

              {shown('msg') ? (
                <div className="max-w-[78%]">
                  <div className="font-display text-[15px] leading-[1.2] font-bold tracking-tight">
                    {headline || t.msgTitle}
                  </div>
                  <div className="mt-1 text-[10px] leading-[1.4] text-white/70">
                    {subline || t.msgBody}
                  </div>
                </div>
              ) : null}

              <span className="text-n-900 rounded-pill flex h-[26px] items-center bg-white px-[22px] text-[10px] font-semibold">
                {t.signIn}
              </span>

              {shown('stats') ? (
                <div className="flex gap-px overflow-hidden rounded-[8px] border border-white/10 bg-white/[.14]">
                  {t.stats.map((stat) => (
                    <div
                      key={stat.label}
                      className="min-w-[56px] bg-white/[.05] px-3 py-1.5 text-center"
                    >
                      <div
                        data-num
                        className="font-display text-[11px] font-bold"
                        style={{ color: stat.good ? '#5CD69A' : '#fff' }}
                      >
                        {stat.value}
                      </div>
                      <div className="mt-px text-[7px] font-semibold tracking-[.06em] text-white/50 uppercase">
                        {stat.label}
                      </div>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>

            {shown('health') ? (
              <div className="relative flex flex-none items-center justify-between gap-2.5 border-t border-white/10 px-4 py-2">
                <div className="flex items-center gap-2.5">
                  {/*
                   * The till's own status row, drawn from the same printer list
                   * the table above uses. It was four hardcoded names, two of
                   * them green — which is a picture of somebody else's kitchen,
                   * on the panel whose job is to show what THIS counter will
                   * display.
                   */}
                  {[
                    { label: 'Aloqa', up: true },
                    { label: 'Internet', up: true },
                    ...copy.printers.rows.slice(0, 2).map((printer) => ({
                      label: printer.name,
                      up: printer.up,
                    })),
                  ].map((dot) => (
                    <span
                      key={dot.label}
                      className="flex items-center gap-1 font-mono text-[7px] font-semibold text-white/60"
                    >
                      <span
                        className="rounded-pill size-[5px]"
                        style={{ background: dot.up ? '#12B76A' : '#F04438' }}
                      />
                      {dot.label}
                    </span>
                  ))}
                </div>
                <span className="font-mono text-[7px] text-white/40">
                  {till === null ? 'POS-3 · Chilonzor' : `${till.name} · ${t.branch}`}
                </span>
              </div>
            ) : null}
          </div>

          <div className="text-2xs text-fg-subtle mt-3 leading-normal">{modeNote}</div>
        </div>

        {/* ------------------------------------------------------ the controls */}
        <div className="grid gap-4">
          <div className={`${CARD} px-5 py-[18px]`}>
            <div className="mb-1 text-sm font-semibold">{t.mode}</div>
            <div className="text-2xs text-fg-subtle mb-3 leading-normal">{t.modeSub}</div>

            <div className="grid gap-2">
              {t.modes.map((entry) => (
                <button
                  key={entry.key}
                  type="button"
                  aria-pressed={mode === entry.key}
                  onClick={() => setMode(entry.key)}
                  className={`flex w-full items-start gap-[11px] rounded-md border p-3 text-left ${
                    mode === entry.key ? 'border-brand-500 bg-brand-50' : 'border-border bg-surface'
                  }`}
                >
                  <span
                    aria-hidden
                    className={`mt-px grid size-[18px] flex-none place-items-center rounded-full border-[1.5px] text-[10px] font-bold text-white ${
                      mode === entry.key ? 'border-brand-500 bg-brand-500' : 'border-border-strong'
                    }`}
                  >
                    {mode === entry.key ? '✓' : ''}
                  </span>
                  <span className="min-w-0">
                    <span className="text-fg block text-sm font-semibold">{entry.label}</span>
                    <span className="text-2xs text-fg-muted mt-[2px] block leading-[1.45]">
                      {entry.note}
                    </span>
                  </span>
                </button>
              ))}
            </div>
          </div>

          <div className={`${CARD} px-5 py-[18px]`}>
            <div className="mb-3 text-sm font-semibold">{t.background}</div>

            <div className="grid grid-cols-4 gap-[9px]">
              {t.backgrounds.map((entry) => (
                <button
                  key={entry.key}
                  type="button"
                  title={entry.label}
                  aria-label={entry.label}
                  aria-pressed={background === entry.key}
                  onClick={() => setBackground(entry.key)}
                  className={`relative h-[52px] overflow-hidden rounded-md border-2 ${
                    background === entry.key ? 'border-brand-500' : 'border-border'
                  }`}
                  style={{ background: entry.swatch }}
                >
                  <span className="absolute bottom-[5px] left-1.5 text-[8px] font-semibold tracking-[.02em] text-white/80">
                    {entry.label}
                  </span>
                </button>
              ))}
            </div>

            {background === 'photo' ? (
              <div className="border-border-strong bg-bg-subtle mt-3 rounded-md border border-dashed p-3.5 text-center">
                <div className="text-fg-muted text-xs font-semibold">{t.photo}</div>
                <div className="text-2xs text-fg-subtle mt-[3px] leading-normal">{t.photoNote}</div>
              </div>
            ) : null}
          </div>

          <div className={`${CARD} px-5 py-[18px]`}>
            <div className="mb-3 text-sm font-semibold">{t.blocks}</div>

            <div className="grid gap-0.5">
              {t.blockRows.map((row) => {
                const lockedOff = forced[row.key] === false;

                return (
                  <div
                    key={row.key}
                    className="border-divider flex items-center justify-between gap-3 border-b py-2.5"
                  >
                    <span className="min-w-0">
                      <span className="text-fg block text-sm font-medium">{row.label}</span>
                      <span className="text-2xs text-fg-subtle mt-px block">
                        {lockedOff ? t.lockedOff : row.note}
                      </span>
                    </span>
                    <Switch
                      on={Boolean(shown(row.key))}
                      label={row.label}
                      onClick={() =>
                        lockedOff
                          ? flash.problem(t.lockedFlash)
                          : setBlocks({ ...blocks, [row.key]: !blocks[row.key] })
                      }
                    />
                  </div>
                );
              })}
            </div>

            {shown('msg') ? (
              <div className="mt-3.5 grid gap-[9px]">
                <input
                  value={headline}
                  onChange={(event) => setHeadline(event.target.value)}
                  placeholder={t.msgTitleField}
                  aria-label={t.msgTitleField}
                  className="border-border-strong bg-surface text-fg h-10 w-full rounded-md border px-3 text-sm font-semibold"
                />
                <input
                  value={subline}
                  onChange={(event) => setSubline(event.target.value)}
                  placeholder={t.msgBodyField}
                  aria-label={t.msgBodyField}
                  className="border-border-strong bg-surface text-fg h-10 w-full rounded-md border px-3 text-sm"
                />
              </div>
            ) : null}
          </div>

          <div className={`${CARD} px-5 py-[18px]`}>
            <div className="mb-1 text-sm font-semibold">{t.security}</div>
            <div className="text-2xs text-fg-subtle mb-3.5 leading-normal">{t.securitySub}</div>

            <div className="border-divider flex items-center justify-between gap-3 border-b pb-3">
              <span className="text-sm font-medium">{t.lock}</span>
              <Stepper
                value={`${lock} ${t.minutes}`}
                lessLabel={`${t.lock} −`}
                moreLabel={`${t.lock} +`}
                onLess={() => setLock(Math.max(1, lock - 1))}
                onMore={() => setLock(Math.min(30, lock + 1))}
              />
            </div>

            <div className="mt-1 grid gap-0.5">
              {t.secRows.map((row) => (
                <div key={row.key} className="flex items-center justify-between gap-3 py-2.5">
                  <span className="min-w-0">
                    <span className="text-fg block text-sm font-medium">{row.label}</span>
                    <span className="text-2xs text-fg-subtle mt-px block leading-[1.45]">
                      {row.note}
                    </span>
                  </span>
                  <Switch
                    on={security[row.key]}
                    label={row.label}
                    onClick={() => setSecurity({ ...security, [row.key]: !security[row.key] })}
                  />
                </div>
              ))}
            </div>
          </div>

          <div className={`${CARD} px-5 py-[18px]`}>
            <div className="mb-3 text-sm font-semibold">{t.identity}</div>

            <div className="grid gap-[11px]">
              {t.identityRows.map((row) => (
                <div key={row.key} className="flex items-baseline justify-between gap-3.5">
                  <span className="text-fg-muted text-sm">{row.key}</span>
                  <span
                    data-num
                    className={`text-right text-sm font-semibold ${row.mono ? 'font-mono' : ''}`}
                  >
                    {row.value}
                  </span>
                </div>
              ))}
            </div>

            <div className="text-2xs text-fg-subtle border-divider mt-[13px] border-t pt-3 leading-normal">
              {t.identityNote}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

/* ---------------------------------------------------------------- printers */

const PRINTER_COLUMNS = '[grid-template-columns:minmax(0,1.3fr)_140px_minmax(0,1fr)_96px_150px]';

function PrintersPanel({ copy }: { copy: SettingsCopy }) {
  const t = copy.printers;
  const shell = useTranslations('console.shell');
  const router = useRouter();

  /* Last-print times move when a test succeeds — the one thing on this table
     that tells a reader the button did something on the device, not the page. */
  const [last, setLast] = useState<Record<string, string>>({});

  /* The add form, closed until asked for. The design draws a button and no
     drawer, and three fields inline under the head is the smallest thing that
     can carry what `POST /kitchen/printers` actually needs. */
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState({ name: '', target: '', kind: 'kitchen' });
  const [saving, setSaving] = useState(false);

  /**
   * Which row the same three fields are editing, or null for a new printer.
   *
   * The pencil used to flash "Printerni tahrirlash" and open nothing, so a
   * restaurant setting up its first printers could not change an IP or a
   * station from the console at all — while the test button next to it worked,
   * which made the dead one read as working. One form for both paths, because
   * the API takes the same three fields either way and a second sheet is a
   * second thing to keep in step.
   */
  const [editing, setEditing] = useState<string | null>(null);

  const now = new Date();
  const clock = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

  /**
   * Register the printer.
   *
   * `router.refresh()` rather than a local row: the table draws a state and a
   * queue depth that only the server knows — a new printer is `offline` until
   * its agent checks in — and an optimistic green row would be the one thing on
   * this screen claiming a device is reachable when nobody has heard from it.
   */
  const add = async (): Promise<void> => {
    const name = draft.name.trim();

    // Silent: the empty field is right there and a toast naming it would be the
    // console repeating what the reader can see.
    if (name.length < 2) return;

    setSaving(true);

    const answer =
      editing === null
        ? await post('/api/kitchen/printers', {
            name,
            target: draft.target.trim(),
            kind: draft.kind,
          })
        : await post('/api/settings/printer-update', {
            id: editing,
            name,
            target: draft.target.trim(),
            kind: draft.kind,
          });

    setSaving(false);

    if (!answer.ok) {
      flash.problem(answer.message ?? shell('offline'));
      return;
    }

    setDraft({ name: '', target: '', kind: 'kitchen' });
    setAdding(false);
    setEditing(null);
    flash(`${name} · ${editing === null ? t.addFlash : t.editFlash}`);
    router.refresh();
  };

  return (
    <section className={`${CARD} mb-5 overflow-hidden`} data-table>
      <div className="border-divider flex items-end justify-between gap-5 border-b px-6 pt-[18px] pb-4">
        <div className="min-w-0">
          <h3 className={SECTION_HEAD}>{t.title}</h3>
          <p className="text-fg-subtle mt-[5px] text-xs leading-normal">{t.sub}</p>
        </div>
        {/*
         * `POST /api/v1/kitchen/printers` through `/api/kitchen/printers`. The
         * model, the migration and the spooler have existed since P8; the
         * console form was the missing half, and the handler is where the
         * design's three fields become the API's eight.
         */}
        <button
          type="button"
          disabled={saving}
          onClick={() => (adding ? void add() : setAdding(true))}
          className="bg-brand-500 hover:bg-brand-600 h-9 flex-none rounded-md px-3.5 text-sm font-semibold text-white disabled:opacity-55"
        >
          {t.add}
        </button>
      </div>

      {adding ? (
        <div className="border-divider bg-bg-subtle grid gap-2.5 border-b px-6 py-4 sm:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_150px]">
          <input
            autoFocus
            value={draft.name}
            onChange={(event) => setDraft({ ...draft, name: event.target.value })}
            placeholder={t.colName}
            aria-label={t.colName}
            className="border-border-strong bg-surface text-fg h-10 rounded-md border px-3 text-sm font-semibold"
          />
          <input
            value={draft.target}
            onChange={(event) => setDraft({ ...draft, target: event.target.value })}
            placeholder={t.colIp}
            aria-label={t.colIp}
            className="border-border-strong bg-surface text-fg h-10 rounded-md border px-3 font-mono text-sm"
          />
          <select
            value={draft.kind}
            onChange={(event) => setDraft({ ...draft, kind: event.target.value })}
            aria-label={t.colKind}
            className="border-border-strong bg-surface text-fg h-10 rounded-md border px-3 text-sm"
          >
            {(['kitchen', 'bar', 'till', 'pass'] as const).map((kind) => (
              <option key={kind} value={kind}>
                {t.kinds[kind]}
              </option>
            ))}
          </select>
        </div>
      ) : null}

      <div
        className={`bg-bg-subtle text-fg-subtle grid ${PRINTER_COLUMNS} gap-3.5 border-b px-6 py-[11px] text-xs font-semibold tracking-wide`}
      >
        <span>{t.colName}</span>
        <span>{t.colIp}</span>
        <span>{t.colKind}</span>
        <span>{t.colState}</span>
        <span className="text-right">{t.colLast}</span>
      </div>

      {t.rows.map((row) => (
        <div
          key={row.id}
          data-row
          className={`border-divider grid ${PRINTER_COLUMNS} items-center gap-3.5 border-b px-6 py-3`}
        >
          <span className="flex min-w-0 items-center gap-2.5">
            <span
              className={`rounded-pill size-[7px] flex-none ${row.up ? 'bg-success-500' : 'bg-danger-500'}`}
            />
            <span className="min-w-0">
              <span className="block truncate text-sm font-semibold">{row.name}</span>
              <span className="text-2xs text-fg-subtle mt-0.5 block">
                {row.dishes === 0 ? t.noDishes : `${row.dishes} ${t.dishes}`}
              </span>
            </span>
          </span>

          <span data-num className="text-fg-muted font-mono text-xs">
            {row.ip}
          </span>

          <span className="text-fg-muted min-w-0 truncate text-sm">{t.kinds[row.kind]}</span>

          <span
            className={`rounded-pill justify-self-start px-[9px] py-1 text-[11px] font-semibold whitespace-nowrap ${
              row.up ? 'bg-success-50 text-success-700' : 'bg-danger-50 text-danger-700'
            }`}
          >
            {row.up ? t.up : t.down}
          </span>

          <span className="flex items-center justify-end gap-1.5">
            <span data-num className="text-2xs text-fg-subtle whitespace-nowrap">
              {row.up ? (last[row.id] ?? row.last) : '—'}
            </span>

            {/*
             * A test docket, queued.
             *
             * `POST /api/v1/kitchen/printers/{id}/test` through the proxy at
             * `/api/settings/printer-test` — the session token is an httpOnly
             * cookie this component cannot read.
             *
             * What lands is a queued job, not paper: the print agent that
             * claims jobs and pushes bytes at a socket does not exist yet, so
             * the row sits `pending`. The toast says the job went to the
             * queue rather than that something printed.
             */}
            <button
              type="button"
              title={t.test}
              aria-label={`${t.test} · ${row.name}`}
              onClick={() => {
                // A fixture row has no id the API would recognise, so the
                // request could only ever be refused — and a refusal here reads
                // as "the printer is broken" rather than "this is the demo
                // console". `apiId` is the difference.
                if (!row.up || apiId(row.id) === null) {
                  flash.problem(`${row.name} · ${t.testFail}`);
                  return;
                }

                void (async () => {
                  const answer = await post('/api/settings/printer-test', { id: row.id });

                  if (!answer.ok) {
                    flash.problem(`${row.name} · ${t.testFail}`);
                    return;
                  }

                  setLast({ ...last, [row.id]: clock });
                  flash(`${row.name} · ${t.testOk}`);
                })();
              }}
              className="border-border bg-surface text-fg-muted hover:bg-bg-subtle hover:text-fg grid size-[30px] flex-none place-items-center rounded-[8px] border"
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.9"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M7 8V4h10v4" />
                <path d="M5 8h14a2 2 0 0 1 2 2v5h-4" />
                <path d="M7 15H3v-5a2 2 0 0 1 2-2" />
                <path d="M7 13h10v7H7z" />
              </svg>
            </button>

            {/*
             * The same inline form, prefilled — `PATCH /kitchen/printers/{id}`
             * through `/api/kitchen/printers`. A fixture row has no id the API
             * would recognise, so its pencil stays a toast rather than a
             * refusal that reads as "the printer is broken".
             */}
            <button
              type="button"
              title={t.edit}
              aria-label={`${t.edit} · ${row.name}`}
              onClick={() => {
                if (apiId(row.id) === null) {
                  flash(`${t.editFlash} · ${row.name}`);
                  return;
                }

                setDraft({ name: row.name, target: row.ip, kind: row.kind });
                setEditing(row.id);
                setAdding(true);
              }}
              className="border-border bg-surface text-fg-muted hover:bg-bg-subtle hover:text-fg grid size-[30px] flex-none place-items-center rounded-[8px] border"
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.9"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M11 4h-5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-5" />
                <path d="M18.5 2.5a2.1 2.1 0 0 1 3 3L12 15l-4 1 1-4z" />
              </svg>
            </button>
          </span>
        </div>
      ))}

      <div className="text-fg-muted px-6 py-[15px] text-xs leading-relaxed">{t.note}</div>
    </section>
  );
}

/* ----------------------------------------------------------------- receipt */

function ReceiptPanel({ copy }: { copy: SettingsCopy }) {
  const t = copy.receipt;

  /*
   * Which printer a test receipt comes out of.
   *
   * The till one, and there is no second candidate: a receipt is 80 mm paper
   * with a drawer kick behind it, and sending this to the kitchen head would
   * print a guest's bill where the dockets come out. `till` is the design's
   * word for `Printer::ROLES`' `receipt` — see `settings-server.ts`.
   */
  const till = copy.printers.rows.find((row) => row.kind === 'till') ?? null;

  const [on, setOn] = useState<Record<string, boolean>>(
    Object.fromEntries(t.toggles.map((entry) => [entry.key, true])),
  );
  const [thanks, setThanks] = useState(t.thanks);
  const [phones, setPhones] = useState(t.phones);

  const meta: readonly { key: string; value: string }[] = [
    { key: t.metaReceipt, value: t.metaReceiptValue },
    { key: t.metaDate, value: t.metaDateValue },
    { key: t.metaTable, value: t.metaTableValue },
    ...(on.guests ? [{ key: t.metaGuests, value: t.metaGuestsValue }] : []),
    ...(on.orders ? [{ key: t.metaOrders, value: t.metaOrdersValue }] : []),
    ...(on.waiter ? [{ key: t.metaWaiter, value: t.metaWaiterValue }] : []),
  ];

  const totalLabel: Record<string, string> = {
    items: t.totalItems,
    svc: t.totalService,
    total: t.totalTotal,
    vat: t.totalVat,
  };

  const totals = t.totals.filter((row) => (row.key === 'svc' ? on.svc : true));

  return (
    <div data-split className="grid [grid-template-columns:minmax(0,1fr)_300px] items-start gap-5">
      <section className={`${CARD} overflow-hidden`}>
        <div className="border-divider flex items-end justify-between gap-5 border-b px-6 pt-[18px] pb-4">
          <div className="min-w-0">
            <h3 className={SECTION_HEAD}>{t.title}</h3>
            <p className="text-fg-subtle mt-[5px] text-xs leading-normal">{t.sub}</p>
          </div>
          {/*
           * A proof sheet, out of the till printer.
           *
           * `POST /api/v1/kitchen/printers/{id}/test` through the existing
           * proxy at `/api/settings/printer-test` — the same call the printer
           * table's per-row button makes, because there is no second kind of
           * test: the page the API prints is deliberately full of `oʻ`, `gʻ`
           * and Cyrillic, which is what proves the codepage before a guest's
           * receipt does.
           *
           * What lands is a queued job rather than paper. The print agent that
           * claims jobs and pushes bytes at a socket does not exist yet, so the
           * toast says the job went to the queue.
           */}
          <button
            type="button"
            disabled={till === null || !till.up}
            title={till === null ? copy.printers.kinds.till : till.name}
            onClick={() => {
              // A fixture row carries no id the API would know, so the request
              // could only be refused — and that refusal reads as a broken
              // printer rather than as the demo console.
              if (till === null || apiId(till.id) === null) {
                flash.problem(`${till?.name ?? ''} ${copy.printers.testFail}`.trim());
                return;
              }

              void (async () => {
                const answer = await post('/api/settings/printer-test', { id: till.id });

                if (answer.ok) {
                  flash(`${till.name} · ${copy.printers.testOk}`);
                  return;
                }

                flash.problem(`${till.name} · ${copy.printers.testFail}`);
              })();
            }}
            className="bg-brand-500 hover:bg-brand-600 h-9 flex-none rounded-md px-3.5 text-sm font-semibold text-white disabled:opacity-55"
          >
            {t.test}
          </button>
        </div>

        {/* The 80 mm slip, drawn at the design's own 300px and always in ink on
            paper — a receipt preview that follows the app's dark theme would be
            a preview of something no printer can produce. */}
        <div className="bg-bg-subtle flex justify-center p-6">
          <div className="w-[300px] bg-white px-[18px] py-5 font-mono text-[11px] leading-[1.65] text-[#0F1320] shadow-md">
            {on.logo ? (
              <div className="mb-[9px] text-center">
                <span className="font-display inline-flex size-[34px] items-center justify-center rounded-[9px] bg-[#0F1320] text-[13px] font-extrabold text-white">
                  SR
                </span>
              </div>
            ) : null}

            <div className="font-display text-center text-[14px] font-bold tracking-[.02em]">
              {t.brand}
            </div>

            {on.info ? (
              <div className="mt-1 text-center text-[10px] leading-normal">
                {t.branch}
                <br />
                {t.address}
              </div>
            ) : null}

            {on.stir ? <div className="mt-0.5 text-center text-[10px]">{t.taxId}</div> : null}

            <div className="my-[9px] border-t border-dashed border-[#9AA3B4]" />

            {meta.map((row) => (
              <div key={row.key} className="flex justify-between gap-2.5">
                <span className="text-[#4C5568]">{row.key}</span>
                <span>{row.value}</span>
              </div>
            ))}

            <div className="my-[9px] border-t border-dashed border-[#9AA3B4]" />

            {t.lines.map((line) => (
              <div key={line.name} className="mb-[3px] flex justify-between gap-2.5">
                <span className="min-w-0">{line.name}</span>
                <span className="flex-none">{line.value}</span>
              </div>
            ))}

            <div className="my-[9px] border-t border-dashed border-[#9AA3B4]" />

            {totals.map((row) => (
              <div
                key={row.key}
                className="mt-0.5 flex justify-between gap-2.5"
                style={{
                  fontWeight: row.key === 'total' ? 700 : 400,
                  fontSize: row.key === 'total' ? '13px' : row.key === 'vat' ? '10px' : '11px',
                }}
              >
                <span>{totalLabel[row.key]}</span>
                <span>{row.value}</span>
              </div>
            ))}

            {on.qr ? (
              <div className="mt-3 text-center">
                <span
                  className="inline-block size-16"
                  style={{
                    background: 'repeating-conic-gradient(#0F1320 0% 25%,#fff 0% 50%) 50%/9px 9px',
                  }}
                />
              </div>
            ) : null}

            {on.thanks ? (
              <div className="mt-2.5 text-center text-[10px] leading-normal">{thanks}</div>
            ) : null}

            {on.phone ? <div className="mt-1 text-center text-[10px]">{phones}</div> : null}
          </div>
        </div>
      </section>

      <section className={`${CARD} overflow-hidden`}>
        <div className="border-divider border-b px-[18px] pt-4 pb-[13px]">
          <h3 className="text-sm font-semibold">{t.elements}</h3>
          <p className="text-2xs text-fg-subtle mt-1 leading-normal">{t.elementsSub}</p>
        </div>

        {t.toggles.map((row) => (
          <div
            key={row.key}
            className="border-divider flex items-center gap-3 border-b px-[18px] py-[11px]"
          >
            <span className="min-w-0 flex-1">
              <span
                className={`block text-sm font-medium ${on[row.key] ? 'text-fg' : 'text-fg-subtle'}`}
              >
                {row.label}
              </span>
              <span className="text-2xs text-fg-subtle mt-px block">{row.note}</span>
            </span>
            <Switch
              on={Boolean(on[row.key])}
              label={row.label}
              onClick={() => setOn({ ...on, [row.key]: !on[row.key] })}
            />
          </div>
        ))}

        <div className="px-[18px] py-3.5">
          <label className="mb-1.5 block text-xs font-semibold" htmlFor="rc-thanks">
            {t.thanksField}
          </label>
          <input
            id="rc-thanks"
            value={thanks}
            onChange={(event) => setThanks(event.target.value)}
            className="border-border-strong bg-surface text-fg h-[38px] w-full rounded-md border px-[11px] text-sm"
          />

          <label className="mt-3 mb-1.5 block text-xs font-semibold" htmlFor="rc-phones">
            {t.phonesField}
          </label>
          <input
            id="rc-phones"
            value={phones}
            onChange={(event) => setPhones(event.target.value)}
            className="border-border-strong bg-surface text-fg h-[38px] w-full rounded-md border px-[11px] font-mono text-xs"
          />

          <p className="text-2xs text-fg-subtle mt-[11px] leading-normal">{t.note}</p>
        </div>
      </section>
    </div>
  );
}

/* ------------------------------------------------------- payment methods */

/**
 * The tenders a restaurant may choose to offer.
 *
 * `Payment::METHODS` minus `card`, which is the pre-P7 generic: a till still
 * sending it has not said which scheme was used, its acquirer rate is
 * deliberately zero, and a restaurant configuring a payment method today would
 * never pick it. It stays valid upstream for the tills that already send it.
 *
 * Duplicated from the server rather than fetched, because a `<select>` cannot
 * wait for a round trip — and the failure mode if it drifts is the mild one: a
 * tender the console does not list simply cannot be added from this screen.
 */
const TENDERS: readonly string[] = [
  'cash',
  'uzcard',
  'humo',
  'visa',
  'mastercard',
  'payme',
  'click',
  'uzum',
  'corporate',
  'credit',
];

const PAY_COLUMNS = '[grid-template-columns:minmax(0,1.2fr)_130px_110px_92px_88px]';

function PaysPanel({ copy }: { copy: SettingsCopy }) {
  const t = copy.pays;
  const router = useRouter();
  const shell = useTranslations('console.shell');

  const [off, setOff] = useState<readonly string[]>(
    t.rows.filter((row) => !row.on).map((row) => row.id),
  );

  /*
   * The add form, closed until asked for — the same shape the printer panel
   * uses, and the design draws a button and no drawer for both.
   *
   * Three fields, and the first is a picker rather than a text box. `method`
   * has to be one of `Payment::METHODS`: the till branches on that value, the
   * Z-report splits by it and `AcquirerFees` carries a rate for each, so a row
   * naming anything else would draw a button whose payment the ledger then
   * refuses in front of a guest. What a restaurant is really choosing here is
   * which of the platform's tenders to OFFER, and what to call it.
   */
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState({ method: 'uzcard', name: '', kind: 'card' });
  const [saving, setSaving] = useState(false);

  /** Tenders the restaurant is not already offering. */
  const taken = new Set(t.rows.map((row) => row.method ?? row.id));
  const offerable = TENDERS.filter((method) => !taken.has(method));

  const add = async (): Promise<void> => {
    const name = draft.name.trim();

    // Silent: the empty field is right there, and a toast naming it would be
    // the console repeating what the reader can already see.
    if (name.length < 2) return;

    setSaving(true);

    const answer = await post('/api/finance/payment-methods', {
      action: 'create',
      method: draft.method,
      name,
      kind: draft.kind,
      fiscal: draft.kind !== 'credit',
    });

    setSaving(false);

    if (!answer.ok) {
      flash.problem(answer.message ?? shell('offline'));
      return;
    }

    setDraft({ method: offerable[1] ?? 'uzcard', name: '', kind: 'card' });
    setAdding(false);
    flash(`${name} · ${t.addFlash}`);
    router.refresh();
  };

  /**
   * Switch a tender on or off.
   *
   * The guard above the write is the server's rule rather than the screen's: a
   * method that took money today cannot leave the shift's Z-report, and `share`
   * is exactly "how much of today came in through this" — see
   * `settings-server.ts`, which computes it from the cash book.
   *
   * The local state moves first and the row is refreshed after. A switch that
   * waited for a round trip before moving reads as broken on a slow connection,
   * and the refresh is what corrects it if the server disagreed.
   */
  const flip = async (row: SettingsCopy['pays']['rows'][number], on: boolean): Promise<void> => {
    if (on && row.share > 0) {
      flash.problem(`${row.name} · ${t.lockedFlash}`);
      return;
    }

    setOff(on ? [...off, row.id] : off.filter((id) => id !== row.id));
    flash(`${row.name} · ${on ? t.offFlash : t.onFlash}`);

    // A fixture console has no tender behind its rows — `method` is undefined —
    // so the switch moves locally and nothing is written. The live list carries
    // one on every row.
    if (row.method === undefined) return;

    const answer = await post('/api/finance/payment-methods', {
      action: 'toggle',
      method: row.method,
      on: !on,
    });

    if (!answer.ok) {
      flash.problem(answer.message ?? shell('offline'));
      setOff(on ? off.filter((id) => id !== row.id) : [...off, row.id]);
      return;
    }

    router.refresh();
  };

  return (
    <section className={`${CARD} mb-5 overflow-hidden`} data-table>
      <div className="border-divider flex items-end justify-between gap-5 border-b px-6 pt-[18px] pb-4">
        <div className="min-w-0">
          <h3 className={SECTION_HEAD}>{t.title}</h3>
          <p className="text-fg-subtle mt-[5px] text-xs leading-normal">{t.sub}</p>
        </div>
        {/*
         * `POST /api/v1/finance/payment-methods` through
         * `/api/finance/payment-methods`.
         *
         * The rows are still two different kinds of thing wearing one shape, and
         * that has not changed: the tenders are a closed set the till branches on
         * (`Payment::METHODS`), the online rails are drivers registered in
         * `PaymentGateways`. What changed is that the restaurant's DECISION about
         * each of them — offered or not, called what, at whose rate, fiscal or
         * not — is now a row it owns, so the panel writes rather than pretends.
         */}
        <button
          type="button"
          disabled={saving || offerable.length === 0}
          onClick={() => (adding ? void add() : setAdding(true))}
          className="bg-brand-500 hover:bg-brand-600 h-9 flex-none rounded-md px-3.5 text-sm font-semibold text-white disabled:opacity-55"
        >
          {t.add}
        </button>
      </div>

      {adding ? (
        <div className="border-divider bg-bg-subtle grid gap-2.5 border-b px-6 py-4 sm:grid-cols-[150px_minmax(0,1fr)_130px]">
          <select
            value={draft.method}
            onChange={(event) => setDraft({ ...draft, method: event.target.value })}
            aria-label={t.colName}
            className="border-border-strong bg-surface text-fg h-10 rounded-md border px-3 text-sm"
          >
            {offerable.map((method) => (
              <option key={method} value={method}>
                {method.toUpperCase()}
              </option>
            ))}
          </select>
          <input
            autoFocus
            value={draft.name}
            onChange={(event) => setDraft({ ...draft, name: event.target.value })}
            placeholder={t.colName}
            aria-label={t.colName}
            className="border-border-strong bg-surface text-fg h-10 rounded-md border px-3 text-sm font-semibold"
          />
          <select
            value={draft.kind}
            onChange={(event) => setDraft({ ...draft, kind: event.target.value })}
            aria-label={t.colKind}
            className="border-border-strong bg-surface text-fg h-10 rounded-md border px-3 text-sm"
          >
            {(['cash', 'card', 'online', 'credit'] as const).map((kind) => (
              <option key={kind} value={kind}>
                {kind}
              </option>
            ))}
          </select>
        </div>
      ) : null}

      <div
        className={`bg-bg-subtle text-fg-subtle grid ${PAY_COLUMNS} gap-3.5 border-b px-6 py-[11px] text-xs font-semibold`}
      >
        <span>{t.colName}</span>
        <span>{t.colKind}</span>
        <span>{t.colFiscal}</span>
        <span>{t.colShare}</span>
        <span className="text-right">{t.colOn}</span>
      </div>

      {t.rows.map((row) => {
        const on = !off.includes(row.id);

        return (
          <div
            key={row.id}
            data-row
            className={`border-divider grid ${PAY_COLUMNS} items-center gap-3.5 border-b px-6 py-3 ${
              on ? '' : 'opacity-55'
            }`}
          >
            <span className="min-w-0">
              <span className="block truncate text-sm font-semibold">{row.name}</span>
              <span className="text-2xs text-fg-subtle mt-0.5 block">{row.note}</span>
            </span>

            <span className="text-fg-muted text-sm">{t.kinds[row.kind]}</span>

            <span
              className={`rounded-pill justify-self-start px-[9px] py-1 text-[11px] font-semibold whitespace-nowrap ${
                row.fiscal ? 'bg-success-50 text-success-700' : 'bg-bg-muted text-fg-muted'
              }`}
            >
              {row.fiscal ? t.fiscal : t.nonFiscal}
            </span>

            <span data-num className="text-sm font-semibold">
              {on ? `${row.share}%` : '—'}
            </span>

            <span className="flex justify-end">
              {/*
               * The decision is now a row. "Available" — whether
               * `PAYME_MERCHANT_ID` is set — is still an environment fact and
               * still not something a manager may flip; what this switch writes
               * is `payment_methods.is_enabled`, which is the restaurant saying
               * whether to OFFER a rail it can reach. See `flip()`.
               */}
              <Switch on={on} label={row.name} onClick={() => void flip(row, on)} />
            </span>
          </div>
        );
      })}

      <div className="text-fg-muted px-6 py-[15px] text-xs leading-relaxed">{t.note}</div>
    </section>
  );
}

/* -------------------------------------------------------------- categories */

function CatsPanel({ copy }: { copy: SettingsCopy }) {
  const t = copy.cats;
  const router = useRouter();
  const shell = useTranslations('console.shell');

  const [gone, setGone] = useState<readonly string[]>([]);

  /*
   * The add form, closed until asked for, and open for one column at a time —
   * money in and money out are two lists on one panel and a single open flag
   * would put the form under both.
   */
  const [adding, setAdding] = useState<'in' | 'out' | null>(null);
  const [draft, setDraft] = useState({ code: '', name: '' });
  const [busy, setBusy] = useState(false);

  const add = async (direction: 'in' | 'out'): Promise<void> => {
    const name = draft.name.trim();
    const code = draft.code.trim().toLowerCase();

    // Silent on an empty field — it is on screen and a toast would repeat it.
    if (name.length < 2 || code.length < 2) return;

    setBusy(true);

    const answer = await post('/api/finance/expense-categories', {
      action: 'create',
      code,
      name,
      direction,
    });

    setBusy(false);

    if (!answer.ok) {
      flash.problem(answer.message ?? shell('offline'));
      return;
    }

    setDraft({ code: '', name: '' });
    setAdding(null);
    flash(`${name} · ${t.addFlash}`);
    router.refresh();
  };

  /**
   * Retire a heading.
   *
   * Two different requests behind one button, and the count decides which. A
   * heading nothing has been filed under is DELETED; one with entries behind it
   * is ARCHIVED, because those entries keep its name on every statement they
   * already appear in — a delete would leave them pointing at a code nothing can
   * name, and a P&L reading "1 240 000 so'm, unknown".
   *
   * The panel knows the count because it draws it, so it asks for the right one;
   * the server's own refusal (`finance.category_in_use`) is the belt.
   */
  const retire = async (row: SettingsCopy['cats']['income'][number]): Promise<void> => {
    // A fixture console has no row on the server — the live list carries a code
    // on every entry — so the tile disappears locally and nothing is written.
    if (row.code === undefined) {
      if (row.used > 0) {
        flash.problem(`${row.used} ${t.inUse}`);
        return;
      }

      setGone([...gone, row.id]);
      flash(`${row.name} · ${t.deleted}`);

      return;
    }

    setBusy(true);

    const answer = await post(
      '/api/finance/expense-categories',
      row.used > 0
        ? { action: 'archive', code: row.code, direction: row.direction }
        : { action: 'remove', id: Number(row.id) },
    );

    setBusy(false);

    if (!answer.ok) {
      flash.problem(answer.message ?? shell('offline'));
      return;
    }

    flash(`${row.name} · ${t.deleted}`);
    router.refresh();
  };

  const column = (
    rows: SettingsCopy['cats']['income'],
    direction: 'in' | 'out',
    title: string,
    sub: string,
    note: string,
    dot: string,
  ) => (
    <section className={`${CARD} overflow-hidden`} key={title}>
      <div className="border-divider flex items-end justify-between gap-3.5 border-b px-5 pt-4 pb-[13px]">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold">{title}</h3>
          <p className="text-2xs text-fg-subtle mt-1 leading-normal">{sub}</p>
        </div>
        {/*
         * `POST /api/v1/finance/expense-categories` through
         * `/api/finance/expense-categories`.
         *
         * `finance.expenses.category` is still a varchar rather than a foreign
         * key, and that is deliberate: the till writes `refund` by name at
         * closing time and `payroll` when a month's wages are booked, so making
         * the column depend on a row a restaurant may delete would break the
         * till from a settings screen. What the table adds is the ninth heading
         * — the franchise fee, the music licence — that used to be filed under
         * `other` because there was nowhere else for it.
         *
         * Income headings are the restaurant's own invention and always were:
         * takings are classified by payment method, so `direction` is what
         * separates the two columns on one table.
         */}
        <button
          type="button"
          disabled={busy}
          onClick={() => (adding === direction ? void add(direction) : setAdding(direction))}
          className="border-border-strong bg-surface text-fg h-8 flex-none rounded-md border px-3 text-xs font-semibold disabled:opacity-55"
        >
          {t.add}
        </button>
      </div>

      {adding === direction ? (
        <div className="border-divider bg-bg-subtle grid gap-2.5 border-b px-5 py-3.5 sm:grid-cols-[120px_minmax(0,1fr)]">
          <input
            value={draft.code}
            onChange={(event) => setDraft({ ...draft, code: event.target.value })}
            placeholder="licence"
            aria-label="code"
            className="border-border-strong bg-surface text-fg h-9 rounded-md border px-2.5 font-mono text-xs"
          />
          <input
            autoFocus
            value={draft.name}
            onChange={(event) => setDraft({ ...draft, name: event.target.value })}
            placeholder={title}
            aria-label={title}
            className="border-border-strong bg-surface text-fg h-9 rounded-md border px-2.5 text-sm font-semibold"
          />
        </div>
      ) : null}

      {rows
        .filter((row) => !gone.includes(row.id))
        .map((row) => (
          <div
            key={row.id}
            data-row
            className="border-divider flex items-center gap-3 border-b px-5 py-[11px]"
          >
            <span aria-hidden className={`size-2 flex-none rounded-[2px] ${dot}`} />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium">{row.name}</span>
              <span className="text-2xs text-fg-subtle mt-px block">
                {row.used} {t.entries}
              </span>
            </span>
            <span data-num className="text-fg-muted flex-none text-sm font-semibold">
              {formatTiyinAmount(row.sum)}
            </span>
            <button
              type="button"
              title={t.del}
              aria-label={`${t.del} · ${row.name}`}
              onClick={() => void retire(row)}
              className="border-border bg-surface text-fg-subtle hover:border-danger-500 hover:text-danger-600 grid size-7 flex-none place-items-center rounded-[8px] border"
            >
              <svg
                width="13"
                height="13"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              >
                <path d="M4 7h16" />
                <path d="M9 7V5h6v2" />
                <path d="M6 7l1 13h10l1-13" />
              </svg>
            </button>
          </div>
        ))}

      <div className="text-2xs text-fg-subtle px-5 py-[13px] leading-normal">{note}</div>
    </section>
  );

  return (
    <div data-split className="grid grid-cols-2 items-start gap-5">
      {column(t.income, 'in', t.inTitle, t.inSub, t.inNote, 'bg-success-500')}
      {column(t.expense, 'out', t.outTitle, t.outSub, t.outNote, 'bg-danger-500')}
    </div>
  );
}

/* ------------------------------------------------------------------- zones */

const ZONE_TINT: readonly string[] = [
  'bg-brand-50 text-brand-700',
  'bg-accent-50 text-accent-700',
  'bg-warning-50 text-warning-700',
  'bg-bg-muted text-fg-muted',
];

function ZonesPanel({ copy }: { copy: SettingsCopy }) {
  const t = copy.zones;
  const shell = useTranslations('console.shell');
  const router = useRouter();

  const [rows, setRows] = useState(t.rows.map((row) => ({ ...row })));
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);

  /**
   * Open a zone.
   *
   * `POST /api/v1/tables/halls` through `/api/tables/halls`, which derives the
   * hall code from the name — a manager naming a room "Terrasa" should not also
   * have to invent `TERRASA` and keep the two in step. It opens with no tables;
   * those are drawn on the floor plan, which is the screen that knows where
   * they stand.
   */
  const add = async (): Promise<void> => {
    const wanted = name.trim();

    if (wanted.length < 2) return;

    setSaving(true);
    const answer = await post('/api/tables/halls', { name: wanted, seats: 0 });
    setSaving(false);

    if (!answer.ok) {
      flash.problem(answer.message ?? shell('offline'));
      return;
    }

    setName('');
    setAdding(false);
    /* No toast on success: the zone appears in the table underneath, which is a
       stronger confirmation than a sentence, and the catalogue's `addFlash`
       here is the form's field list rather than a result. */
    router.refresh();
  };

  /**
   * Move a zone's seats.
   *
   * The row moves first and the write follows, because the stepper is held down
   * — a control that waited for a round trip per tap would feel broken. Only
   * the seat count travels: `tables_count` is a count of rows in the floor plan
   * and cannot be set from here, which is why the handler takes `seats` alone.
   * A refusal puts the row back where it was rather than leaving the screen
   * disagreeing with the database.
   */
  const reseat = (id: string, tables: number, seats: number): void => {
    const before = rows.find((row) => row.id === id);

    setRows(rows.map((row) => (row.id === id ? { ...row, tables, seats } : row)));

    const hall = apiId(id);

    if (hall === null) return;

    void (async () => {
      const answer = await post('/api/tables/halls', { id: hall, seats });

      if (answer.ok || before === undefined) return;

      setRows((now) => now.map((row) => (row.id === id ? before : row)));
      flash.problem(answer.message ?? shell('offline'));
    })();
  };

  return (
    <section className={`${CARD} mb-5 overflow-hidden`} data-table>
      <div className="border-divider flex items-end justify-between gap-5 border-b px-6 pt-[18px] pb-4">
        <div className="min-w-0">
          <h3 className={SECTION_HEAD}>{t.title}</h3>
          <p className="text-fg-subtle mt-[5px] text-xs leading-normal">{t.sub}</p>
        </div>
        <button
          type="button"
          disabled={saving}
          onClick={() => (adding ? void add() : setAdding(true))}
          className="bg-brand-500 hover:bg-brand-600 h-9 flex-none rounded-md px-3.5 text-sm font-semibold text-white disabled:opacity-55"
        >
          {t.add}
        </button>
      </div>

      {adding ? (
        <div className="border-divider bg-bg-subtle border-b px-6 py-4">
          <input
            autoFocus
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder={t.add}
            aria-label={t.add}
            className="border-border-strong bg-surface text-fg h-10 w-full max-w-[320px] rounded-md border px-3 text-sm font-semibold"
          />
        </div>
      ) : null}

      {rows.map((zone, index) => (
        <div
          key={zone.id}
          data-row
          className="border-divider flex items-center gap-4 border-b px-6 py-3.5"
        >
          <span
            className={`font-display grid size-10 flex-none place-items-center rounded-[11px] text-sm font-bold ${
              ZONE_TINT[index % 4]
            }`}
          >
            {zone.name.slice(0, 2).toUpperCase()}
          </span>

          <span className="min-w-0 flex-1">
            <span className="text-md block truncate font-semibold">{zone.name}</span>
            <span className="text-fg-subtle mt-0.5 block text-xs">
              {zone.seats} {t.seats} · {t.avg}
              {zone.tables ? Math.round(zone.seats / zone.tables) : 0} {t.pax}
            </span>
          </span>

          {/*
           * The seat count moves with the table count because the design's
           * stepper moves both — four covers a table, which is the average this
           * row already prints. Only the seats reach the server; see `reseat`.
           */}
          <Stepper
            value={String(zone.tables)}
            width="w-9"
            lessLabel={`${zone.name} −`}
            moreLabel={`${zone.name} +`}
            onLess={() =>
              reseat(zone.id, Math.max(1, zone.tables - 1), Math.max(2, zone.seats - 4))
            }
            onMore={() =>
              reseat(zone.id, Math.min(60, zone.tables + 1), Math.min(5000, zone.seats + 4))
            }
          />

          <span
            className={`rounded-pill flex-none px-[9px] py-1 text-[11px] font-semibold whitespace-nowrap ${
              zone.svc ? 'bg-brand-50 text-brand-700' : 'bg-bg-muted text-fg-muted'
            }`}
          >
            {zone.svc ? t.svcOn : t.svcOff}
          </span>

          {/*
           * The service charge is the VENUE's, not the hall's: `Branch.settings
           * .service_charge_percent`, read by `Order::servicePercent()` with the
           * tenant's figure as the fallback. The sign put it on the hall; a hall
           * has no settings and a takeaway has no hall.
           *
           * So this is a link and not a switch. It WAS a switch: it flipped
           * local state, flashed "xizmat haqi qo'shildi", and every subsequent
           * bill was priced without it — a control that appeared to work and
           * silently cost the restaurant its service charge. The row goes where
           * the figure is actually edited.
           */}
          <Link
            href="/settings/branches"
            className="border-border bg-surface text-fg-muted hover:bg-bg-subtle grid h-8 flex-none place-items-center rounded-md border px-3 text-xs font-semibold"
          >
            {t.svcToggle}
          </Link>
        </div>
      ))}

      <div className="text-fg-muted px-6 py-[15px] text-xs leading-relaxed">{t.note}</div>
    </section>
  );
}

/* ---------------------------------------------------------- notifications */

function NotifyPanel({ copy }: { copy: SettingsCopy }) {
  const t = copy.notify;
  const [chat, setChat] = useState('-1001847392015');
  const [on, setOn] = useState<Record<string, boolean>>(
    Object.fromEntries(t.events.map((event) => [event.key, event.on])),
  );

  /* The design's own test: digits, at least six, optionally negative. A group
     chat id is negative and a private one is not, which is why the minus is
     allowed rather than required. */
  const valid = /^-?\d{6,}$/.test(chat.trim());

  /*
   * A format check is all this is, and now all it says.
   *
   * `hintOk` reads "To'g'ri · Chilonzor menejerlari guruhi" — a claim about
   * WHICH Telegram group the id belongs to, made without ever asking Telegram.
   * Any digits-with-a-minus produced it. Naming the group needs `getChat`
   * through the bot; until then the hint confirms the shape and nothing more.
   */
  const hint = chat === '' ? t.hintEmpty : valid ? t.hintOkPlain : t.hintBad;

  /**
   * Save the switches, and optionally prove the chat is reachable.
   *
   * One handler for both buttons because both write: a test against unsaved
   * settings answers a question nobody asked. The proxy owns the map from these
   * six keys to the platform's domain events — see `/api/settings/notify`.
   */
  const send = async (action: 'save' | 'test'): Promise<void> => {
    const response = await fetch('/api/settings/notify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat: chat.trim(), on, action }),
    }).catch(() => null);

    if (response === null || !response.ok) {
      flash.problem(action === 'test' ? t.testBad : t.saveBad);
      return;
    }

    flash(action === 'test' ? t.testSent : t.saved);
  };

  return (
    <section className={`${CARD} mb-5 overflow-hidden`}>
      <div className="border-divider border-b px-6 pt-[18px] pb-4">
        <h3 className={SECTION_HEAD}>{t.title}</h3>
        <p className="text-fg-subtle mt-[5px] text-xs leading-normal">{t.sub}</p>
      </div>

      <div className="grid max-w-[520px] gap-4 px-6 py-5">
        <div>
          <label className="mb-1.5 block text-xs font-semibold" htmlFor="tg-chat">
            {t.chat}
          </label>
          <input
            id="tg-chat"
            value={chat}
            onChange={(event) => setChat(event.target.value.replace(/[^0-9-]/g, ''))}
            placeholder="-1001234567890"
            className={`bg-surface text-fg h-10 w-full rounded-md border px-3 font-mono text-sm ${
              chat === ''
                ? 'border-border-strong'
                : valid
                  ? 'border-success-500/50'
                  : 'border-danger-500/50'
            }`}
          />
          <div
            className={`text-2xs mt-[5px] ${
              chat === '' ? 'text-fg-subtle' : valid ? 'text-success-600' : 'text-danger-600'
            }`}
          >
            {hint}
          </div>
        </div>

        <div>
          <span className="mb-1.5 block text-xs font-semibold">{t.bot}</span>
          <div
            data-num
            className="border-border bg-bg-subtle text-fg-muted flex h-10 items-center gap-[9px] rounded-md border px-3 font-mono text-sm"
          >
            <span className="bg-success-500 rounded-pill size-[7px] flex-none" />
            {t.botHandle}
          </div>
        </div>

        <div>
          <div className="mb-[9px] text-xs font-semibold">{t.which}</div>
          {t.events.map((event) => (
            <div
              key={event.key}
              className="border-divider flex items-center gap-3 border-b py-[9px]"
            >
              <span className="min-w-0 flex-1">
                <span
                  className={`block text-sm font-medium ${on[event.key] ? 'text-fg' : 'text-fg-subtle'}`}
                >
                  {event.label}
                </span>
                <span className="text-2xs text-fg-subtle mt-px block">{event.when}</span>
              </span>
              <Switch
                on={Boolean(on[event.key])}
                label={event.label}
                onClick={() => setOn({ ...on, [event.key]: !on[event.key] })}
              />
            </div>
          ))}
        </div>

        {/*
         * Both buttons write. `POST /api/v1/telegram/notification-rules`
         * through the proxy at `/api/settings/notify`, which also owns the map
         * from these six switch keys to the domain events the platform
         * actually publishes — see that file for why `target` is missing from
         * it rather than pointed at something adjacent.
         *
         * Test saves first and then sends one message. A test against unsaved
         * settings answers a question nobody asked: what matters is whether
         * the rules that are about to run can reach the chat.
         */}
        <div className="flex gap-[9px]">
          <button
            type="button"
            onClick={() => {
              if (!valid) {
                flash.problem(t.testBad);
                return;
              }
              void send('test');
            }}
            className="border-border-strong bg-surface text-fg h-[38px] rounded-md border px-[15px] text-sm font-semibold"
          >
            {t.test}
          </button>
          <button
            type="button"
            onClick={() => {
              if (!valid) {
                flash.problem(t.saveBad);
                return;
              }
              void send('save');
            }}
            className={`h-[38px] rounded-md px-[15px] text-sm font-semibold text-white ${
              valid ? 'bg-brand-500 hover:bg-brand-600' : 'bg-n-300'
            }`}
          >
            {t.save}
          </button>
        </div>

        <p className="text-2xs text-fg-subtle leading-relaxed">{t.note}</p>
      </div>
    </section>
  );
}

/* -------------------------------------------------------------- releases */

function ReleasesPanel({ copy }: { copy: SettingsCopy }) {
  const t = copy.releases;

  return (
    <section className={`${CARD} mb-5 overflow-hidden`}>
      <div className="border-divider flex items-end justify-between gap-5 border-b px-6 pt-[18px] pb-4">
        <div className="min-w-0">
          <h3 className={SECTION_HEAD}>{t.title}</h3>
          <p className="text-fg-subtle mt-[5px] text-xs leading-normal">{t.sub}</p>
        </div>
        <span data-num className="text-fg-subtle flex-none font-mono text-xs">
          {t.current}
          {t.rows[0]?.version}
        </span>
      </div>

      {t.rows.map((row, index) => (
        <div key={row.version} className="border-divider flex gap-4 border-b px-6 py-3.5">
          <span className="w-24 flex-none">
            <span
              data-num
              className={`block font-mono text-sm font-semibold ${index === 0 ? 'text-fg-brand' : 'text-fg'}`}
            >
              {row.version}
            </span>
            <span data-num className="text-2xs text-fg-subtle mt-0.5 block">
              {row.date}
            </span>
          </span>

          <span className="w-[78px] flex-none">
            <span
              className={`rounded-pill px-2 py-[3px] text-[10px] font-semibold whitespace-nowrap ${
                row.major ? 'bg-brand-50 text-brand-700' : 'bg-bg-muted text-fg-muted'
              }`}
            >
              {row.major ? t.major : t.minor}
            </span>
          </span>

          <span className="text-fg-muted min-w-0 flex-1 text-sm leading-relaxed">{row.note}</span>
        </div>
      ))}

      <div className="text-fg-muted px-6 py-3.5 text-xs leading-relaxed">{t.note}</div>
    </section>
  );
}

/* ------------------------------------------------------------ order states */

const STATE_COLUMNS = '[grid-template-columns:minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_116px]';

function StatesTable({ copy }: { copy: SettingsCopy }) {
  const t = copy.states;

  const channel = (channels: readonly ('dine' | 'delivery' | 'pickup')[]) => {
    if (channels.length === 3) return t.all;
    if (channels.length === 2 && !channels.includes('dine')) return t.offPremise;
    return channels
      .map((key) => ({ dine: t.dine, delivery: t.delivery, pickup: t.pickup })[key])
      .join(', ');
  };

  return (
    <section className={`${CARD} mb-5 overflow-hidden`} data-table>
      <div className="border-divider border-b px-6 pt-[18px] pb-4">
        <h3 className={SECTION_HEAD}>{t.title}</h3>
        <p className="text-fg-subtle mt-[5px] text-xs leading-normal">{t.sub}</p>
      </div>

      <div
        className={`bg-bg-subtle text-fg-subtle grid ${STATE_COLUMNS} gap-3.5 border-b px-6 py-[11px] text-xs font-semibold tracking-wide`}
      >
        <span>{t.colStaff}</span>
        <span>{t.colKitchen}</span>
        <span>{t.colGuest}</span>
        <span className="text-right">{t.colChannel}</span>
      </div>

      {t.rows.map((row) => (
        <div
          key={row.key}
          data-row
          className={`border-divider grid ${STATE_COLUMNS} items-center gap-3.5 border-b px-6 py-[11px]`}
        >
          <span className="flex min-w-0 items-center gap-[9px]">
            <span className={`rounded-pill size-[7px] flex-none ${TONE_PILL[row.tone]}`} />
            <span className="min-w-0 truncate text-sm font-semibold">{row.staff}</span>
          </span>
          <span
            className={`min-w-0 truncate text-sm ${row.kitchen ? 'text-fg-muted' : 'text-fg-disabled'}`}
          >
            {row.kitchen ?? '—'}
          </span>
          <span
            className={`min-w-0 truncate text-sm ${row.guest ? 'text-fg-muted' : 'text-fg-disabled'}`}
          >
            {row.guest ?? '—'}
          </span>
          <span data-num className="text-2xs text-fg-subtle text-right font-mono">
            {channel(row.channels)}
          </span>
        </div>
      ))}

      <div className="text-fg-muted px-6 py-[15px] text-xs leading-relaxed">{t.note}</div>
    </section>
  );
}

/* ------------------------------------------------------------------ policy */

/**
 * Which policy switch is a path in the settings document, by position.
 *
 * Position, because the catalogue and the fixture already pair by index — see
 * `settings-copy.ts`, which builds these rows from `POLICY_SWITCHES` the same
 * way. Keying by label would key by a sentence that changes with the reader's
 * language.
 *
 * Six of the ten write now. Every one of them is a declared path in
 * `config/settings.php` with exactly one enforcement point behind it, named in
 * the schema beside the path: a settled table clears itself in
 * `EloquentBillRegistry::close()`, striking food the kitchen already has stops
 * at `ApprovalGate::requires()`, the docket's clock is read by
 * `KitchenTicket::isLate()`, and the paper beside the screen is
 * `EloquentTicketWriter::fire()`.
 *
 * The four that stay local are three different situations, and none of them is
 * a call somebody forgot to make:
 *
 *  - **QQS stavkasi** is not a switch. There is no "VAT on or off" — the rate
 *    is `vat_percent`, a number, edited with the rest of the requisites, and a
 *    restaurant that is not registered for it sets `legal.vat_registered`. The
 *    row is drawn because the design draws the RATE, as a statement of what the
 *    receipt says.
 *
 *  - **Taomlarni bosqichma-bosqich yuborish** — coursing — is a behaviour that
 *    does not exist yet rather than a rule over one that does. Firing salads
 *    now and mains when the waiter calls needs a course on the line and a verb
 *    that fires one, and until both exist a stored switch would be a rule
 *    nothing reads. That is the failure this whole file was built to stop: a
 *    switch bound to nothing is worse than a switch that does nothing, because
 *    the restaurant believes it.
 *
 *  - **The three discount rows** are not settings at all. The ceilings live on
 *    `Terminal.settings.discount_limits` and are written through
 *    `PUT /api/v1/roles/{role}` (`discount_limit_percent`), which is the single
 *    source CLAUDE.md names — and names because that number has already drifted
 *    across four places once. Writing them here would make a fifth. The
 *    staff-meal discount has no home anywhere yet, for the same reason coursing
 *    does not: nothing enforces it.
 *
 * All four still move and still say what they did, which is the honest way to
 * draw a control that is a statement rather than a lever.
 */
const POLICY_PATHS: readonly (readonly (string | null)[])[] = [
  [
    'service_charge_auto',
    null,
    'policies.auto_close_table_after_payment',
    'policies.void_sent_needs_manager_pin',
  ],
  [null, 'policies.kds_late_minutes', 'policies.kds_paper_docket'],
  [null, null, null],
];

function PolicyGroups({ copy }: { copy: SettingsCopy }) {
  const t = copy.policy;
  const shell = useTranslations('console.shell');
  const [flipped, setFlipped] = useState<readonly string[]>([]);

  return (
    <>
      {t.groups.map((group, groupIndex) => (
        <section key={group.title} className={`${CARD} mb-5 overflow-hidden`}>
          <div className="border-divider border-b px-6 pt-[18px] pb-4">
            <h3 className={SECTION_HEAD}>{group.title}</h3>
          </div>

          {group.rows.map((row, rowIndex) => {
            const on = flipped.includes(row.label) ? !row.on : row.on;
            const path = POLICY_PATHS[groupIndex]?.[rowIndex] ?? null;

            return (
              <div
                key={row.label}
                className="border-divider flex items-center gap-5 border-b px-6 py-4"
              >
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-semibold">{row.label}</div>
                  <div className="text-fg-subtle mt-[3px] text-xs">{row.value}</div>
                </div>

                {/*
                 * A switch where there is a rule to write, a statement where
                 * there is not.
                 *
                 * Five of the ten used to flip, flash "<label> yoqildi" and
                 * write nothing: a tax RATE, coursing the kitchen does not
                 * implement, and three discount ceilings whose single source is
                 * `Terminal.settings.discount_limits`. A manager who moved the
                 * waiter limit here was told it took effect and the till went
                 * on refusing at the old number — the exact console-says-one-
                 * thing failure CLAUDE.md records. Those rows now show their
                 * value and say where it is edited.
                 *
                 * The six that do write are optimistic, and the failure path
                 * puts the switch back: one left where the reader dropped it
                 * while the server holds the opposite is the worst outcome on a
                 * screen whose whole job is to say what the rules are.
                 */}
                {row.readOnly === true ? (
                  <span className="text-fg-subtle flex-none text-xs">{t.readOnlyNote}</span>
                ) : (
                  <BigSwitch
                    on={on}
                    label={row.label}
                    onClick={() => {
                      const flip = () =>
                        setFlipped((now) =>
                          now.includes(row.label)
                            ? now.filter((label) => label !== row.label)
                            : [...now, row.label],
                        );

                      flip();
                      flash(row.label + (on ? t.off : t.on));

                      if (path === null) return;

                      void (async () => {
                        const answer = await post('/api/settings/policy', { path, on: !on });

                        if (answer.ok) return;

                        flip();
                        flash.problem(answer.message ?? shell('offline'));
                      })();
                    }}
                  />
                )}
              </div>
            );
          })}
        </section>
      ))}
    </>
  );
}

/* -------------------------------------------------------------- appearance */

function AppearanceRow({ copy }: { copy: SettingsCopy }) {
  const t = copy.appearance;
  const { resolvedTheme, setTheme } = useTheme();
  const dark = resolvedTheme === 'dark';

  return (
    <div className={`${CARD} flex items-center justify-between gap-5 px-6 py-5`}>
      <div>
        <div className="text-sm font-semibold">{t.title}</div>
        <div className="text-fg-subtle mt-[3px] text-xs">{t.sub}</div>
      </div>

      <div className="bg-bg-muted flex flex-none items-center gap-[3px] rounded-md p-[3px]">
        {(
          [
            [false, t.light],
            [true, t.dark],
          ] as const
        ).map(([wantsDark, label]) => (
          <button
            key={label}
            type="button"
            data-seg
            data-active={dark === wantsDark}
            onClick={() => setTheme(wantsDark ? 'dark' : 'light')}
            className="text-fg-muted h-8 rounded-[7px] px-4 text-sm font-medium"
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}
