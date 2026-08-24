'use client';

import { useEffect, useState } from 'react';
import { useMessages } from 'next-intl';
import { flash, StatusChip } from '@restaurant/ui';
import { formatTiyinAmount } from '@restaurant/utils';

import type { Messages } from '@/i18n';

import { post } from '@/lib/console-post';
import { ROLE_IDS, SERVER_ROLE_NAMES } from '@/lib/roles';

import { Chip, Head, Stats, Table, Td, Tr, type ChipTone, type StatTone } from '../../platform-ui';
import {
  defaultFeatures,
  FEATURES,
  type CityKey,
  type FeatureKey,
  type InvoiceState,
  type PlanId,
  type PlatformUser,
  type TenantBranch,
} from '../platform-data';

/**
 * Everything this screen says, and the city table it shares.
 *
 * The card's own copy is `console.platformTenants.card`; the city names are
 * `console.city`, which the branch switcher reads too. They are joined into one
 * object here rather than threaded as two props because the card, the invoice
 * table and the create form each need a slice of both.
 */
type TenantCopy = Messages['console']['platformTenants']['card'] & {
  cities: Messages['console']['city'];
  /**
   * The nine role names, keyed by what the SERVER calls them.
   *
   * The card lists a restaurant's people and the API sends each one's role as
   * the Spatie name — `branch-manager`, `storekeeper` — which is an identifier
   * and not a word anybody should read. Resolved once here rather than in the
   * row, so a role the console has no name for falls through to the raw string
   * instead of rendering blank.
   */
  roleNames: Readonly<Record<string, string>>;
};

/**
 * The six cities the create form offers — `dc.html:14066`, in its order.
 *
 * Kokand is deliberately not among them even though a branch can sit there:
 * this list is where a *business* is registered, and the design's six are the
 * six the platform sells into.
 */
const FORM_CITIES: readonly CityKey[] = [
  'tashkent',
  'samarkand',
  'bukhara',
  'fergana',
  'namangan',
  'termiz',
];

/**
 * The three tiers, their names and their monthly price in tiyin.
 *
 * Module scope because two things read them: the create sheet, where a plan is
 * chosen for a restaurant that does not exist yet, and the card's plan sheet,
 * where one is moved between tiers. Two copies drifted apart the moment either
 * price changed, and a console offering Growth at one figure on one screen and
 * another on the next is a console an operator stops quoting from.
 */
const PLANS = [
  { id: 'start', label: 'Start', price: 2_400_000_00 },
  { id: 'growth', label: 'Growth', price: 6_900_000_00 },
  { id: 'enterprise', label: 'Enterprise', price: 14_800_000_00 },
] as const;

const PLAN_LABEL: Readonly<Record<PlanId, string>> = {
  start: 'Start',
  growth: 'Growth',
  enterprise: 'Enterprise',
};

/**
 * `ImpersonateRequest::rules()` — repeated here, never guessed.
 *
 * The floor is checked in three places and that is deliberate: here, so the
 * sentence lands while the field is still in front of the operator; in the
 * route handler, because a browser is not a place to enforce anything; and
 * upstream, where the column it protects lives.
 */
const REASON_MIN = 10;

/**
 * One invoice of one restaurant, as the card's table draws it.
 *
 * `key` is the row's numeric id upstream and is the only thing "record payment"
 * may be aimed at. `id` is the printed number both sides quote on the phone —
 * and on a console with no session it is a string the design's own generator
 * invented, which is exactly why the two are separate fields.
 */
export type TenantInvoice = {
  key: number | null;
  id: string;
  date: string;
  /** Integer tiyin. Formatted where the reader's language is known. */
  amount: number;
  state: InvoiceState;
};

/**
 * One archive job, as `GET /platform/tenants/{id}/exports` lists them.
 *
 * `url` is present only once `state` is `ready`, and it is signed for
 * twenty-four hours — `URL::temporarySignedRoute`. That expiry is the reason
 * the field is nullable rather than always a string: a link that never went
 * stale would be a restaurant's entire history left on a URL, and a console
 * that stored one would keep it alive past its own tab.
 */
export type TenantExport = {
  id: number;
  state: 'queued' | 'running' | 'ready' | 'failed';
  url: string | null;
};

/**
 * Read the archive list, narrowed to the newest row.
 *
 * A plain `fetch` rather than `post()`: this is a poll, and turning a read into
 * a POST would put "start an export" and "has it finished" behind the same verb
 * on the strongest credential the platform issues. It never throws — a poll
 * that rejected inside a loop would be an unhandled rejection with a button
 * still saying "queued" — so a bad answer is `null` and the loop tries again.
 */
async function readExports(tenantId: number): Promise<TenantExport | null> {
  let response: Response;

  try {
    response = await fetch(`/api/platform/tenant-export?tenantId=${tenantId}`);
  } catch {
    return null;
  }

  if (!response.ok) return null;

  let payload: { data?: unknown } | null = null;

  try {
    payload = (await response.json()) as { data?: unknown };
  } catch {
    return null;
  }

  const rows = Array.isArray(payload?.data) ? (payload.data as Record<string, unknown>[]) : [];
  const newest = rows[0];

  if (newest === undefined || typeof newest.id !== 'number') return null;

  const state = newest.state;

  return {
    id: newest.id,
    state:
      state === 'ready' || state === 'failed' || state === 'running' || state === 'queued'
        ? state
        : 'queued',
    url: typeof newest.url === 'string' && newest.url !== '' ? newest.url : null,
  };
}

export type TenantRow = {
  id: string;
  /**
   * The numeric key every write on this card binds to, or `null` for a fixture.
   *
   * `apiId()` is the console's usual guard against writing to a demo row and it
   * cannot serve here: `id` is a slug — `smart`, `choyxona` — so it would
   * answer `null` for every row, real or invented. The key rides alongside
   * instead, and `null` means what it means everywhere else in this console:
   * this render fell back to fixtures and nothing may be written.
   */
  tenantId: number | null;
  name: string;
  city: string;
  plan: string;
  planId: PlanId;
  branches: number;
  users: number;
  /** Formatted for the reader; the raw tiyin figure rides alongside. */
  mrr: string;
  mrrRaw: number;
  pay: string;
  payState: 'paid' | 'late' | 'failing';
  payTone: ChipTone;
  owner: string;
  /**
   * The address the owner signs in with, or `null` when this restaurant has no
   * owner account at all.
   *
   * No fixture behind it, unlike `owner` and `phone`: a made-up name on a demo
   * row is scenery, a made-up email is a login that does not exist, and this
   * one is printed as a credential and offered to the clipboard.
   */
  ownerEmail: string | null;
  phone: string;
  since: string;
  nextInvoice: string;
  seen: string;
  state: string;
  stateLabel: string;
  problem: boolean;
  branchRows: readonly TenantBranch[];
  /** The people the card lists, owner first. */
  pool: readonly PlatformUser[];
  /** The owner's role name, already in the reader's language. */
  ownerRole: string;
  /** Keeps two tenants from sharing an invoice number — the design's own shift. */
  invoiceOffset: number;
  /** What the API has actually billed. Empty falls back to the design's six. */
  invoices: readonly TenantInvoice[];
  /** The flags this restaurant's plan includes. A property of the plan, not of it. */
  features: readonly FeatureKey[];
};

/**
 * Restaurants — the list, and the card one row opens.
 *
 * `Smart Restaurant OS.dc.html:7078-7193`. The design gives a tenant a whole
 * screen: seven figures across the top, the branch table with its total, who
 * has been signing in, six invoices, four feature flags and the three actions
 * that end a customer relationship. What shipped was a 420px drawer holding
 * four rows of a definition list and three buttons with no handlers — which
 * meant an operator taking a call about a late invoice could see neither the
 * invoices nor the branches the money comes from.
 *
 * The card replaces the list rather than floating over it, as the design does
 * it, and the same back link comes home. That also keeps the wide tables wide:
 * five columns of branches do not fit a drawer, and the version that tried
 * would have dropped two of them.
 *
 * **Every mutation here writes to the server**, through the route handlers in
 * `app/api/platform/`. The local state that survives beside them — `suspended`,
 * `settled`, `created` — is an overlay on a server-rendered list, not a
 * pretence: the page is a server component, so nothing on screen re-reads
 * itself after a click, and without the overlay a suspension the API accepted
 * would still be drawn as active until the next navigation. Each overlay moves
 * *after* the answer, never before, which is the opposite of the queue screens:
 * a shift decided twice is a nuisance, a customer you believe is suspended and
 * is not is a customer still trading on an unpaid account.
 *
 * Two things on this screen are deliberately not wired, and both say so where
 * they sit: per-tenant feature flags, which this platform does not model — the
 * plan is the lever — and the data export, which is a background job and an
 * object store rather than a missing endpoint.
 */
export function TenantList({
  rows,
  labels,
  head,
  stats,
  lang,
}: {
  rows: readonly TenantRow[];
  labels: Record<string, string>;
  head: { title: string; subtitle: string };
  stats: readonly { label: string; value: string; note?: string; tone?: StatTone }[];
  lang: 'uz' | 'ru' | 'en';
}) {
  const messages = useMessages() as Messages;
  const copy: TenantCopy = {
    ...messages.console.platformTenants.card,
    cities: messages.console.city,
    roleNames: Object.fromEntries(
      ROLE_IDS.map((id) => [SERVER_ROLE_NAMES[id], messages.console.roles[id].name]),
    ),
  };

  const [query, setQuery] = useState('');
  const [problemsOnly, setProblemsOnly] = useState(false);
  const [plan, setPlan] = useState<string | null>(null);
  const [open, setOpen] = useState<TenantRow | null>(null);
  /* Which panel the card should already be showing when it opens. Set by the
     row's own "sign-in details" link, so that path is one press rather than
     two — and null for every other way in, which lands on the card as before. */
  const [openWith, setOpenWith] = useState<'password' | null>(null);
  const [adding, setAdding] = useState(false);

  /* Local overlays on the fixture, so a suspend or a recorded payment is
     visible for the rest of the session rather than vanishing on re-render. */
  const [suspended, setSuspended] = useState<readonly string[]>([]);
  const [settled, setSettled] = useState<readonly string[]>([]);
  const [created, setCreated] = useState<readonly TenantRow[]>([]);

  const all = [...created, ...rows];
  const needle = query.trim().toLowerCase();

  const shown = all.filter((row) => {
    if (problemsOnly && !isProblem(row)) return false;
    if (plan !== null && row.plan !== plan) return false;
    if (needle === '') return true;

    /* The address too, because half the reason an operator is on this screen
       is an email somebody read out to them. */
    return (
      row.name.toLowerCase().includes(needle) ||
      row.owner.toLowerCase().includes(needle) ||
      (row.ownerEmail?.toLowerCase().includes(needle) ?? false)
    );
  });

  const plans = [...new Set(all.map((row) => row.plan))];

  function isProblem(row: TenantRow) {
    if (settled.includes(row.id)) return suspended.includes(row.id) !== (row.state === 'suspended');
    return row.problem || suspended.includes(row.id);
  }

  if (open !== null) {
    const live = all.find((row) => row.id === open.id) ?? open;

    return (
      <TenantCard
        row={live}
        copy={copy}
        lang={lang}
        initialPanel={openWith}
        suspended={suspended.includes(live.id) !== (live.state === 'suspended')}
        settled={settled.includes(live.id)}
        onBack={() => {
          setOpen(null);
          setOpenWith(null);
        }}
        onSuspend={() =>
          setSuspended(
            suspended.includes(live.id)
              ? suspended.filter((id) => id !== live.id)
              : [...suspended, live.id],
          )
        }
        onSettle={() => setSettled([...settled, live.id])}
      />
    );
  }

  return (
    <>
      <Head title={head.title} subtitle={head.subtitle}>
        <button type="button" data-pbtn="primary" onClick={() => setAdding(true)}>
          {copy.add}
        </button>
      </Head>

      <Stats items={stats} />

      {/*
        One field and one segment track, on one line.

        Five outlined buttons used to sit here — five boxes of equal weight,
        with nothing in their shape to say that choosing one un-chooses the
        rest. A segment track says exactly that: one lane, one tile lit. The
        field beside it is filled rather than outlined, so the row reads as two
        controls instead of six edges.
      */}
      <div className="mb-3.5 flex flex-wrap items-center gap-2.5">
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={labels.search}
          aria-label={labels.search}
          data-pfield
          className="min-w-[200px] flex-1"
        />

        <div data-pseg role="group" aria-label={labels.all}>
          <button
            type="button"
            aria-pressed={plan === null && !problemsOnly}
            onClick={() => {
              setPlan(null);
              setProblemsOnly(false);
            }}
          >
            {labels.all}
          </button>

          {plans.map((name) => (
            <button
              key={name}
              type="button"
              aria-pressed={plan === name}
              onClick={() => {
                setPlan(name);
                setProblemsOnly(false);
              }}
            >
              {name}
            </button>
          ))}

          <button
            type="button"
            aria-pressed={problemsOnly}
            onClick={() => {
              setProblemsOnly(true);
              setPlan(null);
            }}
          >
            {labels.problems}
          </button>
        </div>
      </div>

      <p className="text-fg-subtle mb-2.5 text-xs">
        {labels.showing.replace('{n}', String(shown.length)).replace('{total}', String(all.length))}
      </p>

      {shown.length === 0 ? (
        <div className="text-fg-subtle rounded-lg border border-dashed p-12 text-center text-sm">
          {labels.empty}
        </div>
      ) : (
        <Table
          head={[
            { label: labels.colName },
            { label: labels.colPlan },
            { label: labels.colBranches, align: 'right' },
            { label: labels.colUsers, align: 'right' },
            { label: labels.colMrr, align: 'right' },
            { label: labels.colPay, align: 'right' },
          ]}
        >
          {shown.map((row) => (
            <Tr key={row.id}>
              <Td>
                <button
                  type="button"
                  onClick={() => setOpen(row)}
                  className="text-left font-medium hover:underline"
                >
                  {row.name}
                </button>
                <span className="text-fg-subtle block text-xs">
                  {row.city} · {row.owner}
                </span>

                {/*
                  The address on the ROW, not only inside the card.

                  It was on the card alone to begin with, one click in, and the
                  first operator who went looking for it did not find it —
                  because the question that brings somebody to this screen ("what
                  does this restaurant sign in with?") is asked of the list, not
                  of a detail view they have no reason to suspect. Pressing it
                  copies it; the link beside it opens the card with the
                  credentials panel already showing, which is the only other
                  thing they ever want from here.
                */}
                {row.ownerEmail === null ? null : (
                  <span className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-0.5">
                    <button
                      type="button"
                      onClick={() => void copyToClipboard(row.ownerEmail ?? '', copy.copied)}
                      title={copy.copyHint}
                      className="text-fg-muted hover:text-fg max-w-full truncate font-mono text-xs underline-offset-2 hover:underline"
                    >
                      {row.ownerEmail}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setOpenWith('password');
                        setOpen(row);
                      }}
                      className="text-brand-600 hover:text-brand-700 text-2xs font-semibold whitespace-nowrap underline-offset-2 hover:underline"
                    >
                      {copy.credentials}
                    </button>
                  </span>
                )}
              </Td>
              {/* A plan is a fact about a customer, not a state of one. It
                  used to be a tinted pill, which put a colour on all
                  forty-two rows and left the three that need somebody with
                  nothing to stand out against. */}
              <Td className="text-fg-muted">{row.plan}</Td>
              <Td align="right" numeric className="text-fg-subtle">
                {row.branches}
              </Td>
              <Td align="right" numeric className="text-fg-subtle">
                {row.users}
              </Td>
              <Td align="right" numeric className="font-medium">
                {row.mrr}
              </Td>
              {/*
                And the whole argument, in one cell.

                A restaurant that has paid gets NOTHING here — not a green chip,
                not the word. There is no work behind it, and a console that
                prints "paid" forty times has spent the reader's attention on
                forty non-events. What is left is the two or three rows wearing
                a tone, which is how they get found.
              */}
              <Td align="right">
                {settled.includes(row.id) || row.payState === 'paid' ? (
                  <span aria-label={copy.payPaid} className="text-fg-disabled text-xs">
                    —
                  </span>
                ) : (
                  <Chip tone={row.payTone}>{row.pay}</Chip>
                )}
              </Td>
            </Tr>
          ))}
        </Table>
      )}

      {adding ? (
        <AddRestaurant
          copy={copy}
          lang={lang}
          onClose={() => setAdding(false)}
          onCreate={(row) => {
            setCreated([row, ...created]);
            setAdding(false);
            setOpen(row);
          }}
        />
      ) : null}
    </>
  );
}

/**
 * Put something on the clipboard, and say so.
 *
 * Module scope because both halves of this screen offer it — the list, where an
 * operator copies an address off a row mid-call, and the card, where they copy
 * the password they have just issued. `navigator.clipboard` is absent on an
 * http origin and refused by a locked-down browser; nothing is apologised for
 * when it fails, because the value is on the screen in a font that tells O from
 * 0 and it can be read out.
 */
async function copyToClipboard(value: string, done: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(value);
    flash(done);
  } catch {
    /* Nothing to say — it is legible where it stands. */
  }
}

/**
 * One restaurant's detail, as the API sends it.
 *
 * The card used to take its venues, its people and its dates out of
 * `TENANT_DETAIL` — a fixture in `platform-data.ts` keyed by the demo slugs. A
 * restaurant actually onboarded here missed that lookup, so the venue table
 * came up empty and the staff list was generated: four to eight names off a
 * pool, each given a relative time from a rotating list of phrases. An operator
 * answering a customer's question was reading a console that had made the
 * answer up.
 *
 * Fetched when the card opens rather than with the list. Forty-two detail
 * requests so that one of them can be opened is the wrong trade.
 */
type LiveBranch = {
  id: string;
  name: string;
  city: string | null;
  status: string;
  seats: number | null;
  accounts: number;
};

type LiveUser = {
  id: number;
  name: string;
  role: string | null;
  isActive: boolean;
  lastLoginAt: string | null;
};

type LiveDetail = { branches: readonly LiveBranch[]; users: readonly LiveUser[] };

/**
 * Narrowed rather than cast.
 *
 * Everything below is printed beside a paying customer's name, and a cast that
 * let `undefined` through would print it. A shape that does not parse is
 * treated as no answer at all — the card says it could not load, which is true,
 * instead of drawing half a venue table.
 */
function detailFrom(value: unknown): LiveDetail | null {
  if (typeof value !== 'object' || value === null) return null;

  const record = value as Record<string, unknown>;
  const branches = Array.isArray(record.branches) ? record.branches : [];
  const users = Array.isArray(record.users) ? record.users : [];

  const text = (input: unknown): string => (typeof input === 'string' ? input : '');
  const count = (input: unknown): number => (typeof input === 'number' ? input : 0);

  return {
    branches: branches.flatMap((entry): LiveBranch[] => {
      if (typeof entry !== 'object' || entry === null) return [];

      const branch = entry as Record<string, unknown>;
      const name = text(branch.name);

      if (name === '') return [];

      return [
        {
          id: text(branch.id) || name,
          name,
          city: typeof branch.city === 'string' && branch.city !== '' ? branch.city : null,
          status: text(branch.status) || 'active',
          seats: typeof branch.seats === 'number' ? branch.seats : null,
          accounts: count(branch.accounts),
        },
      ];
    }),
    users: users.flatMap((entry): LiveUser[] => {
      if (typeof entry !== 'object' || entry === null) return [];

      const user = entry as Record<string, unknown>;
      const name = text(user.name);

      if (name === '') return [];

      return [
        {
          id: count(user.id),
          name,
          role: typeof user.role === 'string' && user.role !== '' ? user.role : null,
          isActive: user.is_active !== false,
          lastLoginAt:
            typeof user.last_login_at === 'string' && user.last_login_at !== ''
              ? user.last_login_at
              : null,
        },
      ];
    }),
  };
}

/* ------------------------------------------------------------- the card */

const FIGURE = 'bg-surface rounded-md border px-4 py-3.5';
/*
 * Four columns, and the one that left was money.
 *
 * A venue's takings are the restaurant's own business; the platform bills per
 * ACTIVE VENUE and has no claim on what happens inside one. The column was
 * filled from a fixture besides, so every real restaurant on this console got
 * somebody else's revenue printed beside its venues.
 */
const BRANCH_COLUMNS = '[grid-template-columns:minmax(0,1.6fr)_84px_96px_120px]';
const INVOICE_COLUMNS = '[grid-template-columns:150px_120px_minmax(0,1fr)_160px_130px]';

function TenantCard({
  row,
  copy,
  lang,
  suspended,
  settled,
  initialPanel,
  onBack,
  onSuspend,
  onSettle,
}: {
  row: TenantRow;
  copy: TenantCopy;
  lang: 'uz' | 'ru' | 'en';
  suspended: boolean;
  settled: boolean;
  /** The panel to open already showing, when the row said which. */
  initialPanel: 'password' | null;
  onBack: () => void;
  onSuspend: () => void;
  onSettle: () => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const [typed, setTyped] = useState('');
  const [deleted, setDeleted] = useState(false);

  /* The archive: whether one is being built, and the signed link when it is. */
  const [exporting, setExporting] = useState(false);
  const [archived, setArchive] = useState<TenantExport | null>(null);

  /** Which of the three panels the header opens is showing, if any. */
  const [asking, setAsking] = useState<'impersonate' | 'plan' | 'password' | null>(initialPanel);
  const [reason, setReason] = useState('');
  const [sending, setSending] = useState(false);

  /*
   * The owner's new password, once.
   *
   * It stays here rather than in a `flash()`: a toast is one at a time and gone
   * in 2.8 seconds, and from the moment the API answers, this string exists in
   * exactly one place in the world. The panel holds it until the operator
   * closes the panel themselves — the same rule `pair-phone.tsx` follows for a
   * PIN and a pairing code, for the same reason.
   */
  const [issued, setIssued] = useState<string | null>(null);

  /*
   * The restaurant's own venues and people, fetched when the card opens.
   *
   * `null` while it is in flight and `failed` when it will not come. Both are
   * drawn as themselves — the card says "loading" or "could not load" and never
   * substitutes the fixture, because a made-up venue table on a real customer
   * is worse than an empty one.
   */
  const [live, setLive] = useState<LiveDetail | null>(null);
  const [detailFailed, setDetailFailed] = useState(false);

  /* The plan the card believes it is on. Seeded from the server render and
     moved by the plan sheet, because nothing on a server-rendered page re-reads
     itself after a click and a chip that still says Start would make the
     operator change it a second time. */
  const [planNow, setPlanNow] = useState<PlanId>(row.planId);

  /* The numeric key every write and every read on this card binds to, or
     `null` when this render fell back to fixtures. Declared here because the
     detail fetch below is the first thing that needs it. */
  const tenantId = row.tenantId;

  const money = (tiyin: number) => formatTiyinAmount(tiyin, lang);

  /*
   * No `setState` before the await: the effect body only starts the request.
   * `current` is the usual guard against an answer arriving for a card the
   * operator has already navigated away from — which on this screen is one
   * click, because the card replaces the list rather than floating over it.
   */
  useEffect(() => {
    if (tenantId === null) return;

    let current = true;

    void (async () => {
      try {
        const response = await fetch(`/api/platform/tenant?tenantId=${tenantId}`, {
          cache: 'no-store',
        });

        if (!current) return;

        if (!response.ok) {
          setDetailFailed(true);

          return;
        }

        const payload = (await response.json()) as { data?: unknown };

        if (!current) return;

        const parsed = detailFrom(payload.data);

        if (parsed === null) setDetailFailed(true);
        else setLive(parsed);
      } catch {
        if (current) setDetailFailed(true);
      }
    })();

    return () => {
      current = false;
    };
  }, [tenantId]);

  /** A fixture card has nothing to fetch, so it is never "loading". */
  const detailPending = tenantId !== null && live === null && !detailFailed;

  const trial = row.state === 'trial';

  /*
   * The venues, from the API when there is one and from the fixture only on a
   * console with no session at all. Never both: a live restaurant with an empty
   * venue list is a restaurant with no venues, which is a real state worth
   * seeing, and filling it in from a demo would hide exactly the onboarding
   * failure an operator is looking for.
   */
  const branches =
    live !== null
      ? live.branches.map((branch) => ({
          key: branch.id,
          name: branch.name,
          // Free text upstream — a manager typed it — so it is printed as
          // typed rather than looked up in the console's six city keys.
          city: branch.city ?? '—',
          seats: branch.seats === null ? '—' : String(branch.seats),
          accounts: String(branch.accounts),
          state: branch.status === 'active' ? ('live' as const) : ('suspended' as const),
        }))
      : row.branchRows.map((branch, index) => ({
          key: `${branch.name}-${index}`,
          name: branch.name,
          city: copy.cities[branch.city as CityKey] ?? branch.city,
          seats: String(branch.seats),
          accounts: String(branch.staff),
          /* The design's own rule: a trial tenant's newest venue is the one
             still being set up, because that is where onboarding stalls. */
          state:
            trial && index === row.branchRows.length - 1 ? ('setup' as const) : ('live' as const),
        }));

  /*
   * The people, and nothing invented about them.
   *
   * `usersFor` is still here for the fixture console and says what it is: four
   * to eight names off a pool, each given a phrase from a rotating list. On a
   * live restaurant that was an invented staff list with invented activity, on
   * the screen an operator answers questions from.
   */
  const people =
    live !== null
      ? live.users.map((user) => ({
          key: String(user.id),
          name: user.name,
          role: user.role === null ? '—' : (copy.roleNames[user.role] ?? user.role),
          seen: user.lastLoginAt === null ? copy.neverSeen : readable(user.lastLoginAt),
          inactive: !user.isActive,
        }))
      : usersFor(row, copy).map((user, index) => ({
          key: `${user.name}-${index}`,
          name: user.name,
          role: user.role,
          seen: user.seen,
          inactive: false,
        }));
  const invoices = invoicesFor(row, copy, settled, lang);

  /*
   * The oldest thing this restaurant still owes, which is what the header's
   * "record payment" is aimed at.
   *
   * The API sends invoices newest first, so the last unpaid one in the list is
   * the one that has been outstanding longest — and that is the one an operator
   * reconciling a bank statement is looking at. `null` means either a demo
   * console or a customer who owes nothing, and the button says so rather than
   * guessing at a number.
   */
  const openInvoice =
    invoices.filter((invoice) => invoice.key !== null && invoice.outstanding).at(-1)?.key ?? null;

  /**
   * Whatever the API said, or the console's own sentence when it said nothing.
   *
   * The envelope carries a code and three languages, so a refusal an operator
   * can act on — impersonation switched off platform-wide, a restaurant with no
   * active owner account — reaches them in their own words. `copy.failed` is
   * only for the cases with no sentence at all: a 401, a dead socket.
   */
  const refused = (message: string | null) => flash.problem(message ?? copy.failed);

  /*
   * Every write below starts with the same guard, and it is not ceremony. This
   * console draws its fixtures whenever the API is unreachable, and those rows
   * carry no numeric key — a button that invented one would suspend, bill or
   * archive whichever restaurant happens to hold that id.
   */
  async function setStatus(next: 'active' | 'suspended') {
    if (tenantId === null) {
      flash.problem(copy.demo);

      return;
    }

    const answer = await post('/api/platform/tenant', { tenantId, status: next }, lang);

    if (!answer.ok) {
      refused(answer.message);

      return;
    }

    onSuspend();
    flash(`${row.name} ${next === 'suspended' ? copy.suspendDone : copy.resumeDone}`);
  }

  const copyText = (value: string) => copyToClipboard(value, copy.copied);

  /**
   * A new password for the owner, because there is no old one to look up.
   *
   * `users.password` is a bcrypt hash, so "show me the password" has no honest
   * answer; this is the only one there is. What made it necessary is that there
   * was previously no answer at all — the password the create sheet prints is
   * printed once, and an operator asked for it the next day had nowhere to go,
   * on a deployment where `/forgot-password` cannot send mail either.
   *
   * Every session that account had ends with it, which the panel says before
   * the button is pressed rather than after.
   */
  async function newOwnerPassword() {
    if (tenantId === null) {
      flash.problem(copy.demo);

      return;
    }

    setSending(true);

    const answer = await post<{ owner?: { password?: unknown } }>(
      '/api/platform/tenant-password',
      { tenantId },
      lang,
    );

    setSending(false);

    if (!answer.ok) {
      refused(answer.message);

      return;
    }

    const password = answer.data.owner?.password;

    /* An answer with no password in it is a contract this console cannot
       recover from by guessing — say it failed rather than draw an empty box
       where a credential belongs. */
    if (typeof password !== 'string' || password === '') {
      refused(null);

      return;
    }

    setIssued(password);
  }

  async function movePlan(next: PlanId) {
    if (tenantId === null) {
      flash.problem(copy.demo);

      return;
    }

    setSending(true);

    const answer = await post('/api/platform/tenant', { tenantId, planKey: next }, lang);

    setSending(false);

    if (!answer.ok) {
      refused(answer.message);

      return;
    }

    setPlanNow(next);
    setAsking(null);
    flash(`${row.name} ${copy.changePlanDone}`);
  }

  async function recordPayment() {
    if (openInvoice === null) {
      flash.problem(copy.demo);

      return;
    }

    const answer = await post(
      '/api/platform/billing',
      { action: 'mark-paid', invoiceId: openInvoice },
      lang,
    );

    if (!answer.ok) {
      refused(answer.message);

      return;
    }

    onSettle();
    flash(`${row.name} ${copy.markPaidDone}`);
  }

  async function issueInvoice() {
    if (tenantId === null) {
      flash.problem(copy.demo);

      return;
    }

    const answer = await post('/api/platform/billing', { action: 'issue', tenantId }, lang);

    if (!answer.ok) {
      refused(answer.message);

      return;
    }

    /* The same confirmation whether the row was created or already existed. The
       unique index on (tenant, period) makes the second press return the
       standing invoice rather than billing twice, and both answers mean the
       same thing to the person who pressed: this month is billed. */
    flash(copy.sendInvoiceDone);
  }

  /**
   * Ask for the restaurant's whole archive, then watch for it.
   *
   * `POST` answers 202 — accepted, not done — because a GDPR-shaped export is
   * every table this tenant owns walked in the background and written to object
   * storage. The button therefore has two jobs and the second one is the
   * unusual part: it goes back and reads the list until the row is `ready`,
   * because nothing on a server-rendered page re-renders itself, and an
   * operator who pressed "export" and got a toast has no way of learning that
   * the file arrived four minutes later.
   *
   * The link that comes back is signed for twenty-four hours. It is offered as
   * a link rather than fetched and re-served: the URL is the credential, and a
   * console that proxied it would be a console holding somebody's entire
   * history in its own memory for no reason.
   */
  async function startExport() {
    if (tenantId === null) {
      flash.problem(copy.demo);

      return;
    }

    setExporting(true);

    const answer = await post('/api/platform/tenant-export', { tenantId }, lang);

    if (!answer.ok) {
      setExporting(false);
      refused(answer.message);

      return;
    }

    flash(`${row.name} ${copy.exportDataDone}`);
    void pollExport(tenantId);
  }

  /**
   * Poll until the archive is ready, and stop either way.
   *
   * Twelve looks, five seconds apart — a minute. An export that takes longer
   * than that is a large restaurant rather than a broken job, and the copy
   * already says it arrives by mail; a console that polled for ten minutes
   * would be a tab nobody can close and a request every five seconds from every
   * operator who ever pressed the button.
   */
  async function pollExport(tenant: number) {
    for (let look = 0; look < 12; look += 1) {
      await new Promise((resolve) => setTimeout(resolve, 5_000));

      const found = await readExports(tenant);

      if (found === null) continue;

      if (found.state === 'ready' && found.url !== null) {
        setExporting(false);
        setArchive(found);

        return;
      }

      if (found.state === 'failed') {
        setExporting(false);
        refused(null);

        return;
      }
    }

    // Still running. The row stays "queued" rather than silently going back to
    // a plain button: the job is genuinely still going, and the mail will come.
    setExporting(false);
  }

  async function archive() {
    // The typed name first, because it is the gate the design put here and it
    // is cheaper to fail than a round trip.
    if (typed.trim() !== row.name) {
      flash.problem(copy.deleteMismatch);

      return;
    }

    if (tenantId === null) {
      flash.problem(copy.demo);

      return;
    }

    const answer = await post('/api/platform/tenant-archive', { tenantId }, lang);

    if (!answer.ok) {
      refused(answer.message);

      return;
    }

    setConfirming(false);
    setDeleted(true);
    flash(`${row.name} ${copy.deleteQueued}`);
  }

  /**
   * Take a seat inside this restaurant.
   *
   * The reason is checked before anything leaves the browser so the sentence
   * lands next to the field rather than after a round trip — the version that
   * refused upstream is the version where an operator learns to type
   * `aaaaaaaaaa`. It is checked again in the route handler and again in the
   * API, because a browser enforces nothing.
   *
   * On success this session becomes the restaurant's. The navigation is a full
   * one rather than a router push: the cookie has just been swapped for
   * somebody else's token, and every server component already rendered on this
   * page was rendered against the operator's.
   */
  async function impersonate() {
    if (tenantId === null) {
      flash.problem(copy.demo);

      return;
    }

    const why = reason.trim();

    if (why.length < REASON_MIN) {
      flash.problem(copy.impersonateShort);

      return;
    }

    setSending(true);

    const answer = await post<{ redirect?: string }>(
      '/api/platform/impersonate',
      { tenantId, reason: why },
      lang,
    );

    if (!answer.ok) {
      setSending(false);
      refused(answer.message);

      return;
    }

    flash(`${row.name} ${copy.impersonateDone}`);
    window.location.assign(answer.data.redirect ?? '/dashboard');
  }

  return (
    <>
      <button
        type="button"
        onClick={onBack}
        className="text-fg-muted hover:text-fg mb-[18px] flex items-center gap-2 text-sm font-medium"
      >
        <svg
          width="15"
          height="15"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          <path d="M15 6l-6 6 6 6" />
        </svg>
        {copy.back}
      </button>

      <div className="bg-surface mb-5 rounded-lg border px-[26px] py-6">
        <div className="flex flex-wrap items-start gap-[18px]">
          <span className="bg-n-900 font-display grid size-[52px] flex-none place-items-center rounded-md text-lg font-bold tracking-[-0.03em] text-white">
            {initials(row.name)}
          </span>

          <div className="min-w-[220px] flex-1">
            <div className="flex flex-wrap items-center gap-2.5">
              <h2 className="font-display text-2xl font-semibold tracking-tight">{row.name}</h2>
              <Chip tone="brand">{PLAN_LABEL[planNow]}</Chip>
              <Chip tone={suspended ? 'danger' : trial ? 'warning' : 'success'}>
                {suspended ? copy.stateSuspended : row.stateLabel}
              </Chip>
              {deleted ? <Chip tone="danger">{copy.deleteTenant}</Chip> : null}
            </div>
            <p className="text-fg-muted mt-2 text-sm">
              {row.city} · {row.owner} · {row.phone}
            </p>

            {/* The address they sign in with, on the card itself rather than
                behind a panel: it is the single field an operator is asked for
                on a call, and it used to be on no screen at all. Pressing it
                copies it. */}
            {row.ownerEmail === null ? null : (
              <button
                type="button"
                onClick={() => void copyText(row.ownerEmail ?? '')}
                title={copy.copyHint}
                className="text-fg-muted hover:text-fg mt-1.5 max-w-full truncate font-mono text-xs underline-offset-2 hover:underline"
              >
                {row.ownerEmail}
              </button>
            )}
          </div>

          <div className="flex flex-wrap gap-2">
            {/* The outline treatment is the design's, and it is right: this is
                the one control on the product that ends up in somebody else's
                till. It opens the panel below rather than acting, because the
                reason field is the guard — see `impersonate()`. */}
            <button
              type="button"
              onClick={() => {
                setAsking(asking === 'impersonate' ? null : 'impersonate');
                setReason('');
              }}
              aria-expanded={asking === 'impersonate'}
              className="border-warning-500 text-warning-700 hover:bg-warning-50 h-[38px] rounded-md border px-4 text-sm font-semibold"
            >
              {copy.impersonate}
            </button>

            {/* The owner's login. Opens a panel rather than acting, because
                what the button behind it does is irreversible for whoever is
                signed in with the current password. */}
            <button
              type="button"
              onClick={() => {
                setAsking(asking === 'password' ? null : 'password');
                setIssued(null);
              }}
              aria-expanded={asking === 'password'}
              className="border-border hover:bg-bg-subtle h-[38px] rounded-md border px-3.5 text-sm font-medium"
            >
              {copy.credentials}
            </button>

            <button
              type="button"
              onClick={() => setAsking(asking === 'plan' ? null : 'plan')}
              aria-expanded={asking === 'plan'}
              className="border-border hover:bg-bg-subtle h-[38px] rounded-md border px-3.5 text-sm font-medium"
            >
              {copy.changePlan}
            </button>

            {row.payState !== 'paid' && !settled ? (
              <button
                type="button"
                onClick={() => void recordPayment()}
                className="border-border hover:bg-bg-subtle h-[38px] rounded-md border px-3.5 text-sm font-medium"
              >
                {copy.markPaid}
              </button>
            ) : null}

            {/* Suspending keeps every row and takes away every login —
                `ResolveTenant` resolves active tenants only — which is what
                makes the same button, relabelled, put a customer back in
                business in one request. */}
            <button
              type="button"
              onClick={() => void setStatus(suspended ? 'active' : 'suspended')}
              className="border-border text-danger-700 hover:bg-danger-50 h-[38px] rounded-md border px-3.5 text-sm font-medium"
            >
              {suspended ? copy.resume : copy.suspend}
            </button>
          </div>
        </div>

        {asking === 'impersonate' ? (
          <div className="border-warning-500/40 bg-warning-50/40 mt-[18px] rounded-md border p-4">
            <label className="mb-2 block text-sm font-semibold" htmlFor="imp-reason">
              {copy.impersonateReason}
            </label>
            <input
              id="imp-reason"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              maxLength={500}
              className="border-border-strong bg-surface text-fg h-10 w-full rounded-md border px-3 text-sm"
            />
            {/* The whole guard, stated where it is collected: who reads this,
                how long the seat lasts, and that it costs the operator their
                own session. */}
            <p className="text-fg-muted mt-2 text-xs leading-normal">{copy.impersonateHint}</p>
            <div className="mt-2.5 flex gap-2">
              <button
                type="button"
                onClick={() => setAsking(null)}
                className="border-border-strong bg-surface h-9 flex-1 rounded-md border text-sm font-semibold"
              >
                {copy.cancel}
              </button>
              <button
                type="button"
                disabled={sending}
                onClick={() => void impersonate()}
                className={`h-9 flex-1 rounded-md text-sm font-semibold text-white ${
                  reason.trim().length >= REASON_MIN && !sending ? 'bg-warning-600' : 'bg-n-300'
                }`}
              >
                {copy.impersonate}
              </button>
            </div>
          </div>
        ) : null}

        {asking === 'password' ? (
          <div className="border-border bg-bg-subtle mt-[18px] rounded-md border p-4">
            <span className="block text-sm font-semibold">{copy.credentialsTitle}</span>

            {row.ownerEmail === null ? (
              /* A real state, not an error: a restaurant whose only owner was
                 deactivated, or one archived before anybody signed in. Said
                 plainly, because the next thing the operator does about it is
                 not on this screen. */
              <p className="text-fg-muted mt-2 text-sm leading-normal">{copy.credentialsNone}</p>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => void copyText(row.ownerEmail ?? '')}
                  title={copy.copyHint}
                  className="bg-surface border-border text-fg mt-2.5 block max-w-full truncate rounded-md border px-3 py-2 font-mono text-sm"
                >
                  {row.ownerEmail}
                </button>

                {/* Why there is no "show the password" button, in the place
                    somebody would look for one. */}
                <p className="text-fg-muted mt-2.5 text-xs leading-normal">
                  {copy.credentialsHint}
                </p>

                {issued === null ? null : (
                  <div className="border-warning-500/40 bg-warning-50/40 mt-3.5 rounded-md border p-3.5">
                    <p className="text-sm font-semibold">{copy.createdPassword}</p>
                    {/* Large, monospaced and copyable — the same treatment the
                        crew app's PIN gets, and for the same reason: this is
                        read out loud across a room, where l, 1 and I are the
                        same character in a proportional face. */}
                    <button
                      type="button"
                      data-num
                      onClick={() => void copyText(issued)}
                      title={copy.copyHint}
                      className="mt-2 block max-w-full text-left font-mono text-lg font-semibold break-all"
                    >
                      {issued}
                    </button>
                  </div>
                )}

                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setAsking(null);
                      setIssued(null);
                    }}
                    className="border-border-strong bg-surface h-9 min-w-[120px] flex-1 rounded-md border text-sm font-semibold"
                  >
                    {copy.cancel}
                  </button>
                  <button
                    type="button"
                    disabled={sending}
                    onClick={() => void newOwnerPassword()}
                    className={`h-9 min-w-[160px] flex-1 rounded-md text-sm font-semibold text-white ${
                      sending ? 'bg-n-300' : 'bg-warning-600'
                    }`}
                  >
                    {issued === null ? copy.newPassword : copy.newPasswordAgain}
                  </button>
                </div>
              </>
            )}
          </div>
        ) : null}

        {asking === 'plan' ? (
          <div className="border-border bg-bg-subtle mt-[18px] rounded-md border p-4">
            <span className="mb-2.5 block text-sm font-semibold">{copy.fieldPlan}</span>
            <div className="grid grid-cols-3 gap-2">
              {PLANS.map((entry) => (
                <button
                  key={entry.id}
                  type="button"
                  disabled={sending}
                  aria-pressed={planNow === entry.id}
                  onClick={() => void movePlan(entry.id)}
                  className={`flex min-h-[72px] flex-col items-start justify-center gap-[5px] rounded-md border px-3.5 py-3 ${
                    planNow === entry.id
                      ? 'border-brand-500 bg-brand-50 text-brand-700'
                      : 'border-border bg-surface text-fg'
                  }`}
                >
                  <span className="text-sm font-semibold">{entry.label}</span>
                  <span data-num className="text-fg-subtle text-xs">
                    {money(entry.price)}
                  </span>
                </button>
              ))}
            </div>
          </div>
        ) : null}

        <div className="mt-[22px] grid [grid-template-columns:repeat(auto-fit,minmax(min(150px,100%),1fr))] gap-3">
          {[
            [copy.subscription, row.mrr],
            [copy.branchCount, String(row.branches)],
            [copy.userCount, String(row.users)],
            [copy.since, row.since],
            [copy.nextBill, row.nextInvoice],
            [copy.lastSeen, row.seen],
          ].map(([label, value]) => (
            <div key={label} className={FIGURE}>
              <div className="text-2xs text-fg-subtle mb-1.5">{label}</div>
              <div data-num className="text-md font-semibold">
                {value}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* -------------------------------------------- branches and the people */}
      <div
        data-split
        className="mb-5 grid [grid-template-columns:minmax(0,1.4fr)_minmax(0,1fr)] items-start gap-5"
      >
        <section data-group data-table>
          <div className="flex items-baseline justify-between gap-3 px-5 pt-[18px] pb-3">
            <h3 data-glabel>{copy.branchesTitle}</h3>
            <span data-num className="text-fg-subtle text-xs">
              {branches.length}
            </span>
          </div>

          {detailPending ? (
            <p className="text-fg-subtle px-5 pb-[18px] text-sm">{copy.detailLoading}</p>
          ) : detailFailed ? (
            <p className="text-danger-700 px-5 pb-[18px] text-sm">{copy.detailFailed}</p>
          ) : branches.length === 0 ? (
            /* A live empty list is an empty list. This is the state a
               restaurant provisioned without a venue is actually in, and it is
               the one an operator has to be able to see. */
            <p className="text-fg-subtle px-5 pb-[18px] text-sm">{copy.noBranches}</p>
          ) : (
            <>
              <div
                className={`text-fg-subtle text-2xs tracking-caps grid ${BRANCH_COLUMNS} gap-3.5 px-5 pb-2 font-semibold uppercase`}
              >
                <span>{copy.colBranch}</span>
                <span className="text-right">{copy.colSeats}</span>
                <span className="text-right">{copy.colAccounts}</span>
                <span>{copy.colStatus}</span>
              </div>

              {branches.map((branch) => (
                <div
                  key={branch.key}
                  data-grouprow
                  className={`grid ${BRANCH_COLUMNS} items-center gap-3.5`}
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium">{branch.name}</span>
                    <span className="text-fg-subtle mt-0.5 block truncate text-xs">
                      {branch.city}
                    </span>
                  </span>
                  <span data-num className="text-fg-muted text-right text-sm">
                    {branch.seats}
                  </span>
                  <span data-num className="text-fg-muted text-right text-sm">
                    {branch.accounts}
                  </span>
                  <span>
                    {/* Only a venue that is NOT trading wears a tone. A live
                        one is the expected state and gets the word in
                        graphite. */}
                    {branch.state === 'live' && !suspended ? (
                      <span className="text-fg-muted text-xs">{copy.stateLive}</span>
                    ) : (
                      <Chip tone={branch.state === 'setup' ? 'warning' : 'danger'}>
                        {branch.state === 'setup'
                          ? copy.stateSetup
                          : suspended
                            ? copy.stateSuspended
                            : copy.stateSuspended}
                      </Chip>
                    )}
                  </span>
                </div>
              ))}
            </>
          )}
        </section>

        <section data-group>
          <div className="flex items-baseline justify-between gap-3 px-5 pt-[18px] pb-3">
            <h3 data-glabel>{copy.usersTitle}</h3>
            <span data-num className="text-fg-subtle text-xs">
              {people.length}
            </span>
          </div>

          {detailPending ? (
            <p className="text-fg-subtle px-5 pb-[18px] text-sm">{copy.detailLoading}</p>
          ) : detailFailed ? (
            <p className="text-danger-700 px-5 pb-[18px] text-sm">{copy.detailFailed}</p>
          ) : (
            people.map((user) => (
              <div key={user.key} data-grouprow className="flex items-center gap-3">
                <span className="bg-bg-muted text-fg-muted text-2xs grid size-[30px] flex-none place-items-center rounded-full font-semibold">
                  {initials(user.name)}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{user.name}</span>
                  <span className="text-fg-subtle mt-px block truncate text-xs">{user.role}</span>
                </span>
                {/* The date this account last signed in, or the fact that it
                    never has. Both are answers; the phrase that used to sit
                    here was neither, because it came off a rotating list. */}
                <span className="text-fg-subtle flex-none text-xs whitespace-nowrap">
                  {user.inactive ? copy.inactive : user.seen}
                </span>
              </div>
            ))
          )}
        </section>
      </div>

      {/* ----------------------------------------------------------- invoices */}
      <section className="bg-surface overflow-hidden rounded-lg border" data-table>
        <div className="border-divider border-b px-[22px] pt-[18px] pb-3.5">
          <h3 className="text-md tracking-snug font-semibold">{copy.invoicesTitle}</h3>
        </div>

        <div
          className={`bg-bg-subtle text-fg-subtle grid ${INVOICE_COLUMNS} gap-4 border-b px-[22px] py-2.5 text-xs font-semibold`}
        >
          <span>{copy.colInvoice}</span>
          <span>{copy.colDate}</span>
          <span className="text-right">{copy.colAmount}</span>
          <span>{copy.colMethod}</span>
          <span>{copy.colStatus}</span>
        </div>

        {invoices.map((invoice) => (
          <div
            key={invoice.id}
            data-row
            className={`border-divider grid ${INVOICE_COLUMNS} items-center gap-4 border-b px-[22px] py-3`}
          >
            <span className="text-fg-muted font-mono text-xs">{invoice.id}</span>
            <span data-num className="text-fg-muted text-sm">
              {invoice.date}
            </span>
            <span data-num className="text-right text-sm font-semibold">
              {invoice.amount}
            </span>
            <span className="text-fg-muted text-sm">{invoice.method}</span>
            <span>
              <Chip tone={invoice.tone}>{invoice.label}</Chip>
            </span>
          </div>
        ))}
      </section>

      {/* --------------------------------------------- flags and the endings */}
      <div
        data-split
        className="mt-5 grid [grid-template-columns:minmax(0,1fr)_minmax(0,1fr)] gap-5"
      >
        {/*
         * The four flags, and why none of them is a switch this card owns.
         *
         * The design draws four toggles on the tenant card, which reads as a
         * per-restaurant override. There is no such thing on this platform and
         * it is not a missing endpoint: a feature is a property of the PLAN —
         * `platform_plans.features`, edited on /platform/plans — and a tenant
         * holds a `plan_key`. So the only honest lever from here is the plan
         * itself, which is the button in the header, and giving one restaurant
         * loyalty without moving it onto a tier that includes loyalty would be
         * giving away the thing the tier is sold for.
         *
         * The toggles therefore report rather than command: they show what the
         * plan includes, and pressing one says where the lever is. Left as
         * switches instead of a plain list because the state they show — on or
         * off, per feature — is exactly what the design draws, and a reader
         * scanning for "does this customer have KDS" finds the same shape.
         */}
        <section className="bg-surface rounded-lg border px-6 py-[22px]">
          <h3 className="text-md tracking-snug mb-1.5 font-semibold">{copy.features}</h3>
          <p className="text-fg-subtle mb-3.5 text-xs leading-normal">{copy.featureNote}</p>

          {FEATURES.map((key) => {
            const on = row.features.includes(key);

            return (
              <div key={key} className="border-divider flex items-center gap-4 border-b py-3">
                <span className="flex-1 text-sm">{copy.featureNames[key]}</span>
                {/*
                 * A chip, not a switch. It was drawn as a working toggle —
                 * `role="switch"`, the right `aria-checked`, the brand fill —
                 * and refused on press, so an operator enabling KDS for a
                 * customer got a "no" from a control that looked live. This
                 * list is a READING of `restaurants.features`; the lever is
                 * `PATCH /v1/modules/{key}` inside the restaurant's own console,
                 * which is where a module is switched on and where the audit
                 * row belongs.
                 */}
                <StatusChip tone={on ? 'success' : 'neutral'} dot className="flex-none">
                  {on ? copy.featureOn : copy.featureOff}
                </StatusChip>
              </div>
            );
          })}
        </section>

        <section className="bg-surface rounded-lg border px-6 py-[22px]">
          <h3 className="text-md tracking-snug mb-1.5 font-semibold">{copy.actions}</h3>
          <p className="text-fg-subtle mb-[18px] text-xs leading-normal">{copy.actionsSub}</p>

          <div className="flex flex-col gap-2">
            <button
              type="button"
              onClick={() => void issueInvoice()}
              className="border-border hover:bg-bg-subtle grid h-[42px] place-items-center rounded-md border text-sm font-medium"
            >
              {copy.sendInvoice}
            </button>

            {/*
             * Three states on one control, because the archive has three.
             *
             * Asking is a button; waiting is the same button saying so and
             * refusing a second press — starting two exports of the same
             * restaurant is two copies of every table for nothing; ready is a
             * LINK, because what came back is a signed URL and the honest thing
             * to do with a download is offer it rather than describe it.
             */}
            {archived !== null && archived.url !== null ? (
              <a
                href={archived.url}
                className="border-success-500/40 bg-success-50 text-success-700 grid h-[42px] place-items-center rounded-md border text-sm font-medium"
              >
                {copy.exportDownload}
              </a>
            ) : (
              <button
                type="button"
                disabled={exporting}
                onClick={() => void startExport()}
                className={`border-border grid h-[42px] place-items-center rounded-md border text-sm font-medium ${
                  exporting ? 'text-fg-subtle' : 'hover:bg-bg-subtle'
                }`}
              >
                {exporting ? copy.exportQueued : copy.exportData}
              </button>
            )}

            <button
              type="button"
              onClick={() => {
                setConfirming(true);
                setTyped('');
              }}
              className="border-border text-danger-700 hover:bg-danger-50 grid h-[42px] place-items-center rounded-md border text-sm font-medium"
            >
              {copy.deleteTenant}
            </button>
          </div>

          {/* Typing the name is the design's own gate, and it is the right one:
              deletion here takes a restaurant's entire history offline, and a
              confirm dialog answered by muscle memory is not a decision. */}
          {confirming ? (
            <div className="border-danger-500/40 bg-danger-50/40 mt-4 rounded-md border p-3.5">
              <label className="mb-2 block text-xs font-semibold" htmlFor="del-confirm">
                {copy.deleteConfirm}
              </label>
              <input
                id="del-confirm"
                value={typed}
                onChange={(event) => setTyped(event.target.value)}
                placeholder={row.name}
                className="border-border-strong bg-surface text-fg h-10 w-full rounded-md border px-3 text-sm"
              />
              <div className="mt-2.5 flex gap-2">
                <button
                  type="button"
                  onClick={() => setConfirming(false)}
                  className="border-border-strong bg-surface h-9 flex-1 rounded-md border text-sm font-semibold"
                >
                  {copy.cancel}
                </button>
                {/* Soft, and the ninety-day window the copy promises is a
                    window on data that still exists: the row's status becomes
                    `archived` and nothing is removed, because every invoice and
                    every order ever taken still points at this id. */}
                <button
                  type="button"
                  onClick={() => void archive()}
                  className={`h-9 flex-1 rounded-md text-sm font-semibold text-white ${
                    typed.trim() === row.name ? 'bg-danger-500' : 'bg-n-300'
                  }`}
                >
                  {copy.deleteTenant}
                </button>
              </div>
            </div>
          ) : null}
        </section>
      </div>
    </>
  );
}

/* ------------------------------------------------------ the create form */

/**
 * What `POST /platform/tenants` answers with, narrowed to what this sheet uses.
 *
 * The password is in the body and nowhere else, ever — the same rule the
 * terminal pairing code follows, and for the same reason: a secret that can be
 * fetched again is a secret with no owner. So it has to reach the screen before
 * the operator navigates away, which is why this sheet reads the answer rather
 * than posting and closing.
 */
type CreatedTenant = {
  data?: { id?: unknown; tenant_id?: unknown; name?: unknown; since?: unknown };
  owner?: { email?: unknown; password?: unknown };
};

const asText = (value: unknown): string | null =>
  typeof value === 'string' && value !== '' ? value : null;

/** `YYYY-MM-DD` from the API into the `dd.mm.yyyy` this console prints. */
function readable(iso: string | null): string {
  if (iso === null) return '—';

  const parts = iso.slice(0, 10).split('-');

  // An em dash rather than a half-parsed date. A console that prints
  // `undefined.08.2026` next to a customer's name is a console nobody trusts
  // the rest of the row from.
  return parts.length === 3 ? `${parts[2]}.${parts[1]}.${parts[0]}` : '—';
}

/**
 * The one call that puts a restaurant on the platform.
 *
 * It creates three things in one transaction upstream — the business, its owner
 * account and its trial — so this sheet is the only place any of them is typed.
 * The city is collected and deliberately not sent: a tenant has no address
 * column, and the platform list shows the city of whichever venue a restaurant
 * has most of. See `app/api/platform/tenants/route.ts`.
 *
 * The row handed back is built from the answer, not from the form. The slug and
 * the numeric key are the server's to decide, and a locally invented id would
 * be a row whose every button then refused itself as a fixture.
 */
function AddRestaurant({
  copy,
  lang,
  onClose,
  onCreate,
}: {
  copy: TenantCopy;
  lang: 'uz' | 'ru' | 'en';
  onClose: () => void;
  onCreate: (row: TenantRow) => void;
}) {
  const [name, setName] = useState('');
  const [owner, setOwner] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [city, setCity] = useState<(typeof FORM_CITIES)[number]>('tashkent');
  const [plan, setPlan] = useState<PlanId>('growth');
  const [sending, setSending] = useState(false);

  /* The owner's credentials, once. Set only after the API has answered, and
     it is what the sheet shows instead of the form from then on. */
  const [issued, setIssued] = useState<{
    email: string;
    password: string;
    row: TenantRow;
  } | null>(null);

  const chosen = PLANS.find((entry) => entry.id === plan) ?? PLANS[1];
  const ready = name.trim() !== '' && owner.trim() !== '' && email.trim() !== '';

  const create = async () => {
    if (!ready) {
      flash.problem(copy.createIncomplete);

      return;
    }

    setSending(true);

    const answer = await post<CreatedTenant>(
      '/api/platform/tenants',
      {
        restaurant: name.trim(),
        owner: owner.trim(),
        email: email.trim(),
        phone: phone.trim(),
        planKey: plan,
        // The city becomes the first venue's city — the tenant itself has no
        // address, and the list reads the city back off the venues.
        city: copy.cities[city],
      },
      lang,
    );

    setSending(false);

    /* A refusal keeps the sheet open with everything still typed in it. The one
       that actually happens is an address already on the platform, and clearing
       the form would make somebody retype five fields to change one of them. */
    if (!answer.ok) {
      flash.problem(answer.message ?? copy.failed);

      return;
    }

    const created = answer.data.data ?? {};
    const slug = asText(created.id);
    const key = typeof created.tenant_id === 'number' ? created.tenant_id : null;
    const flags = defaultFeatures(chosen.id, 1);

    const made: TenantRow = {
      id: slug ?? name.trim().toLowerCase().replace(/\s+/g, '-'),
      tenantId: key,
      name: asText(created.name) ?? name.trim(),
      city: copy.cities[city],
      plan: chosen.label,
      planId: chosen.id,
      branches: 1,
      users: 1,
      mrr: formatTiyinAmount(chosen.price, lang),
      mrrRaw: chosen.price,
      pay: copy.payPaid,
      payState: 'paid',
      payTone: 'warning',
      owner: owner.trim(),
      ownerEmail: asText(answer.data.owner?.email) ?? email.trim(),
      phone: phone.trim() || '—',
      since: readable(asText(created.since)),
      /* Not billed yet, and no date to print. The card's own "issue invoice"
         button is what raises the first one — inventing a due date here would
         be a promise about money the books have never heard of. */
      nextInvoice: '—',
      seen: copy.seen[0],
      state: 'trial',
      stateLabel: copy.stateSetup,
      problem: false,
      /* One branch, unnamed and unstaffed until somebody opens it. Inventing a
         seat count for a restaurant created thirty seconds ago would put a
         number on the platform's own dashboard that nobody ever measured. */
      branchRows: [{ name: copy.branchesTitle, city, seats: 0, staff: 0, revenue: 0 }],
      pool: [],
      ownerRole: copy.fieldOwner,
      invoiceOffset: 0,
      invoices: [],
      /* Whatever the chosen plan includes. The card reads the flags off the
         plan, and this restaurant has just been put on one. */
      features: FEATURES.filter((flag) => flags[flag]),
    };

    flash(`${name.trim()} ${copy.createDone}`);

    const password = asText(answer.data.owner?.password);

    /*
     * The password stays on the screen, not in a toast.
     *
     * `flash()` is one at a time and gone in under three seconds, and this
     * string exists in exactly one place in the world from here on — there is
     * no endpoint that will show it again. So the sheet stays open holding it
     * and the list only opens once the operator has closed it deliberately.
     */
    if (password === null) {
      onCreate(made);

      return;
    }

    setIssued({
      email: asText(answer.data.owner?.email) ?? email.trim(),
      password,
      row: made,
    });
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-6">
      <button
        type="button"
        aria-label={copy.cancel}
        onClick={onClose}
        data-scrim
        className="absolute inset-0 bg-[rgba(15,19,32,.4)] backdrop-blur-[2px]"
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-label={copy.addTitle}
        data-sheet
        data-scroll
        className="bg-surface-raised relative max-h-[88vh] w-[560px] max-w-full overflow-auto rounded-xl border shadow-xl"
      >
        <div className="border-divider border-b px-[26px] pt-6 pb-[18px]">
          <h3 className="font-display tracking-snug text-xl font-semibold">{copy.addTitle}</h3>
          <p className="text-fg-muted mt-1.5 text-sm">{copy.addSub}</p>
        </div>

        {issued !== null ? (
          <div className="px-[26px] py-[22px]">
            <div className="border-warning-500/40 bg-warning-50/40 rounded-md border p-4">
              <p className="text-sm font-semibold">{copy.createdPassword}</p>
              <p data-num className="mt-2.5 font-mono text-sm break-all">
                {issued.email}
              </p>
              <p data-num className="mt-1 font-mono text-lg font-semibold break-all">
                {issued.password}
              </p>
            </div>
          </div>
        ) : (
          <div className="px-[26px] py-[22px]">
            <label className="mb-2 block text-sm font-semibold" htmlFor="new-name">
              {copy.fieldName}
            </label>
            <input
              id="new-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder={copy.namePlaceholder}
              className="bg-bg-subtle border-border text-md mb-5 h-[46px] w-full rounded-md border px-3.5"
            />

            <div className="mb-5 grid grid-cols-2 gap-3.5">
              <div>
                <label className="mb-2 block text-sm font-semibold" htmlFor="new-owner">
                  {copy.fieldOwner}
                </label>
                <input
                  id="new-owner"
                  value={owner}
                  onChange={(event) => setOwner(event.target.value)}
                  placeholder={copy.ownerPlaceholder}
                  className="bg-bg-subtle border-border text-md h-[46px] w-full rounded-md border px-3.5"
                />
              </div>
              <div>
                <label className="mb-2 block text-sm font-semibold" htmlFor="new-phone">
                  {copy.fieldPhone}
                </label>
                <input
                  id="new-phone"
                  value={phone}
                  onChange={(event) => setPhone(event.target.value)}
                  placeholder="+998 90 000 00 00"
                  className="bg-bg-subtle border-border text-md h-[46px] w-full rounded-md border px-3.5"
                />
              </div>
            </div>

            {/* The address the owner signs in with, and the only field here the
                platform enforces uniqueness on: two accounts sharing one would
                make the login ambiguous at exactly the moment there is no
                tenant context to disambiguate it. */}
            <label className="mb-2 block text-sm font-semibold" htmlFor="new-email">
              {copy.fieldEmail}
            </label>
            <input
              id="new-email"
              type="email"
              inputMode="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder={copy.emailPlaceholder}
              className="bg-bg-subtle border-border text-md mb-5 h-[46px] w-full rounded-md border px-3.5"
            />

            <span className="mb-2.5 block text-sm font-semibold">{copy.fieldCity}</span>
            <div className="mb-[22px] flex flex-wrap gap-2">
              {FORM_CITIES.map((key) => (
                <button
                  key={key}
                  type="button"
                  aria-pressed={city === key}
                  onClick={() => setCity(key)}
                  className={`rounded-pill h-[38px] border px-3.5 text-sm font-medium ${
                    city === key
                      ? 'border-brand-500 bg-brand-50 text-brand-700'
                      : 'border-border bg-surface text-fg-muted'
                  }`}
                >
                  {copy.cities[key]}
                </button>
              ))}
            </div>

            <span className="mb-2.5 block text-sm font-semibold">{copy.fieldPlan}</span>
            <div className="grid grid-cols-3 gap-2">
              {PLANS.map((entry) => (
                <button
                  key={entry.id}
                  type="button"
                  aria-pressed={plan === entry.id}
                  onClick={() => setPlan(entry.id)}
                  className={`flex min-h-[72px] flex-col items-start justify-center gap-[5px] rounded-md border px-3.5 py-3 ${
                    plan === entry.id
                      ? 'border-brand-500 bg-brand-50 text-brand-700'
                      : 'border-border bg-surface text-fg'
                  }`}
                >
                  <span className="text-sm font-semibold">{entry.label}</span>
                  <span data-num className="text-fg-subtle text-xs">
                    {formatTiyinAmount(entry.price, lang)}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="border-divider flex gap-2.5 border-t px-[26px] pt-[18px] pb-[22px]">
          {issued === null ? (
            <>
              <button
                type="button"
                onClick={onClose}
                className="border-border grid h-12 flex-1 place-items-center rounded-md border text-sm font-semibold"
              >
                {copy.cancel}
              </button>
              <button
                type="button"
                disabled={sending}
                onClick={() => void create()}
                className="bg-brand-500 hover:bg-brand-600 grid h-12 flex-[1.5] place-items-center rounded-md text-sm font-semibold text-white"
              >
                {copy.create}
              </button>
            </>
          ) : (
            /* One way out, and it is the one that hands the row to the list.
               The scrim still closes the sheet, and that is acceptable: the
               restaurant exists either way, and the password can be reset from
               the owner's own sign-in — it just cannot be read again. */
            <button
              type="button"
              onClick={() => onCreate(issued.row)}
              className="bg-brand-500 hover:bg-brand-600 grid h-12 flex-1 place-items-center rounded-md text-sm font-semibold text-white"
            >
              {copy.back}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------- helpers */

function initials(name: string): string {
  return name
    .split(' ')
    .map((part) => part[0])
    .join('')
    .slice(0, 2);
}

type CardUser = PlatformUser & { seen: string };

/**
 * Who to show, and how long ago each of them was here.
 *
 * The owner takes the first row — the platform operator is checking that the
 * person they are about to phone still signs in — and the pool fills the rest.
 */
function usersFor(row: TenantRow, copy: TenantCopy): readonly CardUser[] {
  const count = Math.max(4, Math.min(8, Math.round(row.users / 9)));

  return row.pool.slice(0, count).map((user, index) => ({
    name: index === 0 ? row.owner : user.name,
    role: index === 0 ? row.ownerRole : user.role,
    seen: copy.seen[index] ?? copy.seen[copy.seen.length - 1],
  }));
}

/** One row of the card's invoice table, whichever of the two sources it came from. */
type CardInvoice = {
  /** The numeric key, or `null` on a generated row — see `TenantInvoice`. */
  key: number | null;
  id: string;
  date: string;
  amount: string;
  method: string;
  label: string;
  tone: ChipTone;
  /** Still owed. What the header's "record payment" aims at. */
  outstanding: boolean;
};

/** The API's three words for an invoice, against the console's three chips. */
const INVOICE_CHIP: Readonly<Record<InvoiceState, ChipTone>> = {
  paid: 'success',
  dunning: 'warning',
  failed: 'danger',
};

/**
 * The invoices this restaurant has, or the six the design generates.
 *
 * Live rows win whenever the billing endpoint sent any, because they are what
 * "record payment" is aimed at and a table of invented numbers beside a button
 * that settles a real one is a screen nobody can reconcile from. The generated
 * six stay as the fallback: a console with no session is a demo, and an empty
 * invoice table would read as a customer who has never been billed.
 *
 * The generator's own rule is kept — only the newest row can be anything but
 * paid. An unpaid invoice from March would mean a tenant running unbilled for
 * five months, which is a different and much louder problem than this screen
 * reports.
 *
 * Live rows carry no payment method. There is no column for one: the platform
 * takes no card, an operator reconciles a bank statement, and printing "Payme"
 * against a row nobody paid through Payme would be inventing a fact about
 * money. The generated rows keep the design's cycle, because they are visibly
 * a sample.
 */
function invoicesFor(
  row: TenantRow,
  copy: TenantCopy,
  settled: boolean,
  lang: 'uz' | 'ru' | 'en',
): readonly CardInvoice[] {
  const label: Readonly<Record<InvoiceState, string>> = {
    paid: copy.payPaid,
    dunning: copy.payLate,
    failed: copy.payFailing,
  };

  if (row.invoices.length > 0) {
    /* The oldest thing still owed is what the header settles, so it is the one
       row this overlay may turn green — see `openInvoice`. */
    const justPaid = settled
      ? (row.invoices.filter((invoice) => invoice.state !== 'paid').at(-1)?.id ?? null)
      : null;

    return row.invoices.map((invoice): CardInvoice => {
      const state = invoice.id === justPaid ? 'paid' : invoice.state;

      return {
        key: invoice.key,
        id: invoice.id,
        date: invoice.date,
        amount: formatTiyinAmount(invoice.amount, lang),
        method: '—',
        label: label[state],
        tone: INVOICE_CHIP[state],
        outstanding: state !== 'paid',
      };
    });
  }

  const dates = [
    '01.08.2026',
    '01.07.2026',
    '01.06.2026',
    '01.05.2026',
    '01.04.2026',
    '01.03.2026',
  ];
  const methods = [copy.methodBank, 'Payme', copy.methodCard];

  const newest: InvoiceState = settled
    ? 'paid'
    : row.payState === 'late'
      ? 'dunning'
      : row.payState === 'failing'
        ? 'failed'
        : 'paid';

  return dates.map((date, index): CardInvoice => {
    const state = index === 0 ? newest : 'paid';

    return {
      key: null,
      id: `INV-2026-${812 - index * 7 + row.invoiceOffset}`,
      date,
      amount: row.mrr,
      method: methods[index % 3],
      label: label[state],
      tone: INVOICE_CHIP[state],
      outstanding: state !== 'paid',
    };
  });
}
