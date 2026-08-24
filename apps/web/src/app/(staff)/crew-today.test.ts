import { describe, expect, it } from 'vitest';

import {
  callsFrom,
  sparkOf,
  todayFrom,
  type ApiCrewDashboard,
  type ApiWaiterCall,
} from '@restaurant/surfaces/crew/live';

/**
 * The owner's and the manager's home tab, from the dashboard endpoint.
 *
 * This panel used to render `TODAY[role]` end to end — an eighteen-million day
 * over five branches, with a delta and a leaderboard — and carried no `live`
 * flag at all. What is checked here is that nothing is invented on the live
 * path: a KPI the endpoint did not send is absent rather than filled in, a
 * comparison it did not make reads as an em dash rather than `+0.0%`, and the
 * headline names the reader's own venue rather than "5 filial".
 */
const labels = {
  revenueLabel: 'Bugungi tushum · Chilonzor',
  revenueNote: 'QQS bilan',
  listLabel: 'Filiallar',
  kpi: (key: string) => key.toUpperCase(),
};

const dash = (over: Partial<ApiCrewDashboard> = {}): ApiCrewDashboard => ({
  kpis: [
    { key: 'revenue', value: 1_842_000_000, unit: 'money', delta_percent: 12.4 },
    { key: 'orders', value: 206, unit: 'count', delta_percent: 7.5 },
  ],
  ...over,
});

describe('todayFrom', () => {
  it('takes the hero figure and its comparison from the payload', () => {
    const board = todayFrom(dash(), labels, 'owner');

    expect(board.revenue).toBe(1_842_000_000);
    expect(board.delta).toBe('+12.4%');
    expect(board.revenueLabel.uz).toBe('Bugungi tushum · Chilonzor');
  });

  it('reads a comparison the server did not make as an em dash, never as zero', () => {
    const board = todayFrom(
      dash({ kpis: [{ key: 'revenue', value: 0, unit: 'money', delta_percent: null }] }),
      labels,
      'owner',
    );

    expect(board.revenue).toBe(0);
    expect(board.delta).toBe('—');
  });

  it('drops a KPI the endpoint did not answer for rather than inventing one', () => {
    const board = todayFrom(
      dash({
        kpis: [
          { key: 'revenue', value: 100, unit: 'money' },
          { key: 'gross_profit', value: null, unit: 'money' },
          { key: 'orders', value: 12, unit: 'count' },
        ],
      }),
      labels,
      'owner',
    );

    // Revenue is the hero and never a tile; the null one is gone.
    expect(board.kpis.map((kpi) => kpi.label.uz)).toEqual(['ORDERS']);
  });

  it('lists branches for an owner and waiters for a manager', () => {
    const branches = todayFrom(
      dash({
        branches: [{ id: 1, name: 'Chilonzor', revenue_tiyin: 624_000_000, delta_percent: 8.1 }],
      }),
      labels,
      'owner',
    );

    expect(branches.list).toEqual([
      {
        name: 'Chilonzor',
        initials: 'C',
        revenue: 624_000_000,
        note: { uz: '+8.1%', ru: '+8.1%', en: '+8.1%' },
      },
    ]);

    const waiters = todayFrom(
      dash({ waiters: [{ id: 4, name: 'Aziza Karimova', revenue_tiyin: 100, orders: 14 }] }),
      labels,
      'manager',
    );

    expect(waiters.list[0]?.initials).toBe('AK');
    expect(waiters.list[0]?.note.uz).toBe('14');
  });

  it('leaves the leaderboard empty when the payload carried none', () => {
    expect(todayFrom(dash(), labels, 'owner').list).toEqual([]);
  });
});

describe('sparkOf', () => {
  it('draws nothing at all for a day with fewer than two readings', () => {
    expect(sparkOf([])).toBe('');
    expect(sparkOf([{ revenue_tiyin: 5 }])).toBe('');
  });

  it('scales to the day own peak, across the design 300x74 box', () => {
    // Two points: the trough sits on the floor, the peak six units from the top.
    expect(sparkOf([{ revenue_tiyin: 0 }, { revenue_tiyin: 100 }])).toBe('0,74 300,6');
  });

  it('draws a flat day as a flat line rather than as a climb', () => {
    const points = sparkOf([{ revenue_tiyin: 50 }, { revenue_tiyin: 50 }, { revenue_tiyin: 50 }]);

    expect(points).toBe('0,6 150,6 300,6');
  });
});

/* ------------------------------------------------------------------ calls */

/**
 * The waiter's call queue, from `GET /api/v1/tables/calls`.
 *
 * The panel drew three sample cards and its button set a local flag. What is
 * checked here is the composition: the table label the guest is sitting at, the
 * guest's own note over the canned sentence, and a kind the server may grow
 * landing somewhere visible rather than as a plate-going-cold edge on a bill.
 */
const words = {
  table: 'Stol',
  seat: "O'rin",
  title: { ready: 'taom tayyor', guest: 'mijoz chaqirdi', bill: "hisob so'radi" },
  body: { ready: 'Issiq stolda', guest: 'Tugmani bosdi', bill: 'Hisobni olib boring' },
  action: { ready: 'Oldim', guest: 'Bordim', bill: 'Olib bordim' },
} as const;

const call = (over: Partial<ApiWaiterCall> = {}): ApiWaiterCall => ({
  id: 91,
  kind: 'waiter',
  status: 'open',
  table: { id: 4, label: '14' },
  seat_no: null,
  note: null,
  waiting_minutes: 3,
  ...over,
});

describe('callsFrom', () => {
  it('names the table the guest is actually sitting at', () => {
    const [row] = callsFrom([call()], words);

    expect(row?.id).toBe('91');
    expect(row?.title.uz).toBe('Stol 14 · mijoz chaqirdi');
    expect(row?.waiting).toBe('3:00');
    expect(row?.action.uz).toBe('Bordim');
  });

  it('prefers what the guest typed over the canned sentence', () => {
    expect(callsFrom([call({ note: '  Sut kerak  ' })], words)[0]?.body.uz).toBe('Sut kerak');
    expect(callsFrom([call({ seat_no: 2 })], words)[0]?.body.uz).toBe("O'rin 2");
    expect(callsFrom([call()], words)[0]?.body.uz).toBe('Tugmani bosdi');
  });

  it('falls back to the row id when a table has no label', () => {
    expect(callsFrom([call({ table: { id: 7, label: null } })], words)[0]?.title.uz).toContain(
      'Stol 7',
    );
  });

  it('does not read an unknown kind as a plate going cold', () => {
    // `ready` carries the green edge and the top of the list. A kind the server
    // grows must not land there by accident.
    expect(callsFrom([call({ kind: 'something_new' })], words)[0]?.kind).toBe('guest');
    expect(callsFrom([call({ kind: 'bill' })], words)[0]?.kind).toBe('bill');
    expect(callsFrom([call({ kind: 'ready' })], words)[0]?.kind).toBe('ready');
  });
});
