import type { Messages } from '@/i18n';

/**
 * The roster, as the design's screen lists it.
 *
 * Sales and tickets are zero for anyone who does not take orders — a chef sells
 * nothing — and the screen shows that as an em dash rather than as 0, because a
 * kitchen hand with "0 so'm" beside their name reads like a performance figure.
 *
 * Wired to `GET /api/v1/staff/members` — see `./staff-server.ts`, which joins
 * today's rota and the open attendance records onto it. The list below is what
 * the screen draws with no session behind it.
 */

type Staff = Messages['console']['staff'];

/**
 * `StaffMember::POSITIONS`, as the API spells them, paired with the label
 * each takes in the roster.
 *
 * One list, read by the hire form's select and by the route handler that
 * forwards the form. There used to be two, and they drifted the day the API
 * grew two desk jobs: the select offered "Buxgalter" and the handler answered
 * 400 to it. `staff-server.test.ts` holds this list to the API's.
 */
export const POSITIONS: readonly { value: string; label: StaffRow['role'] }[] = [
  { value: 'waiter', label: 'roleWaiter' },
  { value: 'cook', label: 'roleKitchen' },
  { value: 'chef', label: 'roleHeadChef' },
  { value: 'cashier', label: 'roleCashier' },
  { value: 'bartender', label: 'roleBartender' },
  { value: 'host', label: 'roleHost' },
  { value: 'courier', label: 'roleCourier' },
  { value: 'storekeeper', label: 'roleStore' },
  { value: 'manager', label: 'roleShiftManager' },
  { value: 'accountant', label: 'roleAccountant' },
  { value: 'operator', label: 'roleOperator' },
];

export type StaffRow = {
  id: string;
  /**
   * The login behind the person, when there is one — `staff.members.user_id`.
   *
   * A pairing code is issued against a *user*, not a staff member: the phone
   * signs in as somebody, and somebody is an account. A hire with no account
   * yet has nothing to pair, and the screen says so rather than offering a
   * button that can only fail. Absent on the fixtures, which have no server.
   */
  userId?: number;
  /** A person's name is theirs; it is not translated. */
  name: string;
  role: keyof Pick<
    Staff,
    | 'roleShiftManager'
    | 'roleWaiter'
    | 'roleCashier'
    | 'roleHeadChef'
    | 'roleKitchen'
    | 'roleStore'
    | 'roleBartender'
    | 'roleHost'
    | 'roleCourier'
    | 'roleAccountant'
    | 'roleOperator'
  >;
  /** `StaffMember::POSITIONS`, as the API spells it — what the console password gate turns on. */
  position?: string;
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

/* ============================================================
   Attendance and payroll — `specs/01-os.md §5.10`

   The module shipped the people list alone, which answers "who works here" and
   nothing else. The two questions a manager actually opens this screen with are
   "who is late" and "what does this month cost", and neither was on it.
   ============================================================ */

export type AttendanceState = 'onTime' | 'late' | 'absent' | 'off';

export type AttendanceRow = {
  staffId: string;
  /** Rostered start, as the rota has it. */
  due: string;
  /** When they actually clocked in, or null. */
  clockedIn: string | null;
  clockedOut: string | null;
  state: AttendanceState;
  /** Minutes late. Zero unless `state` is `late`. */
  lateMinutes: number;
};

export const ATTENDANCE: readonly AttendanceRow[] = [
  {
    staffId: 'aziza',
    due: '09:00',
    clockedIn: '08:52',
    clockedOut: null,
    state: 'onTime',
    lateMinutes: 0,
  },
  {
    staffId: 'jasur',
    due: '10:00',
    clockedIn: '10:14',
    clockedOut: null,
    state: 'late',
    lateMinutes: 14,
  },
  {
    staffId: 'nodira',
    due: '10:00',
    clockedIn: '09:58',
    clockedOut: null,
    state: 'onTime',
    lateMinutes: 0,
  },
  {
    staffId: 'dilshod',
    due: '10:00',
    clockedIn: '10:02',
    clockedOut: null,
    state: 'onTime',
    lateMinutes: 2,
  },
  {
    staffId: 'bekzod',
    due: '08:00',
    clockedIn: '07:55',
    clockedOut: null,
    state: 'onTime',
    lateMinutes: 0,
  },
  {
    staffId: 'malika',
    due: '14:00',
    clockedIn: null,
    clockedOut: null,
    state: 'off',
    lateMinutes: 0,
  },
  {
    staffId: 'sardor',
    due: '08:00',
    clockedIn: null,
    clockedOut: null,
    state: 'absent',
    lateMinutes: 0,
  },
];

/**
 * Two minutes late is on time.
 *
 * A grace period, and it is the difference between an attendance screen a
 * manager uses and one they learn to ignore. Marking somebody late for being
 * ninety seconds behind produces a list where everybody is late, and then
 * nobody looks at it.
 */
export const LATE_GRACE_MINUTES = 5;

export const isLate = (row: AttendanceRow): boolean => row.lateMinutes > LATE_GRACE_MINUTES;

export type PayrollRow = {
  staffId: string;
  /** Tiyin, this month. */
  base: number;
  /** Service share and sales bonus, tiyin. */
  bonus: number;
  /** Tax and anything withheld, tiyin. */
  deductions: number;
  /** Paid on the fifth, as an advance. */
  advance: number;
};

export const PAYROLL: readonly PayrollRow[] = [
  {
    staffId: 'aziza',
    base: som(9_500_000),
    bonus: som(1_800_000),
    deductions: som(1_130_000),
    advance: som(3_800_000),
  },
  {
    staffId: 'jasur',
    base: som(4_200_000),
    bonus: som(2_340_000),
    deductions: som(654_000),
    advance: som(1_680_000),
  },
  {
    staffId: 'nodira',
    base: som(4_200_000),
    bonus: som(1_980_000),
    deductions: som(618_000),
    advance: som(1_680_000),
  },
  {
    staffId: 'dilshod',
    base: som(4_800_000),
    bonus: som(600_000),
    deductions: som(540_000),
    advance: som(1_920_000),
  },
  {
    staffId: 'bekzod',
    base: som(7_200_000),
    bonus: som(900_000),
    deductions: som(810_000),
    advance: som(2_880_000),
  },
  {
    staffId: 'malika',
    base: som(6_400_000),
    bonus: som(300_000),
    deductions: som(670_000),
    advance: som(2_560_000),
  },
  {
    staffId: 'sardor',
    base: som(5_100_000),
    bonus: som(400_000),
    deductions: som(550_000),
    advance: som(2_040_000),
  },
];

/** What is still owed on payday, after the advance already paid. */
export const stillOwed = (row: PayrollRow): number =>
  row.base + row.bonus - row.deductions - row.advance;

export const netPay = (row: PayrollRow): number => row.base + row.bonus - row.deductions;
