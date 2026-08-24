import { describe, expect, it } from 'vitest';

import type { Pulse } from './shell-server';
import { stripFrom } from './strip';

const t = (key: string, values?: Record<string, string | number>): string =>
  values ? `${key}(${Object.values(values).join(',')})` : key;

const now = new Date(2026, 7, 22, 12, 0, 0);

const quiet: Pulse = {
  shift_open_since: null,
  floor: { occupied: 0, free: 0 },
  kitchen: { open: 0, oldest_minutes: null },
  stock: { low: 0, out: 0 },
  orders_open: 0,
  cases_open: 0,
};

describe('stripFrom', () => {
  it('keeps the design sentence for the fixture console only', () => {
    expect(stripFrom(null, t, 'uz', now).tables).toBe('tablesSeated');
  });

  it('tells a brand-new restaurant the truth: nothing open, nothing set up, nothing short', () => {
    const strip = stripFrom(quiet, t, 'uz', now);

    expect(strip.service).toBe('serviceClosed');
    expect(strip.tables).toBe('tablesNone');
    expect(strip.kitchen).toBe('kitchenIdle');
    expect(strip.stock).toBe('stockFine');
    expect(strip.stockShort).toBe(false);
    expect(strip.kitchenBusy).toBe(false);
  });

  it('counts a trading evening', () => {
    const strip = stripFrom(
      {
        shift_open_since: new Date(2026, 7, 22, 11, 24).toISOString(),
        floor: { occupied: 14, free: 18 },
        kitchen: { open: 7, oldest_minutes: 11 },
        stock: { low: 3, out: 1 },
        orders_open: 12,
        cases_open: 3,
      },
      t,
      'uz',
      now,
    );

    expect(strip.service).toBe('serviceOpenAt(11:24)');
    expect(strip.tables).toBe('tablesSeatedOf(14,32)');
    expect(strip.kitchen).toBe('kitchenLoadOf(7,11)');
    expect(strip.stock).toBe('lowStockOf(4)');
    expect(strip.stockShort).toBe(true);
  });

  it('names the day for a till left open since yesterday', () => {
    const strip = stripFrom(
      { ...quiet, shift_open_since: new Date(2026, 7, 21, 23, 10).toISOString() },
      t,
      'en',
      now,
    );

    expect(strip.service).toMatch(/serviceOpenAt\(.*Fri.*23:10\)/);
  });
});
