import type { AxiosInstance } from 'axios';
import type { ListParams, ModuleInfo, Paginated, Single } from './contracts';

// ============ Staff module types ============

export type AttendanceMethod = 'face' | 'qr' | 'pin';

export type StaffMember = {
  id: number;
  employee_code: string;
  full_name: string;
  first_name: string;
  last_name: string;
  phone: string | null;
  position:
    | 'waiter'
    | 'cook'
    | 'chef'
    | 'cashier'
    | 'bartender'
    | 'host'
    | 'courier'
    | 'storekeeper'
    | 'manager';
  branch_code: string | null;
  hourly_rate: number;
  status: 'active' | 'on_leave' | 'suspended' | 'terminated';
  hired_at: string | null;
  health_book_expires_at: string | null;
  health_book_expired: boolean;
  user_id: number | null;
};

export type Shift = {
  id: number;
  staff_member_id: number;
  starts_at: string | null;
  ends_at: string | null;
  planned_hours: number;
  role: string | null;
  status: 'planned' | 'confirmed' | 'swapped' | 'cancelled';
  note: string | null;
};

export type Attendance = {
  id: number;
  staff_member_id: number;
  checked_in_at: string | null;
  checked_out_at: string | null;
  is_open: boolean;
  method: AttendanceMethod;
  minutes_worked: number;
  earned_tiyin: number;
  is_late: boolean;
  note: string | null;
};

// ============ Client ============

/**
 * Staff API client.
 *
 * Module clients never import each other — same boundary as the backend
 * modules. Anything genuinely shared lives in ./contracts.
 */
export const createStaffClient = (client: AxiosInstance) => ({
  /** Capability discovery — labels, endpoints and headline counts. */
  info: () => client.get<ModuleInfo>('/staff/'),

  listMembers: (params?: ListParams) =>
    client.get<Paginated<StaffMember>>('/staff/members', { params }),

  getMember: (id: number) => client.get<Single<StaffMember>>(`/staff/members/${id}`),

  createMember: (payload: Partial<StaffMember> & Record<string, unknown>) =>
    client.post<Single<StaffMember>>('/staff/members', payload),

  updateMember: (id: number, payload: Partial<StaffMember> & Record<string, unknown>) =>
    client.patch<Single<StaffMember>>(`/staff/members/${id}`, payload),

  deleteMember: (id: number) => client.delete<void>(`/staff/members/${id}`),

  listShifts: (params?: ListParams) => client.get<Paginated<Shift>>('/staff/shifts', { params }),

  getShift: (id: number) => client.get<Single<Shift>>(`/staff/shifts/${id}`),

  createShift: (payload: Partial<Shift> & Record<string, unknown>) =>
    client.post<Single<Shift>>('/staff/shifts', payload),

  updateShift: (id: number, payload: Partial<Shift> & Record<string, unknown>) =>
    client.patch<Single<Shift>>(`/staff/shifts/${id}`, payload),

  deleteShift: (id: number) => client.delete<void>(`/staff/shifts/${id}`),

  listAttendances: (params?: ListParams) =>
    client.get<Paginated<Attendance>>('/staff/attendances', { params }),

  getAttendance: (id: number) => client.get<Single<Attendance>>(`/staff/attendances/${id}`),

  createAttendance: (payload: Partial<Attendance> & Record<string, unknown>) =>
    client.post<Single<Attendance>>('/staff/attendances', payload),

  updateAttendance: (id: number, payload: Partial<Attendance> & Record<string, unknown>) =>
    client.patch<Single<Attendance>>(`/staff/attendances/${id}`, payload),

  deleteAttendance: (id: number) => client.delete<void>(`/staff/attendances/${id}`),

  checkIn: (staffMemberId: number, method: AttendanceMethod = 'pin') =>
    client.post<{ data: Attendance }>('/staff/attendance/check-in', {
      staff_member_id: staffMemberId,
      method,
    }),

  checkOut: (staffMemberId: number) =>
    client.post<{ data: Attendance }>('/staff/attendance/check-out', {
      staff_member_id: staffMemberId,
    }),
});

export type StaffClient = ReturnType<typeof createStaffClient>;
