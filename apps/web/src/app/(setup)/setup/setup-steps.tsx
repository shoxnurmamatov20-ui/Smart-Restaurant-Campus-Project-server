'use client';

import { useState } from 'react';

import {
  copy,
  fill,
  SHARED,
  STEP_BRANCH,
  STEP_CREW,
  STEP_DEVICES,
  STEP_FLOOR,
  STEP_MENU,
  STEP_READY,
  STEP_RESTAURANT,
  STEP_TAX,
} from './setup-copy';
import {
  CITIES,
  CURRENCY_CODE,
  CURRENCY_WORD,
  MAX_SEATS_PER_TABLE,
  MAX_TABLES_PER_ZONE,
  MENU_TEMPLATE,
  PAYMENT_RAILS,
  ROUNDING_STEPS_TIYIN,
  SERVICE_PERCENT,
  SERVICE_SCOPES,
  STAFF_POSITIONS,
  TEMPLATE_DISH_COUNT,
  VAT_PERCENT,
  WORKING_LANGUAGES,
  som,
  initialsOf,
  signsInWithPin,
  zonePreset,
  CUISINES,
  type CrewDraft,
  type DeviceInventory,
  type Lang,
  type ManualDish,
  type MenuRoute,
  type PairingCode,
  type SetupDraft,
} from './setup-data';
import {
  AlertIcon,
  CheckBox,
  Chip,
  CloseIcon,
  Field,
  NotWired,
  PlusIcon,
  StatusChip,
  Stepper,
  TickIcon,
} from './setup-ui';

/**
 * The eight panes of the wizard.
 *
 * Every one of them is a presentational component: it draws what it is given
 * and reports what was pressed. The state machine, the validation and every
 * call to the server live in `setup-wizard.tsx`, so a step can be read on its
 * own and none of them can quietly disagree about what has been saved.
 */

type Errors = Readonly<Record<string, string>>;

/** A heading for a group of controls that are not a single input. */
function GroupLabel({ children }: { children: React.ReactNode }) {
  return <span className="block text-sm font-semibold">{children}</span>;
}

/* ============================================================
   1 · The restaurant
   ============================================================ */

export function RestaurantStep({
  lang,
  draft,
  errors,
  onChange,
}: {
  lang: Lang;
  draft: SetupDraft;
  errors: Errors;
  onChange: (patch: Partial<SetupDraft['restaurant']>) => void;
}) {
  const t = copy(STEP_RESTAURANT, lang);
  const shared = copy(SHARED, lang);
  const value = draft.restaurant;

  return (
    <div className="grid gap-[22px]">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Field label={t.name} error={errors.rName}>
          <input
            className="sw-input"
            value={value.name}
            aria-invalid={errors.rName !== undefined}
            onChange={(event) => onChange({ name: event.target.value })}
          />
        </Field>

        <Field label={t.taxId} note={t.taxIdNote} error={errors.taxId}>
          <input
            className="sw-input"
            data-mono
            inputMode="numeric"
            value={value.taxId}
            aria-invalid={errors.taxId !== undefined}
            onChange={(event) => onChange({ taxId: event.target.value })}
          />
        </Field>
      </div>

      <div>
        <GroupLabel>{t.cuisine}</GroupLabel>
        <div className="mt-2.5 flex flex-wrap gap-2">
          {CUISINES.map((cuisine) => (
            <Chip
              key={cuisine.id}
              on={value.cuisine === cuisine.id}
              onClick={() => onChange({ cuisine: cuisine.id })}
            >
              {cuisine.name[lang]}
            </Chip>
          ))}
        </div>
        <p className="text-fg-subtle mt-2.5 text-xs">{t.cuisineNote}</p>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div>
          <GroupLabel>{t.langs}</GroupLabel>
          <div className="mt-2.5 flex gap-2">
            {WORKING_LANGUAGES.map((option) => {
              const on = value.langs.includes(option.id);

              return (
                <button
                  key={option.id}
                  type="button"
                  aria-pressed={on}
                  onClick={() =>
                    onChange({
                      /*
                       * A restaurant with no working language would print a
                       * receipt with no words on it, so the last one cannot be
                       * switched off — pressing it again is simply ignored.
                       */
                      langs: on
                        ? value.langs.length > 1
                          ? value.langs.filter((id) => id !== option.id)
                          : value.langs
                        : [...value.langs, option.id],
                    })
                  }
                  className={`sw-tap h-[42px] flex-1 rounded-[10px] border text-sm font-semibold ${
                    on
                      ? 'bg-brand-50 border-brand-200 text-brand-600'
                      : 'bg-surface border-border-strong text-fg-muted'
                  }`}
                >
                  {option.label}
                </button>
              );
            })}
          </div>
          <p className="text-fg-subtle mt-2.5 text-xs">{t.langsNote}</p>
        </div>

        <div>
          <GroupLabel>{t.currency}</GroupLabel>
          {/*
           * Not a select. There is one currency in this market and the whole
           * platform stores money as an integer in tiyin against it; a dropdown
           * with one option is a promise that a second one exists.
           */}
          <div className="border-border bg-bg-subtle mt-[7px] flex h-11 items-center gap-3 rounded-[10px] border px-[13px]">
            <span className="text-md font-semibold">
              {CURRENCY_CODE} · {CURRENCY_WORD[lang]}
            </span>
            <svg
              width="15"
              height="15"
              viewBox="0 0 24 24"
              fill="none"
              stroke="var(--fg-subtle)"
              strokeWidth="1.9"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
            >
              <rect x="4" y="11" width="16" height="10" rx="2" />
              <path d="M8 11V7a4 4 0 0 1 8 0v4" />
            </svg>
          </div>
          <p className="text-fg-subtle mt-1.5 text-xs">{t.currencyNote}</p>
        </div>
      </div>

      <NotWired title={shared.notWiredH}>{t.notWired}</NotWired>
    </div>
  );
}

/* ============================================================
   2 · The branch
   ============================================================ */

export function BranchStep({
  lang,
  draft,
  errors,
  onChange,
}: {
  lang: Lang;
  draft: SetupDraft;
  errors: Errors;
  onChange: (patch: Partial<SetupDraft['branch']>) => void;
}) {
  const t = copy(STEP_BRANCH, lang);
  const value = draft.branch;

  return (
    <div className="grid gap-[22px]">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-[1fr_200px]">
        <Field label={t.name} error={errors.bName}>
          <input
            className="sw-input"
            value={value.name}
            aria-invalid={errors.bName !== undefined}
            onChange={(event) => onChange({ name: event.target.value })}
          />
        </Field>

        <Field label={t.city}>
          <select
            className="sw-input"
            value={value.city}
            onChange={(event) => onChange({ city: event.target.value })}
          >
            {CITIES.map((city) => (
              <option key={city} value={city}>
                {city}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-[1fr_220px]">
        <Field label={t.address} error={errors.address}>
          <input
            className="sw-input"
            value={value.address}
            aria-invalid={errors.address !== undefined}
            onChange={(event) => onChange({ address: event.target.value })}
          />
        </Field>

        <Field label={t.phone}>
          <input
            className="sw-input"
            data-mono
            inputMode="tel"
            value={value.phone}
            onChange={(event) => onChange({ phone: event.target.value })}
          />
        </Field>
      </div>

      <div>
        <GroupLabel>{t.hours}</GroupLabel>
        <div className="mt-2.5 flex flex-wrap items-center gap-3">
          <input
            className="sw-input w-[104px] text-center"
            data-mono
            aria-label={t.hours}
            aria-invalid={errors.hours !== undefined}
            value={value.openAt}
            onChange={(event) => onChange({ openAt: event.target.value })}
          />
          <span className="text-fg-subtle" aria-hidden>
            —
          </span>
          <input
            className="sw-input w-[104px] text-center"
            data-mono
            aria-label={t.hours}
            aria-invalid={errors.hours !== undefined}
            value={value.closeAt}
            onChange={(event) => onChange({ closeAt: event.target.value })}
          />
          <span className="text-fg-subtle text-sm">{t.hoursNote}</span>
        </div>
        {errors.hours !== undefined ? (
          <p className="text-danger-600 mt-1.5 flex items-center gap-1.5 text-xs">
            <AlertIcon size={13} />
            {errors.hours}
          </p>
        ) : null}
      </div>

      {/*
       * The business day, given a panel of its own because it is the single
       * setting on this screen that changes what every report means. An owner
       * who leaves it at midnight discovers, a month later, that half of every
       * Friday night is filed under Saturday.
       */}
      <div className="border-border border-l-brand-500 bg-brand-50 rounded-[12px] border border-l-[3px] px-5 py-[18px]">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="text-md font-semibold">{t.bizDay}</div>
            <p className="text-fg-muted mt-1.5 max-w-[520px] text-sm leading-relaxed text-pretty">
              {t.bizDayP}
            </p>
          </div>
          <input
            className="sw-input border-brand-200 w-24 flex-none text-center"
            data-mono
            aria-label={t.bizDay}
            aria-invalid={errors.bizDay !== undefined}
            value={value.businessDayStart}
            onChange={(event) => onChange({ businessDayStart: event.target.value })}
          />
        </div>
        <div className="border-brand-100 text-brand-600 mt-3 flex items-start gap-2 border-t pt-3 text-xs font-medium">
          <span className="mt-px flex-none">
            <AlertIcon size={14} />
          </span>
          {t.bizDayEx}
        </div>
        <p className="text-brand-600 mt-2 text-xs leading-relaxed opacity-80">{t.bizDayNotWired}</p>
      </div>
    </div>
  );
}

/* ============================================================
   3 · The floor
   ============================================================ */

export function FloorStep({
  lang,
  draft,
  errors,
  onChange,
}: {
  lang: Lang;
  draft: SetupDraft;
  errors: Errors;
  onChange: (zones: SetupDraft['zones']) => void;
}) {
  const t = copy(STEP_FLOOR, lang);
  const shared = copy(SHARED, lang);

  const tableTotal = draft.zones.reduce((all, zone) => all + zone.tables, 0);
  const seatTotal = draft.zones.reduce((all, zone) => all + zone.tables * zone.seats, 0);
  const taken = new Set(draft.zones.map((zone) => zone.presetKey));
  const nextExtra = ['extra-1', 'extra-2', 'extra-3', 'extra-4'].find((key) => !taken.has(key));

  return (
    <div className="grid gap-5">
      <div className="flex flex-col gap-2.5">
        {draft.zones.map((zone) => {
          const preset = zonePreset(zone.presetKey);

          return (
            <div
              key={zone.id}
              className="border-border bg-surface flex flex-wrap items-center gap-4 rounded-[12px] border px-[18px] py-4"
            >
              <div className="min-w-[140px] flex-1">
                <div className="text-md font-semibold">{preset.name[lang]}</div>
                <div data-num className="text-fg-subtle mt-0.5 font-mono text-xs">
                  {preset.prefix}1 – {preset.prefix}
                  {zone.tables}
                </div>
              </div>

              <div className="flex items-center gap-2.5">
                <span className="text-fg-muted text-sm">{t.tables}</span>
                <Stepper
                  value={zone.tables}
                  min={1}
                  max={MAX_TABLES_PER_ZONE}
                  label={`${preset.name[lang]} · ${t.tables}`}
                  onChange={(next) =>
                    onChange(
                      draft.zones.map((row) =>
                        row.id === zone.id ? { ...row, tables: next } : row,
                      ),
                    )
                  }
                />
              </div>

              <div className="flex items-center gap-2.5">
                <span className="text-fg-muted text-sm">{t.seats}</span>
                <Stepper
                  value={zone.seats}
                  min={1}
                  max={MAX_SEATS_PER_TABLE}
                  label={`${preset.name[lang]} · ${t.seats}`}
                  onChange={(next) =>
                    onChange(
                      draft.zones.map((row) =>
                        row.id === zone.id ? { ...row, seats: next } : row,
                      ),
                    )
                  }
                />
              </div>

              {/*
               * A zone can be dropped, which the design file does not draw.
               *
               * It offers three zones by default — a hall, a terrace and a VIP
               * room — and no way to remove one. A café with a single room
               * would then open with a terrace and a VIP room it does not have,
               * eleven tables that will never be sat at, and a floor plan its
               * waiters have to read past every evening.
               */}
              {draft.zones.length > 1 ? (
                <button
                  type="button"
                  aria-label={`${t.removeZone} · ${preset.name[lang]}`}
                  onClick={() => onChange(draft.zones.filter((row) => row.id !== zone.id))}
                  className="sw-tap text-fg-subtle hover:bg-danger-50 hover:text-danger-600 grid size-8 place-items-center rounded-lg"
                >
                  <CloseIcon />
                </button>
              ) : null}
            </div>
          );
        })}
      </div>

      {nextExtra !== undefined ? (
        <button
          type="button"
          onClick={() => {
            const preset = zonePreset(nextExtra);
            onChange([
              ...draft.zones,
              { id: nextExtra, presetKey: nextExtra, tables: preset.tables, seats: preset.seats },
            ]);
          }}
          className="sw-tap border-border-strong text-fg-muted hover:bg-surface flex h-[46px] w-full items-center justify-center gap-2.5 rounded-[12px] border border-dashed bg-transparent text-sm font-semibold"
        >
          <PlusIcon />
          {t.addZone}
        </button>
      ) : null}

      {errors.zones !== undefined ? (
        <p className="text-danger-600 flex items-center gap-1.5 text-sm">
          <AlertIcon size={14} />
          {errors.zones}
        </p>
      ) : null}

      <div className="grid grid-cols-1 gap-3.5 lg:grid-cols-2">
        <div className="sw-card">
          <div data-num className="font-display text-3xl font-bold tracking-tight">
            {tableTotal}
          </div>
          <div className="text-fg-muted mt-0.5 text-sm">{t.willCreate}</div>
          <div data-num className="text-fg-subtle mt-2.5 font-mono text-xs leading-relaxed">
            {draft.zones
              .map((zone) => {
                const preset = zonePreset(zone.presetKey);
                return `${preset.prefix}1–${preset.prefix}${zone.tables} · ${zone.seats} ${t.seats}`;
              })
              .join('   ')}
          </div>
          <div className="text-fg-subtle mt-2 text-xs">
            {seatTotal} {t.seats}
          </div>
        </div>

        <div className="sw-card">
          <div className="flex items-center gap-2.5">
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="var(--brand-600)"
              strokeWidth="1.75"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
            >
              <rect x="3" y="3" width="7" height="7" />
              <rect x="14" y="3" width="7" height="7" />
              <rect x="3" y="14" width="7" height="7" />
              <path d="M14 14h3v3h-3zM19 19h2v2h-2z" />
            </svg>
            <span className="text-md font-semibold">{t.qrH}</span>
          </div>
          <p className="text-fg-muted mt-[7px] text-sm leading-relaxed">{t.qrP}</p>
          {/*
           * Disabled rather than hidden, and disabled rather than wired to a
           * toast that lies. The design's button reports "QR codes prepared as
           * PDF"; nothing on this platform renders that PDF, and a button that
           * claims to have produced a file an owner then cannot find is worse
           * than one that says why it is grey.
           */}
          <button
            type="button"
            disabled
            title={shared.notWiredH}
            className="border-border-strong bg-surface text-fg-disabled mt-3 h-9 cursor-not-allowed rounded-[9px] border px-3.5 text-sm font-semibold"
          >
            {t.qrBtn}
          </button>
          <p className="text-fg-subtle mt-2.5 text-xs leading-relaxed">{t.qrNotWired}</p>
        </div>
      </div>
    </div>
  );
}

/* ============================================================
   4 · The menu
   ============================================================ */

export function MenuStep({
  lang,
  draft,
  errors,
  onRoute,
  onManual,
}: {
  lang: Lang;
  draft: SetupDraft;
  errors: Errors;
  onRoute: (route: MenuRoute) => void;
  onManual: (dishes: readonly ManualDish[]) => void;
}) {
  const t = copy(STEP_MENU, lang);
  const shared = copy(SHARED, lang);

  const routes: readonly {
    id: MenuRoute;
    title: string;
    body: string;
    meta: string;
    tag?: string;
  }[] = [
    { id: 'excel', title: t.routeExcel, body: t.routeExcelP, meta: t.routeExcelMeta },
    {
      id: 'template',
      title: t.routeTemplate,
      body: fill(t.routeTemplateP, { n: TEMPLATE_DISH_COUNT }),
      meta: t.routeTemplateMeta,
      tag: t.recommended,
    },
    { id: 'manual', title: t.routeManual, body: t.routeManualP, meta: t.routeManualMeta },
  ];

  return (
    <div className="grid gap-3.5">
      {routes.map((route) => {
        const on = draft.menu.route === route.id;

        return (
          <button
            key={route.id}
            type="button"
            aria-pressed={on}
            onClick={() => onRoute(route.id)}
            className={`sw-tap flex w-full items-start gap-[15px] rounded-[14px] border p-5 text-left ${
              on ? 'bg-brand-50 border-brand-200 shadow-sm' : 'bg-surface border-border'
            }`}
          >
            <span
              aria-hidden
              className={`mt-0.5 grid size-[22px] flex-none place-items-center rounded-full border-[1.8px] ${
                on ? 'border-brand-500' : 'border-n-300'
              }`}
            >
              {on ? <span className="bg-brand-500 size-2.5 rounded-full" /> : null}
            </span>
            <span className="min-w-0 flex-1">
              <span className="flex flex-wrap items-center gap-2.5">
                <span className="text-lg font-semibold">{route.title}</span>
                {route.tag !== undefined ? (
                  <span className="rounded-pill bg-accent-50 text-accent-700 text-2xs px-2 py-0.5 font-semibold">
                    {route.tag}
                  </span>
                ) : null}
              </span>
              <span className="text-fg-muted mt-1 block text-sm leading-relaxed">{route.body}</span>
              <span className="text-fg-subtle mt-[7px] block text-xs">{route.meta}</span>
            </span>
          </button>
        );
      })}

      {draft.menu.route === 'template' ? (
        <div className="border-border bg-surface rounded-[14px] border p-5">
          <div className="text-fg-subtle tracking-caps text-2xs font-semibold uppercase">
            {t.presetIncl}
          </div>
          <div className="mt-3.5 grid [grid-template-columns:repeat(auto-fit,minmax(min(160px,100%),1fr))] gap-3.5">
            {MENU_TEMPLATE.map((category) => (
              <div key={category.slug}>
                <div className="text-sm font-semibold">{category.name[lang]}</div>
                <div className="text-fg-subtle mt-0.5 text-xs">
                  {fill(t.presetCount, { n: category.dishes.length })}
                </div>
              </div>
            ))}
          </div>
          <div className="border-divider text-fg-muted mt-4 flex items-start gap-2 border-t pt-3.5 text-xs leading-relaxed">
            <span className="text-warning-500 mt-px flex-none">
              <AlertIcon size={14} />
            </span>
            {t.presetNote}
          </div>
        </div>
      ) : null}

      {draft.menu.route === 'excel' ? (
        <NotWired title={shared.notWiredH}>{t.excelNotWired}</NotWired>
      ) : null}

      {draft.menu.route === 'manual' ? (
        <div className="border-border bg-surface rounded-[14px] border p-5">
          <p className="text-fg-muted text-sm leading-relaxed">{t.manualCategory}</p>

          <div className="mt-4 flex flex-col gap-2.5">
            {draft.menu.manual.map((dish, index) => (
              <div key={dish.id} className="flex flex-wrap items-start gap-2.5">
                <input
                  className="sw-input min-w-[180px] flex-1"
                  aria-label={t.dishName}
                  placeholder={t.dishName}
                  aria-invalid={errors[`dish-${index}-name`] !== undefined}
                  value={dish.name}
                  onChange={(event) =>
                    onManual(
                      draft.menu.manual.map((row) =>
                        row.id === dish.id ? { ...row, name: event.target.value } : row,
                      ),
                    )
                  }
                />
                <div className="flex items-center gap-2">
                  <input
                    className="sw-input w-[140px] text-right"
                    data-mono
                    inputMode="numeric"
                    aria-label={t.dishPrice}
                    placeholder={t.dishPrice}
                    aria-invalid={errors[`dish-${index}-price`] !== undefined}
                    value={dish.priceSom}
                    onChange={(event) =>
                      onManual(
                        draft.menu.manual.map((row) =>
                          row.id === dish.id
                            ? // Digits only. The API takes an integer in tiyin and
                              // this field is in so'm; letting a comma or a full
                              // stop through here is how "12.50" becomes twelve
                              // so'm and fifty tiyin on a menu board.
                              {
                                ...row,
                                priceSom: event.target.value.replace(/\D/g, '').slice(0, 9),
                              }
                            : row,
                        ),
                      )
                    }
                  />
                  <span className="text-fg-subtle text-sm">{CURRENCY_WORD[lang]}</span>
                </div>
                {draft.menu.manual.length > 1 ? (
                  <button
                    type="button"
                    aria-label={`${t.removeDish} · ${dish.name}`}
                    onClick={() => onManual(draft.menu.manual.filter((row) => row.id !== dish.id))}
                    className="sw-tap text-fg-subtle hover:bg-danger-50 hover:text-danger-600 grid size-11 place-items-center rounded-lg"
                  >
                    <CloseIcon />
                  </button>
                ) : null}
              </div>
            ))}
          </div>

          <button
            type="button"
            onClick={() =>
              onManual([...draft.menu.manual, { id: `dish-${Date.now()}`, name: '', priceSom: '' }])
            }
            className="sw-tap border-border-strong bg-surface text-fg hover:bg-bg-subtle mt-3.5 flex h-11 items-center gap-2.5 rounded-[11px] border px-[17px] text-sm font-semibold"
          >
            <PlusIcon />
            {t.addDish}
          </button>
        </div>
      ) : null}

      {errors.menu !== undefined ? (
        <p className="text-danger-600 flex items-center gap-1.5 text-sm">
          <AlertIcon size={14} />
          {errors.menu}
        </p>
      ) : null}
    </div>
  );
}

/* ============================================================
   5 · Tax, rounding, payment and the fiscal module
   ============================================================ */

export function TaxStep({
  lang,
  draft,
  errors,
  onChange,
}: {
  lang: Lang;
  draft: SetupDraft;
  errors: Errors;
  onChange: (patch: Partial<SetupDraft['tax']>) => void;
}) {
  const t = copy(STEP_TAX, lang);
  const shared = copy(SHARED, lang);
  const value = draft.tax;

  /*
   * The connection test, which the design calls the most load-bearing control
   * on this step and which was not drawn at all.
   *
   * `GET /finance/fiscal/probe` does exist — it answers whether the driver is
   * enabled, what the driver says about itself, how long the declaration window
   * is and how many receipts are waiting. An earlier note here said nothing on
   * the platform could be asked and drew a permanently grey chip; that was true
   * of *storing* the module number and is not true of testing the link.
   *
   * The chip only ever reports what the server said. Green means the server
   * says the driver is enabled and answering; amber means it answered and is
   * switched off, which is the common case in a fresh install and is not an
   * error; red means the call itself failed. None of the three claims a receipt
   * is legally valid — that is the certification, and it is not this button's
   * to assert.
   */
  const [probe, setProbe] = useState<'idle' | 'testing' | 'on' | 'off' | 'failed'>('idle');

  async function test() {
    setProbe('testing');

    try {
      const response = await fetch('/api/setup/fiscal-probe', { cache: 'no-store' });

      if (!response.ok) {
        setProbe('failed');

        return;
      }

      const body = (await response.json()) as { data?: { enabled?: boolean } };

      setProbe(body.data?.enabled === true ? 'on' : 'off');
    } catch {
      setProbe('failed');
    }
  }

  return (
    <div className="grid gap-5">
      <div className="grid grid-cols-1 gap-3.5 lg:grid-cols-2">
        <div className="sw-card">
          <div className="flex items-baseline justify-between">
            <span className="text-sm font-semibold">{t.vat}</span>
            <span data-num className="font-mono text-xl font-semibold">
              {VAT_PERCENT}%
            </span>
          </div>
          {/*
           * Two segments and only one of them is reachable. VAT here is
           * price-inclusive by law and by DECISIONS §1 — the menu price is what
           * the guest pays and nothing is added at the till — so "on top" is
           * drawn to say what this restaurant is *not* doing, not offered as a
           * choice somebody could make by accident.
           */}
          <div className="bg-bg-muted mt-3 flex gap-[3px] rounded-[9px] p-[3px]">
            <span className="bg-surface grid h-8 flex-1 place-items-center rounded-[7px] text-xs font-semibold shadow-xs">
              {t.vatIn}
            </span>
            <span className="text-fg-disabled grid h-8 flex-1 place-items-center rounded-[7px] text-xs font-semibold">
              {t.vatOn}
            </span>
          </div>
          <p className="text-fg-subtle mt-2.5 text-xs leading-normal">{t.vatNote}</p>
        </div>

        <div className="sw-card">
          <div className="flex items-baseline justify-between">
            <span className="text-sm font-semibold">{t.service}</span>
            <span data-num className="font-mono text-xl font-semibold">
              {SERVICE_PERCENT}%
            </span>
          </div>
          <div className="mt-3 flex flex-col gap-2">
            {SERVICE_SCOPES.map((scope) => {
              const on = value.service.includes(scope.id);

              return (
                <button
                  key={scope.id}
                  type="button"
                  aria-pressed={on}
                  onClick={() =>
                    onChange({
                      service: on
                        ? value.service.filter((id) => id !== scope.id)
                        : [...value.service, scope.id],
                    })
                  }
                  className="text-fg-muted flex items-center gap-2.5 text-left text-sm"
                >
                  <CheckBox on={on} />
                  {scope.name[lang]}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <div className="sw-card">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="text-sm font-semibold">{t.rounding}</div>
            <p className="text-fg-muted mt-1 max-w-[420px] text-sm leading-normal">{t.roundingP}</p>
          </div>
          <div className="flex flex-none gap-[7px]">
            {ROUNDING_STEPS_TIYIN.map((step) => {
              const on = value.roundingTiyin === step;

              return (
                <button
                  key={step}
                  type="button"
                  aria-pressed={on}
                  data-num
                  onClick={() => onChange({ roundingTiyin: step })}
                  className={`sw-tap h-[38px] rounded-[10px] border px-3.5 font-mono text-sm font-semibold ${
                    on
                      ? 'bg-n-900 border-n-900 text-white'
                      : 'bg-surface border-border-strong text-fg'
                  }`}
                >
                  {som(step, lang)}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <div>
        <GroupLabel>{t.payMethods}</GroupLabel>
        <div className="mt-3 grid [grid-template-columns:repeat(auto-fit,minmax(min(210px,100%),1fr))] gap-2.5">
          {PAYMENT_RAILS.map((rail) => {
            const on = value.rails.includes(rail.id);

            return (
              <button
                key={rail.id}
                type="button"
                aria-pressed={on}
                onClick={() =>
                  onChange({
                    rails: on
                      ? value.rails.filter((id) => id !== rail.id)
                      : [...value.rails, rail.id],
                  })
                }
                className={`sw-tap flex items-center gap-3 rounded-[11px] border px-[15px] py-3.5 text-left ${
                  on ? 'bg-brand-50 border-brand-200' : 'bg-surface border-border'
                }`}
              >
                <CheckBox on={on} />
                <span className="flex-1 text-sm font-medium">{rail.name[lang]}</span>
                {rail.feePercent !== null ? (
                  <span data-num className="text-fg-subtle font-mono text-xs">
                    {rail.feePercent.toFixed(1)}%
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
      </div>

      <div className="sw-card">
        <div className="flex flex-wrap items-start justify-between gap-5">
          <div className="min-w-[280px] flex-1">
            <div className="flex flex-wrap items-center gap-2.5">
              <span className="text-md font-semibold">{t.fiscal}</span>
              <span className="rounded-pill bg-danger-50 text-danger-700 text-2xs px-2 py-0.5 font-semibold">
                {t.mandatory}
              </span>
            </div>
            <p className="text-fg-muted mt-1.5 text-sm leading-relaxed">{t.fiscalP}</p>
            <div className="mt-3.5">
              <input
                className="sw-input w-[190px]"
                data-mono
                inputMode="numeric"
                aria-label={t.fiscalNo}
                placeholder={t.fiscalNo}
                aria-invalid={errors.fiscal !== undefined}
                value={value.fiscalNo}
                onChange={(event) => onChange({ fiscalNo: event.target.value })}
              />
              {errors.fiscal !== undefined ? (
                <p className="text-danger-600 mt-1.5 flex items-center gap-1.5 text-xs">
                  <AlertIcon size={13} />
                  {errors.fiscal}
                </p>
              ) : null}
            </div>
          </div>

          <div className="flex flex-none flex-col items-end gap-2.5">
            <StatusChip
              tone={
                probe === 'on'
                  ? 'good'
                  : probe === 'off'
                    ? 'warn'
                    : probe === 'failed'
                      ? 'bad'
                      : 'neutral'
              }
            >
              {probe === 'on'
                ? t.fiscalOn
                : probe === 'off'
                  ? t.fiscalOff
                  : probe === 'failed'
                    ? t.fiscalFailed
                    : probe === 'testing'
                      ? t.fiscalTesting
                      : t.fiscalUntested}
            </StatusChip>

            <button
              type="button"
              onClick={() => void test()}
              disabled={probe === 'testing'}
              className="sw-tap border-border bg-surface rounded-[11px] border px-4 text-sm font-semibold disabled:opacity-45"
            >
              {t.testConn}
            </button>
          </div>
        </div>
      </div>

      <NotWired title={shared.notWiredH}>{t.fiscalNotWired}</NotWired>
      <NotWired title={shared.notWiredH}>{t.taxNotWired}</NotWired>
    </div>
  );
}

/* ============================================================
   6 · People
   ============================================================ */

export function CrewStep({
  lang,
  draft,
  errors,
  onChange,
}: {
  lang: Lang;
  draft: SetupDraft;
  errors: Errors;
  onChange: (crew: readonly CrewDraft[]) => void;
}) {
  const t = copy(STEP_CREW, lang);
  const shared = copy(SHARED, lang);

  const patch = (id: string, next: Partial<CrewDraft>) =>
    onChange(draft.crew.map((row) => (row.id === id ? { ...row, ...next } : row)));

  return (
    <div className="grid gap-[18px]">
      <div className="border-border bg-surface overflow-hidden rounded-[14px] border">
        <div className="bg-bg-subtle border-border text-fg-subtle tracking-caps text-2xs grid grid-cols-[1.3fr_1fr_90px_110px_44px] gap-3.5 border-b px-[18px] py-3 font-semibold uppercase max-lg:hidden">
          <span>{t.person}</span>
          <span>{t.role}</span>
          {/* "PIN" is the same word in all three languages, so it is written
              here rather than given a catalogue key that i18n.test.ts would
              reject as data. */}
          <span>PIN</span>
          <span>{t.access}</span>
          <span />
        </div>

        {draft.crew.map((person, index) => {
          const withPin = signsInWithPin(person.position);

          return (
            <div
              key={person.id}
              className="border-divider grid grid-cols-1 items-start gap-3.5 border-b px-[18px] py-3.5 lg:grid-cols-[1.3fr_1fr_90px_110px_44px] lg:items-center"
            >
              <div className="flex min-w-0 items-center gap-3">
                <span
                  aria-hidden
                  className="bg-bg-muted text-fg-muted grid size-8 flex-none place-items-center rounded-full text-xs font-semibold"
                >
                  {initialsOf(person.firstName, person.lastName)}
                </span>
                <div className="grid min-w-0 flex-1 gap-1.5">
                  <div className="flex gap-1.5">
                    <input
                      className="sw-input h-9 min-w-0 flex-1 text-sm"
                      aria-label={t.firstName}
                      placeholder={t.firstName}
                      aria-invalid={errors[`crew-${index}-name`] !== undefined}
                      value={person.firstName}
                      onChange={(event) => patch(person.id, { firstName: event.target.value })}
                    />
                    <input
                      className="sw-input h-9 min-w-0 flex-1 text-sm"
                      aria-label={t.lastName}
                      placeholder={t.lastName}
                      aria-invalid={errors[`crew-${index}-name`] !== undefined}
                      value={person.lastName}
                      onChange={(event) => patch(person.id, { lastName: event.target.value })}
                    />
                  </div>
                  <input
                    className="sw-input h-9 text-sm"
                    aria-label={t.contact}
                    placeholder={t.contact}
                    value={person.contact}
                    onChange={(event) => patch(person.id, { contact: event.target.value })}
                  />
                </div>
              </div>

              <select
                className="sw-input h-9 text-sm"
                aria-label={t.role}
                value={person.position}
                onChange={(event) => patch(person.id, { position: event.target.value })}
              >
                {STAFF_POSITIONS.map((position) => (
                  <option key={position.id} value={position.id}>
                    {position.name[lang]}
                  </option>
                ))}
              </select>

              {withPin ? (
                <input
                  className="sw-input h-9 text-center text-sm"
                  data-mono
                  inputMode="numeric"
                  aria-label="PIN"
                  placeholder="0000"
                  aria-invalid={errors[`crew-${index}-pin`] !== undefined}
                  value={person.pin}
                  onChange={(event) =>
                    patch(person.id, { pin: event.target.value.replace(/\D/g, '').slice(0, 4) })
                  }
                />
              ) : (
                <span className="text-fg-disabled text-center text-sm" aria-hidden>
                  —
                </span>
              )}

              <span className="text-fg-subtle text-xs">{withPin ? 'PIN' : t.accessEmail}</span>

              <button
                type="button"
                aria-label={`${t.removeCrew} · ${person.firstName} ${person.lastName}`}
                onClick={() => onChange(draft.crew.filter((row) => row.id !== person.id))}
                className="sw-tap text-fg-subtle hover:bg-danger-50 hover:text-danger-600 grid size-11 place-items-center justify-self-start rounded-lg lg:justify-self-center"
              >
                <CloseIcon />
              </button>
            </div>
          );
        })}

        {draft.crew.length === 0 ? (
          <p className="text-fg-subtle px-[18px] py-5 text-sm">{t.pinNotWired}</p>
        ) : null}
      </div>

      <div className="flex flex-wrap gap-2.5">
        <button
          type="button"
          onClick={() =>
            onChange([
              ...draft.crew,
              {
                id: `crew-${Date.now()}`,
                firstName: '',
                lastName: '',
                contact: '',
                position: 'waiter',
                pin: '',
              },
            ])
          }
          className="sw-tap border-border-strong bg-surface text-fg hover:bg-bg-subtle flex h-11 items-center gap-2.5 rounded-[11px] border px-[17px] text-sm font-semibold"
        >
          <PlusIcon />
          {t.addCrew}
        </button>

        {/*
         * The manager, who does not get a PIN — `specs/04 §4.6`.
         *
         * The row this adds has `position: 'manager'` and an **email** where
         * every other row has four digits, because a manager signs into the
         * console with a password and a PIN would be a credential they never
         * use. Adding them through the same "add" button as a waiter and then
         * changing the role leaves a four-digit field on screen that the wizard
         * will refuse to submit and nobody can explain.
         */}
        <button
          type="button"
          onClick={() =>
            onChange([
              ...draft.crew,
              {
                id: `crew-${Date.now()}`,
                firstName: '',
                lastName: '',
                contact: '',
                position: 'manager',
                pin: '',
              },
            ])
          }
          className="sw-tap border-border-strong bg-surface text-fg hover:bg-bg-subtle flex h-11 items-center gap-2.5 rounded-[11px] border px-[17px] text-sm font-semibold"
        >
          <PlusIcon />
          {t.inviteManager}
        </button>
      </div>

      {(errors.crew ?? errors.crewPin) !== undefined ? (
        <p className="text-danger-600 flex items-center gap-1.5 text-sm">
          <AlertIcon size={14} />
          {errors.crew ?? errors.crewPin}
        </p>
      ) : null}

      <div className="border-border border-l-warning-500 bg-warning-50 flex items-start gap-3 rounded-[12px] border border-l-[3px] px-[18px] py-4">
        <span className="text-warning-600 mt-px flex-none">
          <AlertIcon size={17} />
        </span>
        <div>
          <div className="text-warning-700 text-sm font-semibold">{t.pinWarnH}</div>
          <p className="text-warning-700 mt-1 text-sm leading-relaxed text-pretty">{t.pinWarnP}</p>
        </div>
      </div>

      <NotWired title={shared.notWiredH}>{t.pinNotWired}</NotWired>
    </div>
  );
}

/* ============================================================
   7 · Devices
   ============================================================ */

export function DevicesStep({
  lang,
  devices,
  pairing,
  busyId,
  onIssue,
  onTest,
}: {
  lang: Lang;
  devices: DeviceInventory | null;
  pairing: { terminalId: number; code: PairingCode } | null;
  busyId: number | null;
  onIssue: (terminalId: number) => void;
  onTest: (printerId: number) => void;
}) {
  const t = copy(STEP_DEVICES, lang);
  const shared = copy(SHARED, lang);

  return (
    <div className="grid gap-[18px]">
      <div className="border-border bg-surface rounded-[14px] border p-5">
        <div className="text-md font-semibold">{t.pairH}</div>
        <p className="text-fg-muted mt-1.5 text-sm leading-relaxed">{t.pairP}</p>

        {devices === null ? (
          <p className="text-fg-subtle mt-4 text-sm">{shared.saving}</p>
        ) : devices.terminals.length === 0 ? (
          <p className="text-fg-subtle mt-4 text-sm leading-relaxed">
            {devices.live ? t.noTerminals : shared.offline}
          </p>
        ) : (
          <div className="mt-4 flex flex-col gap-2.5">
            {devices.terminals.map((terminal) => {
              const code = pairing?.terminalId === terminal.id ? pairing.code : null;

              return (
                <div
                  key={terminal.id}
                  className="border-border flex flex-wrap items-center gap-3.5 rounded-[12px] border px-[18px] py-3.5"
                >
                  <div className="min-w-[160px] flex-1">
                    <div className="text-sm font-semibold">{terminal.name}</div>
                    <div data-num className="text-fg-subtle mt-px font-mono text-xs">
                      {terminal.code}
                      {terminal.branch?.name !== undefined ? ` · ${terminal.branch.name}` : ''}
                    </div>
                  </div>

                  {code !== null ? (
                    /*
                     * The code, in boxes, at a size that can be read across a
                     * dining room. It is never stored on this side: it is shown,
                     * typed into a tablet, and destroyed by the API the moment it
                     * is redeemed.
                     */
                    <div className="flex gap-1.5" aria-label={t.issueCode}>
                      {code.code.split('').map((character, index) => (
                        <span
                          key={`${terminal.id}-${index}`}
                          data-num
                          className="border-border bg-bg-subtle grid h-12 w-9 place-items-center rounded-[10px] border font-mono text-xl font-semibold"
                        >
                          {character}
                        </span>
                      ))}
                    </div>
                  ) : null}

                  <button
                    type="button"
                    disabled={busyId === terminal.id}
                    onClick={() => onIssue(terminal.id)}
                    className="sw-tap border-border-strong bg-surface text-fg hover:bg-bg-subtle disabled:text-fg-disabled h-9 rounded-[9px] border px-3.5 text-sm font-semibold"
                  >
                    {busyId === terminal.id ? shared.saving : t.issueCode}
                  </button>

                  <StatusChip tone={terminal.is_paired ? 'good' : 'warn'}>
                    {terminal.is_paired ? (terminal.is_online ? t.online : t.paired) : t.unpaired}
                  </StatusChip>
                </div>
              );
            })}
            <p className="text-fg-subtle text-xs leading-normal">{t.pairExp}</p>
          </div>
        )}
      </div>

      <div className="border-border bg-surface rounded-[14px] border p-5">
        <div className="text-md font-semibold">{t.printers}</div>

        {devices === null ? (
          <p className="text-fg-subtle mt-4 text-sm">{shared.saving}</p>
        ) : devices.printers.length === 0 ? (
          <p className="text-fg-subtle mt-4 text-sm leading-relaxed">
            {devices.live ? t.noPrinters : shared.offline}
          </p>
        ) : (
          <div className="mt-4 flex flex-col gap-2.5">
            {devices.printers.map((printer) => (
              <div
                key={printer.id}
                className="border-border flex flex-wrap items-center gap-3.5 rounded-[12px] border px-[18px] py-3.5"
              >
                <span
                  aria-hidden
                  className="bg-bg-muted text-fg-muted grid size-9 flex-none place-items-center rounded-[10px]"
                >
                  <svg
                    width="18"
                    height="18"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.75"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M6 9V3h12v6M6 18h12v3H6z" />
                  </svg>
                </span>
                <div className="min-w-[160px] flex-1">
                  <div className="text-sm font-semibold">{printer.name}</div>
                  <div className="text-fg-subtle mt-px text-xs">
                    {printer.role} · {printer.connection}
                  </div>
                </div>
                <button
                  type="button"
                  disabled={busyId === printer.id}
                  onClick={() => onTest(printer.id)}
                  className="sw-tap border-border-strong bg-surface text-fg hover:bg-bg-subtle disabled:text-fg-disabled h-9 rounded-[9px] border px-3.5 text-sm font-semibold"
                >
                  {busyId === printer.id ? shared.saving : t.testPrint}
                </button>
                {/*
                 * The server's four states, in the reader's language and with a
                 * tone that agrees with them. Printing the raw enum would put
                 * an English word in the middle of a Russian screen, and worse,
                 * would give "error" and "ready" the same amber chip.
                 */}
                <StatusChip
                  tone={
                    printer.state === 'ready' ? 'good' : printer.state === 'error' ? 'bad' : 'warn'
                  }
                >
                  {printer.state === 'ready'
                    ? t.stateReady
                    : printer.state === 'busy'
                      ? t.stateBusy
                      : printer.state === 'error'
                        ? t.stateError
                        : t.stateOffline}
                </StatusChip>
              </div>
            ))}
          </div>
        )}

        <p className="text-fg-muted mt-4 text-sm leading-relaxed text-pretty">{t.printerNote}</p>
      </div>
    </div>
  );
}

/* ============================================================
   8 · The summary
   ============================================================ */

export type SummaryRow = {
  key: string;
  label: string;
  value: string;
  state: 'ok' | 'missing' | 'unwired';
};

export function ReadyStep({
  lang,
  rows,
  blocked,
  busy,
  opened,
  onOpen,
}: {
  lang: Lang;
  rows: readonly SummaryRow[];
  blocked: boolean;
  busy: boolean;
  opened: boolean;
  onOpen: () => void;
}) {
  const t = copy(STEP_READY, lang);
  const shared = copy(SHARED, lang);

  const later = [
    { key: 'stock', label: t.laterStock, why: t.laterStockWhy },
    { key: 'suppliers', label: t.laterSuppliers, why: t.laterSuppliersWhy },
    { key: 'crm', label: t.laterCrm, why: t.laterCrmWhy },
    { key: 'books', label: t.laterBooks, why: t.laterBooksWhy },
  ];

  return (
    <div className="grid gap-5">
      <div className="border-border bg-surface overflow-hidden rounded-[14px] border">
        <div className="bg-bg-subtle border-border text-fg-subtle tracking-caps text-2xs border-b px-5 py-3.5 font-semibold uppercase">
          {t.readyReq}
        </div>
        {rows.map((row) => (
          <div
            key={row.key}
            className="border-divider flex flex-wrap items-center gap-3.5 border-b px-5 py-3.5"
          >
            {/*
             * Three states, three shapes — not three colours. A filled green
             * disc, an amber ring and a dashed grey ring are told apart without
             * seeing colour at all, which FOUNDATIONS §7 requires and which
             * matters here because this is the list somebody scans before
             * committing to open.
             */}
            <span
              aria-hidden
              className={`grid size-[22px] flex-none place-items-center rounded-full border-[1.6px] ${
                row.state === 'ok'
                  ? 'bg-success-500 border-success-500'
                  : row.state === 'missing'
                    ? 'border-warning-500 bg-transparent'
                    : 'border-n-300 border-dashed bg-transparent'
              }`}
            >
              {row.state === 'ok' ? <TickIcon /> : null}
            </span>
            <span className="min-w-[140px] flex-1 text-sm font-medium">{row.label}</span>
            <span
              className={`text-sm ${row.state === 'missing' ? 'text-warning-700' : 'text-fg-subtle'}`}
            >
              {row.value}
            </span>
          </div>
        ))}
      </div>

      <div className="border-border bg-surface overflow-hidden rounded-[14px] border">
        <div className="bg-bg-subtle border-border text-fg-subtle tracking-caps text-2xs border-b px-5 py-3.5 font-semibold uppercase">
          {t.readyLater}
        </div>
        {later.map((row) => (
          <div
            key={row.key}
            className="border-divider flex flex-wrap items-center gap-3.5 border-b px-5 py-3.5"
          >
            <span
              aria-hidden
              className="border-n-300 size-[22px] flex-none rounded-full border-[1.6px] border-dashed"
            />
            <span className="text-fg-muted min-w-[140px] flex-1 text-sm font-medium">
              {row.label}
            </span>
            <span className="text-fg-subtle text-sm">{row.why}</span>
          </div>
        ))}
      </div>

      {/*
       * The inverse panel, painted with the token rather than a utility.
       *
       * `--bg-inverse` and `--fg-inverse` are in the semantic layer and flip
       * with the theme, which is exactly what this panel needs — a dark card in
       * light mode, a light one in dark. Neither is mapped into Tailwind's
       * `@theme` block, so `bg-bg-inverse` compiles to nothing at all and the
       * panel would have rendered white text on a white card. Adding the
       * mapping belongs in packages/ui, which this surface does not own.
       */}
      <div
        className="border-border rounded-[16px] border p-6"
        style={{ background: 'var(--bg-inverse)', color: 'var(--fg-inverse)' }}
      >
        <div className="font-display text-2xl font-bold tracking-tight">{t.openH}</div>
        <p className="text-md mt-2 max-w-[520px] leading-relaxed text-pretty opacity-75">
          {t.openP}
        </p>
        <p className="mt-3 max-w-[520px] text-sm leading-relaxed text-pretty opacity-60">
          {t.openFloat}
        </p>

        <button
          type="button"
          disabled={blocked || busy || opened}
          onClick={onOpen}
          className="sw-tap bg-surface text-fg text-md mt-[18px] h-12 rounded-[12px] px-[22px] font-semibold disabled:cursor-not-allowed disabled:opacity-45"
        >
          {opened ? t.opened : busy ? shared.saving : t.openBtn}
        </button>

        {blocked && !opened ? <p className="mt-3 text-sm opacity-75">{t.blocked}</p> : null}
      </div>
    </div>
  );
}
