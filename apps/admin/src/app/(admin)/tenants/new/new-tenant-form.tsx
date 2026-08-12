'use client';

import Link from 'next/link';
import { useState } from 'react';

import { formatTiyinAmount } from '@restaurant/utils';

import { PLANS, type Plan } from '../../platform-data';

/**
 * Opening a restaurant on the platform.
 *
 * The design draws this as a modal. Here it is a page: a modal cannot be linked
 * to, survives no reload, and this form is the start of a commercial
 * relationship rather than a quick confirmation.
 *
 * City is a set of chips rather than a text field. The platform sells in eight
 * cities; a free-text field would collect eight spellings of Toshkent and make
 * every later report wrong.
 *
 * TODO — once the platform API lands:
 *   - POST /api/v1/admin/tenants, and the owner invite that follows
 *   - Phone verification before the trial starts
 *   - Subdomain choice, which the tenant middleware resolves on
 */
const CITIES = [
  'Toshkent',
  'Samarqand',
  'Buxoro',
  "Farg'ona",
  'Namangan',
  'Andijon',
  'Termiz',
  'Nukus',
];

const FIELD =
  'bg-bg-subtle focus:bg-surface focus:border-brand-300 focus:ring-focus h-[46px] w-full rounded-md border px-3.5 text-md outline-none focus:ring-[3px]';
const LABEL = 'mb-2 block text-sm font-semibold';
const CHIP_ON = 'border-brand-500 bg-brand-50 text-brand-700';
const CHIP_OFF = 'bg-surface text-fg-muted';

export function NewTenantForm() {
  const [city, setCity] = useState(CITIES[0]!);
  const [plan, setPlan] = useState<Plan['id']>('Growth');

  return (
    <form
      className="bg-surface max-w-[560px] overflow-hidden rounded-xl border shadow-xl"
      onSubmit={(event) => event.preventDefault()}
    >
      <div className="border-divider border-b px-[26px] pt-6 pb-[18px]">
        <h2 className="font-display tracking-snug text-xl font-semibold">Yangi restoran</h2>
        <p className="text-fg-muted mt-1.5 text-sm">14 kunlik sinov muddati bilan ochiladi</p>
      </div>

      <div className="px-[26px] py-[22px]">
        <label htmlFor="tenant-name" className={LABEL}>
          Restoran nomi
        </label>
        <input
          id="tenant-name"
          name="name"
          type="text"
          required
          placeholder="masalan, Osh Xona"
          className={`${FIELD} mb-5`}
        />

        <div className="mb-5 grid grid-cols-2 gap-3.5">
          <div>
            <label htmlFor="tenant-owner" className={LABEL}>
              Egasining ismi
            </label>
            <input
              id="tenant-owner"
              name="owner"
              type="text"
              required
              placeholder="Ism familiya"
              className={FIELD}
            />
          </div>
          <div>
            <label htmlFor="tenant-phone" className={LABEL}>
              Telefon
            </label>
            <input
              id="tenant-phone"
              name="phone"
              type="tel"
              required
              inputMode="tel"
              placeholder="+998 90 000 00 00"
              className={FIELD}
            />
          </div>
        </div>

        <fieldset className="mb-[22px]">
          <legend className="mb-2.5 text-sm font-semibold">Shahar</legend>
          <div className="flex flex-wrap gap-2">
            {CITIES.map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => setCity(option)}
                aria-pressed={city === option}
                className={`rounded-pill h-[38px] border px-3.5 text-sm font-medium ${
                  city === option ? CHIP_ON : CHIP_OFF
                }`}
              >
                {option}
              </button>
            ))}
          </div>
        </fieldset>

        <fieldset>
          <legend className="mb-2.5 text-sm font-semibold">Tarif</legend>
          <div className="grid grid-cols-3 gap-2">
            {PLANS.map((option) => (
              <button
                key={option.id}
                type="button"
                onClick={() => setPlan(option.id)}
                aria-pressed={plan === option.id}
                className={`flex min-h-[72px] flex-col items-start justify-center gap-1.5 rounded-md border px-3.5 py-3 ${
                  plan === option.id ? CHIP_ON : CHIP_OFF
                }`}
              >
                <span className="text-sm font-semibold">{option.id}</span>
                <span data-num className="text-fg-subtle text-xs">
                  {formatTiyinAmount(option.priceTiyin)}
                </span>
              </button>
            ))}
          </div>
        </fieldset>
      </div>

      <div className="border-divider flex gap-2.5 border-t px-[26px] pt-[18px] pb-[22px]">
        <Link
          href="/tenants"
          className="hover:bg-bg-subtle flex h-12 flex-1 items-center justify-center rounded-md border text-sm font-semibold"
        >
          Bekor qilish
        </Link>
        <button
          type="submit"
          className="bg-brand-500 hover:bg-brand-600 flex h-12 flex-[1.5] items-center justify-center rounded-md text-sm font-semibold text-white"
        >
          Restoranni ochish
        </button>
      </div>
    </form>
  );
}
