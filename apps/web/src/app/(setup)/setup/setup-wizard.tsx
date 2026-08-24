'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';

import {
  copy,
  fill,
  SHARED,
  SHELL,
  STEP_BRANCH,
  STEP_CREW,
  STEP_DEVICES,
  STEP_FLOOR,
  STEP_INTRO,
  STEP_MENU,
  STEP_META,
  STEP_READY,
  STEP_RESTAURANT,
  STEP_TAX,
  STEP_TITLES,
} from './setup-copy';
import {
  BUSINESS_DAY_DEFAULT,
  CITIES,
  CLOSE_TIME_DEFAULT,
  isClockTime,
  isFiscalNumber,
  isPin,
  LANGS,
  MENU_TEMPLATE,
  OPEN_TIME_DEFAULT,
  PAYMENT_RAILS_DEFAULT,
  ROUNDING_DEFAULT_TIYIN,
  signsInWithPin,
  som,
  STEPS,
  VAT_PERCENT,
  ZONE_PRESETS,
  zonePreset,
  type DeviceInventory,
  type Lang,
  type PairingCode,
  type SetupDraft,
  type SetupProgress,
  type StepFailure,
  type StepId,
} from './setup-data';
import {
  createBranch,
  createCrew,
  createFloor,
  createMenu,
  issuePairingCode,
  loadDevices,
  openFirstShift,
  testPrinter,
} from './setup-server';
import {
  BranchStep,
  CrewStep,
  DevicesStep,
  FloorStep,
  MenuStep,
  ReadyStep,
  RestaurantStep,
  TaxStep,
  type SummaryRow,
} from './setup-steps';
import { ChevronIcon, Failure, TickIcon, Toast } from './setup-ui';

/**
 * The wizard: eight steps, one draft, and a careful account of what has
 * actually been written.
 *
 * The whole state machine is here rather than spread across the panes, for one
 * reason that matters more than tidiness. Half of these steps write to the
 * server and half cannot, and the summary at the end has to tell the truth
 * about which is which. A pane that could mark itself finished would eventually
 * mark itself finished for choosing a menu template rather than for the
 * sixty-eight rows landing — and the owner would open their doors believing
 * they had a menu.
 *
 * So `draft` is what has been typed and `progress` is what exists in the
 * database, they are never merged, and only the second one ticks a box.
 */

const STORAGE_KEY = 'restaurant-campus-setup';

/** The wizard opens on this. Every value is one the design file opens on too. */
function emptyDraft(lang: Lang): SetupDraft {
  return {
    restaurant: { name: '', taxId: '', cuisine: 'uzbek', langs: [lang] },
    branch: {
      name: '',
      city: CITIES[0]!,
      address: '',
      phone: '',
      openAt: OPEN_TIME_DEFAULT,
      closeAt: CLOSE_TIME_DEFAULT,
      businessDayStart: BUSINESS_DAY_DEFAULT,
    },
    zones: ZONE_PRESETS.map((preset) => ({
      id: preset.key,
      presetKey: preset.key,
      tables: preset.tables,
      seats: preset.seats,
    })),
    menu: { route: 'template', manual: [{ id: 'dish-1', name: '', priceSom: '' }] },
    tax: {
      service: ['dine_in'],
      roundingTiyin: ROUNDING_DEFAULT_TIYIN,
      rails: [...PAYMENT_RAILS_DEFAULT],
      fiscalNo: '',
    },
    crew: [],
  };
}

const EMPTY_PROGRESS: SetupProgress = {
  branchId: null,
  tablesCreated: 0,
  dishesCreated: 0,
  crewCreated: 0,
  shiftOpened: false,
};

/**
 * A fresh idempotency key.
 *
 * `crypto.randomUUID` is only defined in a secure context, and this app is
 * deliberately deployable over plain http — see `SESSION_COOKIE_SECURE` in
 * lib/server-session.ts for the same admission. On such a host the API would be
 * called with the string "undefined" as its key, every write in the wizard
 * would collide with the first one, and the second step would fail with
 * `request.idempotency_key_reused` for reasons nothing on screen could explain.
 */
function newKey(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }

  return `setup-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

/**
 * Resume, in this browser only.
 *
 * The design's "Save and exit" says progress is stored; the written spec lists
 * resume-later as a state that does not exist. Both are true at once, and the
 * honest version is this: no endpoint holds a half-finished setup, so the draft
 * lives in local storage and the toast says "in this browser" rather than
 * implying an account-level save. An owner who starts on the office machine and
 * finishes on a laptop begins again — and is told so, rather than finding out.
 */
type Stored = {
  lang: Lang;
  step: number;
  done: Record<string, boolean>;
  draft: SetupDraft;
  progress: SetupProgress;
};

/**
 * Read the saved draft, or nothing.
 *
 * Every failure is the same answer: a corrupt entry, a full quota, a browser in
 * private mode. None of them is worth a broken wizard — the owner starts from
 * an empty draft, which is where they were heading anyway.
 */
function readStored(): Stored | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw === null) return null;

    const stored = JSON.parse(raw) as Partial<Stored>;

    if (stored.draft === undefined || stored.progress === undefined) return null;

    return {
      lang: stored.lang !== undefined && LANGS.includes(stored.lang) ? stored.lang : 'uz',
      step: Math.min(Math.max(stored.step ?? 1, 1), STEPS.length),
      done: stored.done ?? {},
      draft: stored.draft,
      progress: stored.progress,
    };
  } catch {
    return null;
  }
}

export function SetupWizard({ initialLang }: { initialLang: Lang }) {
  const router = useRouter();
  const pane = useRef<HTMLDivElement | null>(null);

  /*
   * Whatever this browser remembers, read once, on the first render.
   *
   * A lazy initialiser rather than an effect. Restoring in an effect means the
   * empty form paints first and the saved one replaces it a frame later, which
   * on a wizard reads as the work having been lost. It is safe to touch
   * `window` here because this component never renders on the server — see the
   * note in setup-boot.tsx.
   */
  const [boot] = useState(readStored);

  const [lang, setLang] = useState<Lang>(boot?.lang ?? initialLang);
  const [step, setStep] = useState(boot?.step ?? 1);
  const [done, setDone] = useState<Record<string, boolean>>(boot?.done ?? {});
  const [draft, setDraft] = useState<SetupDraft>(() => boot?.draft ?? emptyDraft(initialLang));
  const [progress, setProgress] = useState<SetupProgress>(boot?.progress ?? EMPTY_PROGRESS);

  const [busy, setBusy] = useState(false);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [failure, setFailure] = useState<StepFailure | null>(null);
  const [errors, setErrors] = useState<Readonly<Record<string, string>>>({});
  const [toast, setToast] = useState('');

  const [devices, setDevices] = useState<DeviceInventory | null>(null);
  const [pairing, setPairing] = useState<{ terminalId: number; code: PairingCode } | null>(null);

  /*
   * One idempotency key per step, minted on demand and thrown away the moment
   * anything in that step changes.
   *
   * Both halves matter. Keeping the key across a retry is what makes pressing
   * Continue twice on a slow connection safe — the API replays the stored
   * answer instead of creating a second branch, and a floor that stopped after
   * eighteen of twenty-nine tables finishes the remaining eleven rather than
   * starting again at thirty. Dropping it on an edit is what stops the opposite
   * failure: the same key with a different body is refused outright
   * (`request.idempotency_key_reused`), so an owner who corrected a typo and
   * pressed Continue again would be told, in effect, that their correction was
   * the problem.
   */
  const keys = useRef<Partial<Record<StepId, string>>>({});

  const keyFor = (id: StepId): string => (keys.current[id] ??= newKey());

  const t = copy(SHELL, lang);
  const shared = copy(SHARED, lang);
  const current = STEPS[step - 1]!;
  const stepId = current.id;

  /* ---------- what is remembered between visits ---------- */

  const remember = useCallback(() => {
    try {
      window.localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ lang, step, done, draft, progress } satisfies Stored),
      );
    } catch {
      // Private browsing, a full quota, a locked-down machine. Losing the
      // resume point is a nuisance; losing the step somebody is on because
      // storage threw would be worse.
    }
  }, [lang, step, done, draft, progress]);

  useEffect(() => {
    remember();
  }, [remember]);

  /* ---------- moving between steps ---------- */

  const goTo = (next: number) => {
    setStep(next);
    setErrors({});
    setFailure(null);
    // The pane scrolls, not the page, so this is the element to reset — and it
    // has to be reset, or step four opens half-way down its own list.
    pane.current?.scrollTo({ top: 0 });
  };

  const flash = (message: string) => setToast(message);

  useEffect(() => {
    if (toast === '') return;

    // 2.6 seconds, FOUNDATIONS §5. A new toast replaces the current one rather
    // than queueing behind it.
    const timer = window.setTimeout(() => setToast(''), 2600);
    return () => window.clearTimeout(timer);
  }, [toast]);

  /* ---------- editing the draft ---------- */

  /*
   * Every edit goes through here, and every edit drops the step's idempotency
   * key. Routing the mutations through one function is what makes that rule
   * impossible to forget in the tenth field somebody adds later.
   */
  const edit = (id: StepId, next: (previous: SetupDraft) => SetupDraft) => {
    delete keys.current[id];
    setFailure(null);
    setDraft(next);
  };

  /* ---------- devices, read when the step is reached ---------- */

  useEffect(() => {
    if (stepId !== 'devices' || devices !== null) return;

    let live = true;
    void loadDevices().then((inventory) => {
      if (live) setDevices(inventory);
    });

    return () => {
      live = false;
    };
  }, [stepId, devices]);

  /* ---------- validation ---------- */

  const validate = (id: StepId): Readonly<Record<string, string>> => {
    const found: Record<string, string> = {};

    if (id === 'restaurant') {
      const r = copy(STEP_RESTAURANT, lang);
      if (draft.restaurant.name.trim() === '') found.rName = r.nameRequired;
      // Nine digits is the shape of a Uzbek STIR. Empty is allowed through with
      // a warning on the summary rather than a block, because a restaurant
      // waiting on its registration certificate can still lay out its floor.
      const digits = draft.restaurant.taxId.replace(/\D/g, '');
      if (digits !== '' && digits.length !== 9) found.taxId = r.taxIdInvalid;
    }

    if (id === 'branch') {
      const b = copy(STEP_BRANCH, lang);
      if (draft.branch.name.trim() === '') found.bName = b.nameRequired;
      if (draft.branch.address.trim() === '') found.address = b.addressRequired;
      if (!isClockTime(draft.branch.openAt) || !isClockTime(draft.branch.closeAt)) {
        found.hours = b.hoursInvalid;
      }
      if (!isClockTime(draft.branch.businessDayStart)) found.bizDay = b.hoursInvalid;
    }

    if (id === 'floor') {
      const f = copy(STEP_FLOOR, lang);
      if (draft.zones.reduce((all, zone) => all + zone.tables, 0) < 1) found.zones = f.needOne;
    }

    if (id === 'menu') {
      const m = copy(STEP_MENU, lang);

      if (draft.menu.route === 'manual') {
        const filled = draft.menu.manual.filter(
          (dish) => dish.name.trim() !== '' || dish.priceSom !== '',
        );

        if (filled.length === 0) {
          found.menu = m.needOne;
        } else {
          draft.menu.manual.forEach((dish, index) => {
            const named = dish.name.trim() !== '';
            const priced = dish.priceSom !== '' && Number(dish.priceSom) > 0;
            if (!named && !priced) return;
            if (!named) found[`dish-${index}-name`] = m.manualNameRequired;
            if (!priced) found[`dish-${index}-price`] = m.manualPriceRequired;
          });
        }
      }
    }

    if (id === 'tax') {
      const x = copy(STEP_TAX, lang);
      if (draft.tax.fiscalNo.trim() !== '' && !isFiscalNumber(draft.tax.fiscalNo)) {
        found.fiscal = x.fiscalInvalid;
      }
    }

    if (id === 'crew') {
      const c = copy(STEP_CREW, lang);
      let unnamed = false;
      let badPin = false;

      draft.crew.forEach((person, index) => {
        if (person.firstName.trim() === '' || person.lastName.trim() === '') {
          found[`crew-${index}-name`] = c.nameRequired;
          unnamed = true;
        }
        // An empty PIN is allowed — it means "issue one at the till", which is
        // the only thing that can happen today anyway. Four digits or nothing.
        if (signsInWithPin(person.position) && person.pin !== '' && !isPin(person.pin)) {
          found[`crew-${index}-pin`] = c.pinInvalid;
          badPin = true;
        }
      });

      // A summary line under the table, naming the actual fault. Reporting
      // "a name is missing" when the only problem was a three-digit PIN sends
      // somebody hunting through six rows for a name that is already there.
      if (unnamed) found.crew = c.nameRequired;
      else if (badPin) found.crewPin = c.pinInvalid;
    }

    return found;
  };

  /* ---------- writing a step to the server ---------- */

  const submit = async (): Promise<boolean> => {
    const found = validate(stepId);
    setErrors(found);

    if (Object.keys(found).length > 0) return false;

    setBusy(true);
    setFailure(null);

    try {
      if (stepId === 'branch') {
        const result = await createBranch(draft.branch, keyFor('branch'));
        if (!result.ok) {
          setFailure(result.failure);
          return false;
        }
        setProgress((was) => ({ ...was, branchId: result.value.id }));
        flash(copy(STEP_BRANCH, lang).created);
        return true;
      }

      if (stepId === 'floor') {
        const outcome = await createFloor(
          draft.zones.map((zone) => {
            const preset = zonePreset(zone.presetKey);
            return {
              name: preset.name[lang],
              prefix: preset.prefix,
              tables: zone.tables,
              seats: zone.seats,
            };
          }),
          keyFor('floor'),
        );

        setProgress((was) => ({ ...was, tablesCreated: outcome.created }));

        if (outcome.failure !== null) {
          setFailure(outcome.failure);
          return false;
        }

        flash(copy(STEP_FLOOR, lang).created);
        return true;
      }

      if (stepId === 'menu') {
        // Excel has no importer, so this route writes nothing and says so on
        // screen. Advancing is still allowed: the owner may come back with a
        // template once they have seen what the step involves.
        if (draft.menu.route === 'excel') return true;

        const categories =
          draft.menu.route === 'template'
            ? MENU_TEMPLATE.map((category) => ({
                slug: category.slug,
                name: category.name,
                station: category.station,
                dishes: category.dishes,
              }))
            : [
                {
                  slug: 'menyu',
                  name: { uz: 'Menyu', ru: 'Меню', en: 'Menu' },
                  station: 'hot',
                  dishes: draft.menu.manual
                    .filter((dish) => dish.name.trim() !== '' && Number(dish.priceSom) > 0)
                    .map((dish, index) => ({
                      sku: `MENU-${String(index + 1).padStart(3, '0')}`,
                      // One language typed, three columns stored: the name goes
                      // into all three so a Russian menu is not blank on day
                      // one. The owner edits the other two in the Menu screen.
                      name: {
                        uz: dish.name.trim(),
                        ru: dish.name.trim(),
                        en: dish.name.trim(),
                      },
                      // So'm in the field, tiyin on the wire. Integer maths
                      // only — the field already refuses anything but digits.
                      priceTiyin: Number(dish.priceSom) * 100,
                    })),
                },
              ];

        const outcome = await createMenu(categories, keyFor('menu'));

        setProgress((was) => ({ ...was, dishesCreated: outcome.created }));

        if (outcome.failure !== null) {
          setFailure(outcome.failure);
          return false;
        }

        flash(copy(STEP_MENU, lang).created);
        return true;
      }

      if (stepId === 'crew') {
        if (draft.crew.length === 0) return true;

        const outcome = await createCrew(draft.crew, keyFor('crew'));

        setProgress((was) => ({ ...was, crewCreated: outcome.created }));

        if (outcome.failure !== null) {
          setFailure(outcome.failure);
          return false;
        }

        flash(copy(STEP_CREW, lang).created);
        return true;
      }

      // Steps 1, 5 and 7 have nothing to write: two have no endpoint at all and
      // the third only reads. They validate and advance.
      return true;
    } finally {
      setBusy(false);
    }
  };

  const onContinue = async () => {
    const moved = await submit();
    if (!moved) return;

    setDone((was) => ({ ...was, [stepId]: true }));
    goTo(Math.min(STEPS.length, step + 1));
  };

  /* ---------- the two device actions ---------- */

  const onIssue = async (terminalId: number) => {
    setBusyId(terminalId);
    setFailure(null);

    const result = await issuePairingCode(terminalId, newKey());

    setBusyId(null);

    if (!result.ok) {
      setFailure(result.failure);
      return;
    }

    setPairing({ terminalId, code: result.value });
  };

  const onTest = async (printerId: number) => {
    setBusyId(printerId);
    setFailure(null);

    const result = await testPrinter(printerId, newKey());

    setBusyId(null);

    if (!result.ok) {
      setFailure(result.failure);
      return;
    }

    flash(copy(STEP_DEVICES, lang).testQueued);
  };

  /* ---------- opening the first shift ---------- */

  const blocked =
    progress.branchId === null || progress.tablesCreated === 0 || progress.dishesCreated === 0;

  const onOpen = async () => {
    setBusy(true);
    setFailure(null);

    const result = await openFirstShift(keyFor('ready'));

    setBusy(false);

    if (!result.ok) {
      setFailure(result.failure);
      return;
    }

    setProgress((was) => ({ ...was, shiftOpened: true }));
    flash(copy(STEP_READY, lang).opened);
  };

  function buildSummary(): readonly SummaryRow[] {
    const r = copy(STEP_READY, lang);
    const floor = copy(STEP_FLOOR, lang);
    const tax = copy(STEP_TAX, lang);

    const name = draft.restaurant.name.trim();
    const taxId = draft.restaurant.taxId.replace(/\D/g, '');
    const seatTotal = draft.zones.reduce((all, zone) => all + zone.tables * zone.seats, 0);

    return [
      {
        key: 'restaurant',
        label: r.rowRestaurant,
        value:
          name === '' ? r.missing : `${name}${taxId === '' ? '' : ` · ${taxId}`} · ${r.notSaved}`,
        state: name === '' ? 'missing' : 'unwired',
      },
      {
        key: 'branch',
        label: r.rowBranch,
        value:
          progress.branchId === null
            ? r.missing
            : `${draft.branch.name} · ${draft.branch.openAt}–${draft.branch.closeAt}`,
        state: progress.branchId === null ? 'missing' : 'ok',
      },
      {
        key: 'tables',
        label: r.rowTables,
        value:
          progress.tablesCreated === 0
            ? r.missing
            : `${progress.tablesCreated} ${floor.tables} · ${seatTotal} ${floor.seats} · ${draft.zones.length} ${floor.zones}`,
        state: progress.tablesCreated === 0 ? 'missing' : 'ok',
      },
      {
        key: 'menu',
        label: r.rowMenu,
        value:
          progress.dishesCreated === 0
            ? r.missing
            : fill(copy(STEP_MENU, lang).presetCount, { n: progress.dishesCreated }),
        state: progress.dishesCreated === 0 ? 'missing' : 'ok',
      },
      {
        key: 'tax',
        label: r.rowTax,
        value: `${tax.vat} ${VAT_PERCENT}% · ${draft.tax.rails.length} · ${som(draft.tax.roundingTiyin, lang)} · ${r.notSaved}`,
        state: 'unwired',
      },
      {
        key: 'fiscal',
        label: r.rowFiscal,
        value:
          draft.tax.fiscalNo.trim() === ''
            ? tax.fiscalUntested
            : `${draft.tax.fiscalNo.trim()} · ${r.notSaved}`,
        state: 'unwired',
      },
    ];
  }

  const summary = buildSummary();

  /* ---------- the header figures ---------- */

  const doneCount = STEPS.filter((one) => done[one.id] === true).length;
  const minutesLeft = STEPS.filter((one) => done[one.id] !== true).reduce(
    (all, one) => all + one.minutes,
    0,
  );

  return (
    <div className="sw">
      <Toast message={toast} />

      <header className="sw-header">
        <div className="flex items-center gap-3">
          <span className="bg-brand-500 font-display grid size-[30px] flex-none place-items-center rounded-[9px] text-sm font-bold tracking-tight text-white">
            SR
          </span>
          <span className="sw-optional-header text-md font-semibold whitespace-nowrap">
            Smart Restaurant
          </span>
        </div>
        <span aria-hidden className="sw-optional-header bg-border h-[22px] w-px flex-none" />
        {/* Gone below 720 — a reader on step three knows they are in the setup
            wizard, and 110px of `whitespace-nowrap` is a third of a phone. */}
        <span className="sw-wizard-name text-fg-muted text-sm whitespace-nowrap">{t.wizard}</span>

        <div className="flex-1" />

        <div className="flex items-center gap-3.5">
          <div className="sw-optional-header text-right">
            <div data-num className="text-sm font-semibold whitespace-nowrap">
              {fill(t.progress, { done: doneCount, total: STEPS.length })}
            </div>
            <div className="text-fg-subtle mt-px text-xs whitespace-nowrap">
              {minutesLeft > 0 ? fill(t.timeLeft, { n: minutesLeft }) : t.allDone}
            </div>
          </div>

          <div
            className="sw-progress"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={STEPS.length}
            aria-valuenow={doneCount}
            aria-label={t.steps}
          >
            <span style={{ width: `${(doneCount / STEPS.length) * 100}%` }} />
          </div>

          <span aria-hidden className="bg-border h-[22px] w-px" />

          {/*
           * The language switcher stays, unlike the role and tenant switchers
           * the handoff calls demo affordances. It is not one: this is the
           * first screen a restaurant sees, often before anybody's account
           * language has been set, and the person filling it in may not be the
           * person who signed up. Three languages are equal here.
           */}
          <div className="bg-bg-muted flex gap-[3px] rounded-[9px] p-[3px]" aria-label={t.language}>
            {LANGS.map((code) => (
              <button
                key={code}
                type="button"
                onClick={() => {
                  setLang(code);
                  /*
                   * Switching language rewrites part of what would be sent:
                   * a zone becomes "Main hall" instead of "Asosiy zal". An
                   * idempotency key already claimed for the old wording would
                   * then be replayed with a different body, which the API
                   * refuses outright as `request.idempotency_key_reused` — and
                   * the owner would be told their retry was the problem.
                   */
                  keys.current = {};
                }}
                aria-pressed={lang === code}
                className={`h-7 rounded-[7px] px-2.5 text-xs font-semibold uppercase ${
                  lang === code ? 'bg-surface text-fg shadow-xs' : 'text-fg-muted bg-transparent'
                }`}
              >
                {code}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={() => {
              remember();
              flash(t.saved);
              // A beat, so the toast is read before the screen changes. Any
              // longer and it reads as a hang; any shorter and the message is
              // gone before the eye reaches it.
              window.setTimeout(() => router.push('/dashboard'), 900);
            }}
            className="sw-tap border-border-strong bg-surface text-fg hover:bg-bg-subtle h-9 rounded-[10px] border px-[15px] text-sm font-semibold"
          >
            {t.saveExit}
          </button>
        </div>
      </header>

      <div className="sw-body">
        <aside className="sw-rail" aria-label={t.steps}>
          <div className="text-fg-subtle tracking-caps text-2xs px-2 pb-3 font-semibold uppercase">
            {t.steps}
          </div>
          <nav className="flex flex-col gap-0.5">
            {STEPS.map((one, index) => {
              const number = index + 1;
              const isCurrent = number === step;
              const isDone = done[one.id] === true && !isCurrent;
              const title = STEP_TITLES[one.id][lang];

              return (
                <button
                  key={one.id}
                  type="button"
                  onClick={() => goTo(number)}
                  aria-current={isCurrent ? 'step' : undefined}
                  className={`sw-tap hover:bg-bg-subtle flex w-full items-start gap-3 rounded-[10px] px-2.5 py-[11px] text-left ${
                    isCurrent ? 'bg-brand-50' : 'bg-transparent'
                  }`}
                >
                  <span
                    aria-hidden
                    className={`text-2xs mt-px grid size-6 flex-none place-items-center rounded-full border-[1.6px] font-mono font-semibold ${
                      isDone
                        ? 'bg-success-500 border-success-500 text-white'
                        : isCurrent
                          ? 'border-brand-500 text-brand-600'
                          : 'border-n-200 text-fg-subtle'
                    }`}
                  >
                    {isDone ? <TickIcon /> : number}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-[7px]">
                      <span
                        className={`text-sm ${isCurrent ? 'text-fg font-semibold' : 'text-fg-muted font-medium'}`}
                      >
                        {title}
                      </span>
                      {one.deferrable ? (
                        <span className="rounded-pill bg-bg-muted text-fg-subtle text-3xs px-1.5 py-px font-semibold">
                          {t.optional}
                        </span>
                      ) : null}
                    </span>
                    <span className="text-fg-subtle mt-0.5 block text-xs">
                      {isDone ? t.doneShort : STEP_META[one.id][lang]}
                    </span>
                  </span>
                </button>
              );
            })}
          </nav>

          <div className="border-border bg-bg-subtle mt-5 rounded-[12px] border p-3.5">
            <div className="text-xs font-semibold">{t.minToOpen}</div>
            <p className="text-fg-muted mt-1.5 text-xs leading-normal">{t.minToOpenP}</p>
          </div>
        </aside>

        <main className="sw-pane" ref={pane}>
          <div>
            <div className="flex items-center gap-2.5">
              <span data-num className="text-fg-subtle font-mono text-xs font-medium">
                {fill(t.stepOf, { n: step, total: STEPS.length })}
              </span>
              <span
                className={`rounded-pill text-2xs px-2.5 py-[3px] font-semibold ${
                  current.deferrable ? 'bg-bg-muted text-fg-subtle' : 'bg-brand-50 text-brand-600'
                }`}
              >
                {current.deferrable ? t.canSkip : t.required}
              </span>
            </div>

            <h1 className="font-display mt-2.5 text-[32px] font-bold tracking-tight text-balance">
              {STEP_TITLES[stepId][lang]}
            </h1>
            <p className="text-fg-muted mt-2.5 text-lg leading-relaxed text-pretty">
              {STEP_INTRO[stepId][lang]}
            </p>

            <div className="mt-8 grid gap-5">
              {failure !== null ? <Failure failure={failure} lang={lang} /> : null}

              {stepId === 'restaurant' ? (
                <RestaurantStep
                  lang={lang}
                  draft={draft}
                  errors={errors}
                  onChange={(patch) =>
                    edit('restaurant', (was) => ({
                      ...was,
                      restaurant: { ...was.restaurant, ...patch },
                    }))
                  }
                />
              ) : null}

              {stepId === 'branch' ? (
                <BranchStep
                  lang={lang}
                  draft={draft}
                  errors={errors}
                  onChange={(patch) =>
                    edit('branch', (was) => ({ ...was, branch: { ...was.branch, ...patch } }))
                  }
                />
              ) : null}

              {stepId === 'floor' ? (
                <FloorStep
                  lang={lang}
                  draft={draft}
                  errors={errors}
                  onChange={(zones) => edit('floor', (was) => ({ ...was, zones }))}
                />
              ) : null}

              {stepId === 'menu' ? (
                <MenuStep
                  lang={lang}
                  draft={draft}
                  errors={errors}
                  onRoute={(route) =>
                    edit('menu', (was) => ({ ...was, menu: { ...was.menu, route } }))
                  }
                  onManual={(manual) =>
                    edit('menu', (was) => ({ ...was, menu: { ...was.menu, manual } }))
                  }
                />
              ) : null}

              {stepId === 'tax' ? (
                <TaxStep
                  lang={lang}
                  draft={draft}
                  errors={errors}
                  onChange={(patch) =>
                    edit('tax', (was) => ({ ...was, tax: { ...was.tax, ...patch } }))
                  }
                />
              ) : null}

              {stepId === 'crew' ? (
                <CrewStep
                  lang={lang}
                  draft={draft}
                  errors={errors}
                  onChange={(crew) => edit('crew', (was) => ({ ...was, crew }))}
                />
              ) : null}

              {stepId === 'devices' ? (
                <DevicesStep
                  lang={lang}
                  devices={devices}
                  pairing={pairing}
                  busyId={busyId}
                  onIssue={(id) => void onIssue(id)}
                  onTest={(id) => void onTest(id)}
                />
              ) : null}

              {stepId === 'ready' ? (
                <ReadyStep
                  lang={lang}
                  rows={summary}
                  blocked={blocked}
                  busy={busy}
                  opened={progress.shiftOpened}
                  onOpen={() => void onOpen()}
                />
              ) : null}
            </div>

            <div className="border-border mt-9 flex items-center gap-3 border-t pt-[22px]">
              <button
                type="button"
                onClick={() => goTo(Math.max(1, step - 1))}
                disabled={step === 1}
                className="sw-tap border-border-strong bg-surface text-fg hover:bg-bg-subtle disabled:text-fg-disabled h-11 rounded-[11px] border px-[18px] text-sm font-semibold disabled:cursor-not-allowed"
              >
                {t.back}
              </button>

              <div className="flex-1" />

              {progress.shiftOpened ? (
                <Link
                  href="/finance/till"
                  className="sw-tap bg-brand-500 hover:bg-brand-600 text-md flex h-11 items-center gap-2.5 rounded-[11px] px-5 font-semibold text-white"
                >
                  {copy(STEP_READY, lang).toTill}
                  <ChevronIcon />
                </Link>
              ) : null}

              {current.deferrable ? (
                <button
                  type="button"
                  onClick={() => goTo(Math.min(STEPS.length, step + 1))}
                  className="sw-tap text-fg-muted hover:bg-bg-muted h-11 rounded-[11px] bg-transparent px-[18px] text-sm font-semibold"
                >
                  {t.later}
                </button>
              ) : null}

              {step < STEPS.length ? (
                <button
                  type="button"
                  onClick={() => void onContinue()}
                  disabled={busy}
                  className="sw-tap bg-brand-500 hover:bg-brand-600 text-md flex h-11 items-center gap-2.5 rounded-[11px] px-5 font-semibold text-white disabled:opacity-60"
                >
                  {busy ? shared.saving : t.continue}
                  <ChevronIcon />
                </button>
              ) : null}
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
