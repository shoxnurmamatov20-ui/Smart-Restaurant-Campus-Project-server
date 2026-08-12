import type { Messages } from '@/i18n';

/**
 * The roster, as the design's screen lists it.
 *
 * Sales and tickets are zero for anyone who does not take orders — a chef sells
 * nothing — and the screen shows that as an em dash rather than as 0, because a
 * kitchen hand with "0 so'm" beside their name reads like a performance figure.
 *
 * TODO(api): GET /api/v1/staff — the roster with today's shift and the clock-in
 * state, which Attendance owns.
 */

type Staff = Messages['console']['staff'];

export type StaffRow = {
  id: string;
  /** A person's name is theirs; it is not translated. */
  name: string;
  role: keyof Pick<
    Staff,
    'roleShiftManager' | 'roleWaiter' | 'roleCashier' | 'roleHeadChef' | 'roleKitchen' | 'roleStore'
  >;
  shift: string;
  clockedIn: boolean;
  /** Hours worked this week. */
  hours: number;
  /** Tiyin taken this week, or 0 for a role that does not sell. */
  sales: number;
  tickets: number;
};

/** 1 UZS = 100 tiyin. */
const som = (value: number): number => value * 100;

export const STAFF: readonly StaffRow[] = [
  {
    id: 'aziza',
    name: 'Aziza Rasulova',
    role: 'roleShiftManager',
    shift: '09:00 – 18:00',
    clockedIn: true,
    hours: 38,
    sales: som(6_240_000),
    tickets: 62,
  },
  {
    id: 'jasur',
    name: 'Jasur Toshev',
    role: 'roleWaiter',
    shift: '10:00 – 19:00',
    clockedIn: true,
    hours: 36,
    sales: som(4_180_000),
    tickets: 48,
  },
  {
    id: 'nodira',
    name: 'Nodira Saidova',
    role: 'roleWaiter',
    shift: '10:00 – 19:00',
    clockedIn: true,
    hours: 41,
    sales: som(5_310_000),
    tickets: 55,
  },
  {
    id: 'dilshod',
    name: 'Dilshod Karimov',
    role: 'roleCashier',
    shift: '08:00 – 17:00',
    clockedIn: true,
    hours: 39,
    sales: som(2_960_000),
    tickets: 71,
  },
  {
    id: 'bekzod',
    name: 'Bekzod Alimov',
    role: 'roleHeadChef',
    shift: '08:00 – 20:00',
    clockedIn: true,
    hours: 46,
    sales: 0,
    tickets: 0,
  },
  {
    id: 'malika',
    name: 'Malika Yusupova',
    role: 'roleKitchen',
    shift: '12:00 – 21:00',
    clockedIn: false,
    hours: 32,
    sales: 0,
    tickets: 0,
  },
  {
    id: 'sardor',
    name: 'Sardor Nazarov',
    role: 'roleStore',
    shift: '07:00 – 15:00',
    clockedIn: false,
    hours: 34,
    sales: 0,
    tickets: 0,
  },
];
