import { apiGet } from '@/lib/api-server';
import { getSession } from '@/lib/session';

import type { SettingsCopy } from './settings-copy';

/**
 * The settings screen's real figures, laid over the copy the panels read.
 *
 * Server half of ./settings-copy.ts, split per the house rule: types and
 * fixtures in the `*-data.ts` / `*-copy.ts` pair, anything that calls the
 * server in a sibling only server components import.
 *
 * Six reads, and each one replaces a block that looked configured when it was
 * not. The requisites are the clearest case: the receipt preview drew
 * "SMART RESTAURANT · STIR 302 458 719" for every restaurant on the platform,
 * which is not a placeholder a manager notices — it looks exactly like a
 * configured value. The same was true of the till the idle-screen preview is
 * aimed at, of the printers a test docket goes to, and of the zones the floor
 * is divided into.
 *
 * What is deliberately NOT read here is anything a module owns and this screen
 * only mirrors — the day's takings per payment method, the entry count behind
 * an expense category. Those belong to Finance and reaching across for them
 * would put six modules' shapes in one file.
 *
 * ---------------------------------------------------------------------------
 * Paths have no `/v1` on them
 *
 * `apiBase()` already ends `.../api/v1` (see `lib/server-session.ts`), so a
 * path written as `/v1/settings` asks for `/api/v1/v1/settings` and gets a 404
 * — which `apiGet` answers as `null`, which every screen renders as its
 * fixture. That is the failure this file shipped with: three "live" reads that
 * had never once returned a row, and nothing on the screen said so, because
 * falling back to fixtures is exactly what a healthy console does when the API
 * is restarting.
 */

/** What `GET /api/v1/settings` answers, narrowed to what this screen draws. */
type ApiSettings = {
  data: {
    name: string;
    settings: {
      legal?: {
        name?: string;
        tax_id?: string;
        address?: string;
        /** The rate the receipt prints, as the requisites panel records it. */
        vat_percent?: number;
      };
      brand?: { name?: string };
      service_charge_percent?: number;
      service_charge_auto?: boolean;
      /*
       * The house rules the console's own switches write.
       *
       * Absent until somebody sets one, and absent means "the platform's
       * default", which is not always `false` — a paper docket is printed
       * unless a kitchen switches it off. So the seam has to know each
       * default rather than treating a missing key as an off switch, or the
       * screen would draw a rule the opposite way round from the one the API
       * is enforcing. `config/settings.php` is where the defaults are declared;
       * `POLICY_DEFAULTS` below is this side's copy of the three it draws.
       */
      policies?: {
        auto_close_table_after_payment?: boolean;
        void_sent_needs_manager_pin?: boolean;
        kds_late_minutes?: number;
        kds_paper_docket?: boolean;
      };
    };
  };
};

/**
 * What `GET /api/v1/kitchen/printers` answers.
 *
 * `target` rather than a host and a port: the column holds whatever the
 * connection needs — `192.168.100.152:9100` for a network head, an agent's own
 * name for a USB one — and splitting it here would mean this screen deciding
 * what a valid address looks like for a transport it does not own.
 */
type ApiPrinter = {
  id: number;
  name: string;
  role: string | null;
  target: string | null;
  state?: string;
  last_seen_at?: string | null;
};

/**
 * One row of `GET /api/v1/kitchen/printers/health`.
 *
 * Read alongside the list rather than instead of it, because the two answer
 * different halves of the same table: the list carries the address, and only
 * health knows the queue depth — and the depth is the column a manager acts on
 * when a printer has stopped and dockets are stacking up behind it.
 */
type ApiPrinterHealth = { id: number; state: string; queued: number };

/** What `GET /api/v1/pos/terminals` answers, narrowed to the identity panel. */
type ApiTerminal = {
  id: number;
  code: string;
  name: string;
  status: string;
  is_paired: boolean;
  is_online: boolean;
  app_version: string | null;
  branch?: { id: number; name: string } | null;
};

/** What `GET /api/v1/tables/halls` answers. `capacity` is the seat count. */
type ApiHall = {
  id: number;
  name: string;
  capacity: number | null;
  tables_count?: number;
};

/** What `GET /api/v1/payments/providers` answers — the console's view. */
type ApiProvider = { id: string; available: boolean };

/**
 * One row of `GET /api/v1/finance/payment-methods`.
 *
 * `id` is null for a tender the restaurant has never configured — the endpoint
 * answers the platform's own default for every one of the eleven, so a settings
 * panel is never empty and nobody is invited to add `cash` a second time.
 *
 * `fee_bps` is the negotiated rate and `effective_fee_bps` is what the bank will
 * actually keep; both are published because null and zero are different claims —
 * "no rate agreed" and "this rail is free" — and a screen that could not tell
 * them apart would show a dash where 1.2% is being charged.
 */
type ApiPaymentMethod = {
  id: number | null;
  method: string;
  title: string;
  kind: string;
  is_fiscal: boolean;
  fee_bps: number | null;
  effective_fee_bps: number;
  gateway: string | null;
  is_enabled: boolean;
  position: number;
};

/** One row of `GET /api/v1/finance/expense-categories?with_counts=1`. */
type ApiExpenseCategory = {
  id: number | null;
  code: string;
  title: string;
  direction: 'in' | 'out';
  is_system: boolean;
  archived_at: string | null;
  entries_count?: number;
  entries_total?: number;
};

/**
 * One row of `GET /api/v1/finance/cash-book`, narrowed to what the share column
 * needs: which tender, and how much of it.
 */
type ApiBookEntry = { source: string; method: string; amount: number };

/**
 * The screen, plus the one id that is not part of any drawn row.
 *
 * `SettingsCopy` is the shape `settings-panels.tsx` reads and it is frozen —
 * it is assembled from the catalogue and the fixtures, and widening it would
 * mean widening `settings-copy.ts` for a field the fixture console has no
 * value for. So the terminal rides beside it: the identity rows show its name
 * and branch, and the preview button needs its id.
 */
export type SettingsScreen = SettingsCopy & {
  /** The till a preview is pushed to, or `null` when the console has none. */
  till: { id: number; name: string; online: boolean } | null;
};

/**
 * Everything on this screen that the restaurant itself decides.
 *
 * Returns the copy unchanged when there is no session or the API is down —
 * `apiGet` answers `null` for both — so the screen keeps working and keeps
 * showing the demo it was built against.
 */
export async function settingsScreen(copy: SettingsCopy): Promise<SettingsScreen> {
  // Today's trading day, on the reader's own clock. The cash book is what the
  // share column is computed from and it takes a window, not a period word.
  const today = new Date().toISOString().slice(0, 10);

  const [
    live,
    printers,
    health,
    terminals,
    halls,
    providers,
    tenders,
    categories,
    book,
    roles,
    session,
  ] = await Promise.all([
    apiGet<ApiSettings>('/settings'),
    apiGet<{ data: ApiPrinter[] }>('/kitchen/printers'),
    apiGet<{ printers: ApiPrinterHealth[] }>('/kitchen/printers/health'),
    apiGet<{ data: ApiTerminal[] }>('/pos/terminals?per_page=100'),
    apiGet<{ data: ApiHall[] }>('/tables/halls?per_page=100'),
    apiGet<{ data: ApiProvider[] }>('/payments/providers'),
    apiGet<{ data: ApiPaymentMethod[] }>('/finance/payment-methods'),
    apiGet<{ data: ApiExpenseCategory[] }>('/finance/expense-categories?with_counts=1'),
    apiGet<{ entries: ApiBookEntry[] }>(`/finance/cash-book?from=${today}&to=${today}`),
    /*
     * The discount ceilings, from the one place that decides them.
     *
     * `GET /api/v1/roles` reads `Terminal.settings.discount_limits` through
     * `App\Contracts\Pos\DiscountLimits` — the same store `ApprovalGate`
     * reads at the till. The three rows in the "Chegirmalar va huquqlar"
     * group used to state 5% and 20% from the catalogue, which is exactly the
     * drift CLAUDE.md documents as having happened four times: a console that
     * states one ceiling while the till enforces another.
     *
     * `null` for a reader without `roles.manage`, which is most of them, and
     * then the rows keep the catalogue's sentence.
     */
    apiGet<{ data: ApiRole[] }>('/roles'),
    getSession(),
  ]);

  const terminal = chooseTerminal(terminals?.data);

  const legal = live?.data.settings.legal;
  const limits = new Map(
    (roles?.data ?? []).map((role) => [role.name, role.discount_limit_percent]),
  );
  const brand = live?.data.settings.brand?.name ?? live?.data.name;
  const serviceCharge = live?.data.settings.service_charge_percent;

  const queued = new Map((health?.printers ?? []).map((row) => [row.id, row]));

  return {
    ...copy,

    till:
      terminal === null
        ? null
        : { id: terminal.id, name: terminal.name || terminal.code, online: terminal.is_online },

    terminal: {
      ...copy.terminal,
      identityRows: identityRows(copy.terminal.identityRows, terminal),
    },

    receipt: {
      ...copy.receipt,
      brand: brand ?? copy.receipt.brand,
      /*
       * A requisite nobody has entered is blank and says so.
       *
       * These two used to fall through to `RECEIPT_DATA` on the live path, so a
       * restaurant that had entered nothing was shown a plausible nine-digit
       * STIR and a street address belonging to another business — on the
       * preview it checks before printing. A specimen dish line is defensible;
       * a specimen tax identifier on a fiscal document is not.
       */
      address: live === null ? copy.receipt.address : (legal?.address ?? copy.receipt.unset),
      /*
       * `STIR` stays in front of the digits.
       *
       * The column holds nine digits and nothing else — that is what the
       * validator enforces and what a fiscal file wants — but a receipt prints
       * the label with them, and a guest checking a number against a contract
       * is looking for the word.
       */
      taxId:
        live === null
          ? copy.receipt.taxId
          : legal?.tax_id === undefined
            ? copy.receipt.unset
            : `STIR ${legal.tax_id}`,
    },

    printers: {
      ...copy.printers,
      rows: printers?.data
        ? printers.data.map((printer) => printerRow(printer, queued.get(printer.id)))
        : copy.printers.rows,
    },

    zones: {
      ...copy.zones,
      rows: halls?.data ? halls.data.map((hall) => hallRow(hall, serviceCharge)) : copy.zones.rows,
    },

    /*
     * The tender table, live where the restaurant has a list of its own.
     *
     * Two sources and a deliberate order. `GET /finance/payment-methods` is the
     * restaurant's own configuration and is the whole table when it answers;
     * `GET /payments/providers` is the older, narrower read — which rails hold
     * keys — and is the fallback for an installation where Finance is switched
     * off. Preferring the first is what makes the switch on this panel a
     * decision somebody recorded rather than an environment fact nobody can
     * change from a screen.
     */
    pays: {
      ...copy.pays,
      rows: tenders?.data
        ? tenderRows(tenders.data, sharesByMethod(book?.entries))
        : providers?.data
          ? payRows(copy.pays.rows, providers.data)
          : copy.pays.rows,
    },

    cats: categories?.data ? categoryColumns(copy.cats, categories.data) : copy.cats,

    policy: policyWith(copy.policy, live?.data.settings, limits),

    /*
     * The header names this restaurant rather than the design's.
     *
     * `console.settingsPanels.subtitle` says "Chilonzor filiali · Smart
     * Restaurant guruh sozlamalaridan meros" — a branch the tenant does not
     * have and an inheritance relationship that does not exist. The two names
     * here are already fetched: the tenant's own, and the venue the session is
     * pinned to.
     */
    subtitle:
      live === null || brand === undefined
        ? copy.subtitle
        : copy.subtitleLive.replace('{brand}', brand).replace('{place}', session.placeName),
  };
}

/** One row of `GET /api/v1/roles` — only the ceiling is read here. */
type ApiRole = { name: string; discount_limit_percent: number | null };

/**
 * Which till the identity panel is about.
 *
 * A console is not a till, so there is no "current" one to read off a session.
 * An online one is preferred because the preview button is the reason this id
 * exists and a preview pushed at a dark screen goes nowhere; a paired one
 * comes next, because an unpaired row is a till that has been registered and
 * never installed. Ordering rather than filtering, so a restaurant with one
 * unpaired terminal still sees its name instead of the fixture's "POS-3".
 */
function chooseTerminal(terminals: readonly ApiTerminal[] | undefined): ApiTerminal | null {
  if (terminals === undefined || terminals.length === 0) return null;

  const rank = (terminal: ApiTerminal): number =>
    (terminal.is_online ? 0 : 2) + (terminal.is_paired ? 0 : 1);

  return [...terminals].sort((a, b) => rank(a) - rank(b))[0] ?? null;
}

/**
 * The five identity rows, with the three the server actually knows replaced.
 *
 * By index, which is how `settings-copy.ts` pairs its own two halves: the
 * catalogue holds the labels and `TERMINAL_DATA.identityRows` holds the order,
 * so position is already the contract between them.
 *
 * `zone` and `orderType` keep their catalogue words on purpose. Neither is a
 * property of a terminal — a till is not assigned to a hall, and `mode` is
 * restaurant/bar/fast-food rather than dine-in/takeaway — so filling them from
 * what is merely reachable would put two invented facts between three true
 * ones, on the panel whose whole job is to say which machine you are looking at.
 */
function identityRows(
  rows: SettingsCopy['terminal']['identityRows'],
  terminal: ApiTerminal | null,
): SettingsCopy['terminal']['identityRows'] {
  if (terminal === null) return rows;

  const live: Record<number, string> = {
    0: terminal.name || terminal.code,
    4: terminal.app_version ?? rows[4]?.value ?? '',
  };

  if (terminal.branch != null) live[1] = terminal.branch.name;

  return rows.map((row, index) => ({ ...row, value: live[index] ?? row.value }));
}

/**
 * One printer, as the table draws it.
 *
 * The design's four kinds are not the server's three roles, and the mismatch is
 * real rather than a naming accident: `Printer::ROLES` is kitchen · receipt ·
 * label, which is what the spooler branches on, while the table names the place
 * the paper comes out. `bar` has no role of its own — a bar printer is a
 * kitchen printer standing somewhere else — so it can only ever be reached by
 * editing the row here, and a live list never draws it.
 */
function printerRow(
  printer: ApiPrinter,
  health: ApiPrinterHealth | undefined,
): SettingsCopy['printers']['rows'][number] {
  const state = health?.state ?? printer.state ?? 'offline';
  const seen = printer.last_seen_at;

  const kinds: Record<string, SettingsCopy['printers']['rows'][number]['kind']> = {
    kitchen: 'kitchen',
    receipt: 'till',
    label: 'pass',
  };

  return {
    id: String(printer.id),
    name: printer.name,
    ip: printer.target ?? '—',
    kind: kinds[printer.role ?? ''] ?? 'kitchen',
    // `busy` is a printer with work queued and a heartbeat seconds old — a busy
    // Friday, not a fault. Only `offline` and `error` are worth a red dot.
    up: state === 'ready' || state === 'busy',
    // `HH:MM` on the reader's own clock, like every other time on this screen.
    last: seen == null ? '—' : seen.slice(11, 16),
    dishes: health?.queued ?? 0,
  };
}

/**
 * One zone.
 *
 * `svc` is the restaurant's own service charge, not this hall's, and that is
 * the honest reading rather than a shortcut: `halls` has no service column, and
 * the only percentage the platform stores lives on the tenant and the branch.
 * So every live zone shows the same answer, which is what is true today — the
 * per-zone rule the note above the table describes needs a column that does not
 * exist yet.
 */
function hallRow(
  hall: ApiHall,
  serviceChargePercent: number | undefined,
): SettingsCopy['zones']['rows'][number] {
  return {
    id: String(hall.id),
    name: hall.name,
    tables: hall.tables_count ?? 0,
    seats: hall.capacity ?? 0,
    svc: (serviceChargePercent ?? 0) > 0,
  };
}

/**
 * The payment table, with the online rails switched to what they really are.
 *
 * Only the rails have a server answer. Cash, a bank card through the acquirer
 * and a customer's tab are tenders the till knows how to take; Click, Payme and
 * Uzum are integrations that either have keys or do not, and
 * `GET /payments/providers` is the console's view of exactly that — it lists a
 * provider that is switched OFF, which is the whole reason it differs from the
 * guest's list.
 *
 * `share` is left alone. The day's split by rail is Finance's figure and this
 * screen is a settings screen; a percentage read from one window and drawn
 * beside a switch would be answering a question nobody asked here.
 */
function payRows(
  rows: SettingsCopy['pays']['rows'],
  providers: readonly ApiProvider[],
): SettingsCopy['pays']['rows'] {
  const byId = new Map(providers.map((provider) => [provider.id, provider.available]));

  return rows.map((row) => {
    // `CLICK`, `PAYME`, `UZUM NASIYA` — the first word is the rail's own name,
    // which is what `PaymentGateway::name()` answers.
    const rail = row.name.split(/[\s·]/)[0]?.toLowerCase() ?? '';
    const available = byId.get(rail);

    return available === undefined ? row : { ...row, on: available };
  });
}

/**
 * The platform's answer for a rule nobody has set, by position.
 *
 * The mirror of `config/settings.php`'s `defaults` block, and it exists because
 * an absent key does NOT mean "off": a paper docket is printed unless a kitchen
 * switches it off, and a manager's signature is required for striking cooked
 * food unless a restaurant decides otherwise. A seam that read a missing key as
 * `false` would draw two of these switches the opposite way round from the way
 * the API is enforcing them — which is the console arguing with the till, on the
 * screen whose entire job is to state the rules.
 *
 * By position because the catalogue and the fixture already pair by index; the
 * same table lives in `settings-panels.tsx` as `POLICY_PATHS` and the two are
 * edited together.
 */
const POLICY_DEFAULTS: readonly (readonly (boolean | null)[])[] = [
  // Xizmat: service charge · VAT (not a switch) · auto-close · void needs a PIN.
  [null, null, false, true],
  // Oshxona: coursing (not built) · the late clock · the paper docket.
  [null, false, true],
  // Chegirmalar: three ceilings that live on the terminal, not here.
  [null, null, null],
];

/**
 * The policy switches, showing what the restaurant has actually set.
 *
 * Six of the ten are declared paths in `config/settings.php` and are read here;
 * the other four are drawn because the design draws them and are argued where
 * they are drawn (`settings-panels.tsx`). A switch left on its fixture position
 * is a switch that says something the server does not do, which is worse on
 * this screen than on any other.
 */
function policyWith(
  policy: SettingsCopy['policy'],
  settings: ApiSettings['data']['settings'] | undefined,
  limits: ReadonlyMap<string, number | null>,
): SettingsCopy['policy'] {
  if (settings === undefined) return policy;

  const rules = settings.policies ?? {};

  /* `kds_late_minutes` is minutes and the design draws it as a switch: any
     threshold is "warn me", and zero is the house rule being absent — which is
     the station's own SLA, and therefore still a warning. See the route
     handler, which decides what ON and OFF write. */
  const stored: readonly (readonly (boolean | undefined)[])[] = [
    [
      settings.service_charge_auto,
      undefined,
      rules.auto_close_table_after_payment,
      rules.void_sent_needs_manager_pin,
    ],
    [
      undefined,
      rules.kds_late_minutes === undefined ? undefined : rules.kds_late_minutes > 0,
      rules.kds_paper_docket,
    ],
    [undefined, undefined, undefined],
  ];

  /*
   * The value under each label, from the document rather than from the
   * catalogue.
   *
   * These sub-lines assert rates — "Zalda 10%", "12%, menyu narxlariga
   * kiritilgan", "6 daqiqada sariq", "Tasdiqsiz 5%" — and every one of them is
   * a number the server enforces from somewhere else. Stating one set on the
   * settings screen while the till enforces another is the drift CLAUDE.md
   * already records four times; `undefined` here leaves the catalogue's
   * sentence, which is right when the restaurant has set nothing.
   */
  const percent = (value: number | undefined, template: string): string | undefined =>
    value === undefined ? undefined : template.replace('{percent}', String(value));

  const ceiling = (role: string): string => {
    const value = limits.get(role);

    return value === null || value === undefined
      ? policy.discountUnset
      : policy.discountValue.replace('{percent}', String(value));
  };

  const values: readonly (readonly (string | undefined)[])[] = [
    [
      percent(settings.service_charge_percent, policy.svcValue),
      settings.legal?.vat_percent === undefined
        ? limits.size === 0
          ? undefined
          : policy.vatUnset
        : percent(settings.legal.vat_percent, policy.vatValue),
      undefined,
      undefined,
    ],
    [
      undefined,
      rules.kds_late_minutes === undefined || rules.kds_late_minutes === 0
        ? undefined
        : policy.kdsValue.replace('{minutes}', String(rules.kds_late_minutes)),
      undefined,
    ],
    [ceiling('waiter'), ceiling('branch-manager'), undefined],
  ];

  /**
   * Which rows are statements rather than levers — see `SettingsCopy['policy']`.
   *
   * The VAT rate is a number edited with the requisites, coursing is a kitchen
   * behaviour nothing implements, and the three discount rows are written
   * through `PUT /api/v1/roles/{role}` on the permissions screen. All five
   * flipped and flashed "enabled" and wrote nothing.
   */
  const readOnly: readonly (readonly boolean[])[] = [
    [false, true, false, false],
    [true, false, false],
    [true, true, true],
  ];

  return {
    ...policy,
    groups: policy.groups.map((group, groupIndex) => ({
      ...group,
      rows: group.rows.map((row, rowIndex) => {
        const set = stored[groupIndex]?.[rowIndex];
        const fallback = POLICY_DEFAULTS[groupIndex]?.[rowIndex] ?? null;
        const on = set ?? fallback;
        const value = values[groupIndex]?.[rowIndex];

        return {
          ...row,
          ...(value === undefined ? {} : { value }),
          ...(on === null ? {} : { on }),
          readOnly: readOnly[groupIndex]?.[rowIndex] === true,
        };
      }),
    })),
  };
}

/**
 * The tender table, from the restaurant's own list.
 *
 * ---------------------------------------------------------------------------
 * The design's three kinds are not the platform's four
 *
 * `PaymentMethod::KINDS` is cash · card · online · credit, because a Z-report
 * reconciles cash against a drawer, a card against a statement and a tab against
 * nothing at all. The table draws three — `t.kinds` has cash, card and debt —
 * and an online rail is a card to the person reading this screen: the money
 * arrives the same evening and appears on the same statement. So `online` folds
 * into `card` and only `credit` gets its own word, which is the one distinction
 * the note under the table is actually about.
 *
 * ---------------------------------------------------------------------------
 * `share` is today's takings, not the fee
 *
 * The catalogue says so in the panel's own subtitle — "Ulush — bugungi
 * savdodan" — and it is what the switch guard below is measured against: a
 * tender that took money today cannot leave the shift's Z-report. Drawing the
 * acquirer's cut here instead would have been the easy mistake, because
 * `fee_bps` is on the row and reads like a percentage.
 */
function tenderRows(
  rows: readonly ApiPaymentMethod[],
  shares: ReadonlyMap<string, number>,
): SettingsCopy['pays']['rows'] {
  const kinds: Readonly<Record<string, SettingsCopy['pays']['rows'][number]['kind']>> = {
    cash: 'cash',
    card: 'card',
    online: 'card',
    credit: 'debt',
  };

  return rows.map((row) => ({
    // The tender name, not the row id: `id` is null for anything the restaurant
    // has not configured, and React needs a key for those rows too.
    id: row.method,
    method: row.method,
    // A configured row carries the restaurant's own word; an unconfigured one
    // answers the bare method code, and upper-casing it is what the design's
    // own rows do (`NAQD`, `CLICK`).
    name: row.id === null ? row.method.toUpperCase() : row.title,
    kind: kinds[row.kind] ?? 'card',
    fiscal: row.is_fiscal,
    on: row.is_enabled,
    share: shares.get(row.method) ?? 0,
    /*
     * The note column, and the one place a live row is thinner than the design.
     *
     * The catalogue's six notes are per-ROW ("Yaxlitlash 1000 ga", "Terminal
     * orqali") and a live list has eleven tenders in a different order, so
     * pairing by index would put "rounded to 1000" beside Payme. What the server
     * does know is which driver settles the rail, and that is the more useful
     * sentence anyway: it is what a manager checks when a rail stops working.
     */
    note: row.gateway ?? '',
  }));
}

/**
 * Each tender's share of what came in today, as a whole percent.
 *
 * Computed from the cash book rather than asked for, because no endpoint answers
 * "today's split by method" and the book already carries every captured payment
 * with its method on it. Only `payment` rows count: an expense is money leaving
 * and a drawer top-up is money that was already ours, and folding either into a
 * share of takings would make the percentages add up to more than the day did.
 */
function sharesByMethod(entries: readonly ApiBookEntry[] | undefined): ReadonlyMap<string, number> {
  const takings = new Map<string, number>();
  let total = 0;

  for (const entry of entries ?? []) {
    if (entry.source !== 'payment' || entry.amount <= 0) continue;

    takings.set(entry.method, (takings.get(entry.method) ?? 0) + entry.amount);
    total += entry.amount;
  }

  if (total === 0) return new Map();

  return new Map(
    [...takings].map(([method, amount]) => [method, Math.round((amount / total) * 100)]),
  );
}

/**
 * The two category columns, live.
 *
 * Archived headings are dropped rather than dimmed: the panel has no state for
 * one, and a heading that takes no new entries sitting in a picker is worse than
 * one that is gone — the reason it was archived is that nobody should file
 * anything under it again. It stays on every statement it already appears in,
 * which is what archiving buys and deleting would not.
 *
 * A live column with nothing in it keeps the fixture. That is not a fallback so
 * much as an admission: income headings are the restaurant's own invention and a
 * platform that has never been given one has nothing true to draw, so the demo
 * column says what the panel is FOR rather than showing an empty box.
 */
function categoryColumns(
  copy: SettingsCopy['cats'],
  rows: readonly ApiExpenseCategory[],
): SettingsCopy['cats'] {
  const column = (direction: 'in' | 'out'): SettingsCopy['cats']['income'] =>
    rows
      .filter((row) => row.direction === direction && row.archived_at === null)
      .map((row) => ({
        // The numeric id when there is one, because a delete is addressed by it;
        // the code otherwise, so React still has a stable key for the eight
        // built-ins a restaurant has never edited.
        id: row.id === null ? row.code : String(row.id),
        name: row.title,
        sum: row.entries_total ?? 0,
        used: row.entries_count ?? 0,
        code: row.code,
        direction: row.direction,
      }));

  const income = column('in');
  const expense = column('out');

  return {
    ...copy,
    income: income.length > 0 ? income : copy.income,
    expense: expense.length > 0 ? expense : copy.expense,
  };
}
