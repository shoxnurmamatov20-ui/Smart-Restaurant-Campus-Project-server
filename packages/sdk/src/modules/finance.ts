import type { AxiosInstance } from 'axios';
import type { ListParams, ModuleInfo, Paginated, Single } from './contracts';

// ============ Finance module types ============

export type PaymentMethod = 'cash' | 'card' | 'payme' | 'click' | 'uzum' | 'corporate';

export type CashShift = {
  id: number;
  number: string;
  opened_by_user_id: number | null;
  opened_at: string | null;
  closed_at: string | null;
  is_open: boolean;
  opening_cash: number;
  expected_cash: number;
  counted_cash: number;
  /** counted − expected. Negative means the drawer is short. */
  difference: number;
  total_takings: number;
  status: 'open' | 'closed';
  note: string | null;
};

export type Payment = {
  id: number;
  cash_shift_id: number | null;
  order_id: number | null;
  order_number: string | null;
  method: PaymentMethod;
  amount: number;
  status: 'captured' | 'refunded';
  fiscal_receipt_no: string | null;
  paid_at: string | null;
  refunded_at: string | null;
  refund_reason: string | null;
};

export type Expense = {
  id: number;
  cash_shift_id: number | null;
  category: 'rent' | 'utilities' | 'payroll' | 'purchase' | 'marketing' | 'repair' | 'other';
  description: string;
  amount: number;
  paid_in_cash: boolean;
  spent_at: string | null;
};

// ============ Client ============

/**
 * Finance API client.
 *
 * Module clients never import each other — same boundary as the backend
 * modules. Anything genuinely shared lives in ./contracts.
 */
export const createFinanceClient = (client: AxiosInstance) => ({
  /** Capability discovery — labels, endpoints and headline counts. */
  info: () => client.get<ModuleInfo>('/finance/'),

  listShifts: (params?: ListParams) =>
    client.get<Paginated<CashShift>>('/finance/shifts', { params }),

  getShift: (id: number) => client.get<Single<CashShift>>(`/finance/shifts/${id}`),

  createShift: (payload: Partial<CashShift> & Record<string, unknown>) =>
    client.post<Single<CashShift>>('/finance/shifts', payload),

  updateShift: (id: number, payload: Partial<CashShift> & Record<string, unknown>) =>
    client.patch<Single<CashShift>>(`/finance/shifts/${id}`, payload),

  deleteShift: (id: number) => client.delete<void>(`/finance/shifts/${id}`),

  listPayments: (params?: ListParams) =>
    client.get<Paginated<Payment>>('/finance/payments', { params }),

  getPayment: (id: number) => client.get<Single<Payment>>(`/finance/payments/${id}`),

  createPayment: (payload: Partial<Payment> & Record<string, unknown>) =>
    client.post<Single<Payment>>('/finance/payments', payload),

  updatePayment: (id: number, payload: Partial<Payment> & Record<string, unknown>) =>
    client.patch<Single<Payment>>(`/finance/payments/${id}`, payload),

  deletePayment: (id: number) => client.delete<void>(`/finance/payments/${id}`),

  listExpenses: (params?: ListParams) =>
    client.get<Paginated<Expense>>('/finance/expenses', { params }),

  getExpens: (id: number) => client.get<Single<Expense>>(`/finance/expenses/${id}`),

  createExpens: (payload: Partial<Expense> & Record<string, unknown>) =>
    client.post<Single<Expense>>('/finance/expenses', payload),

  updateExpens: (id: number, payload: Partial<Expense> & Record<string, unknown>) =>
    client.patch<Single<Expense>>(`/finance/expenses/${id}`, payload),

  deleteExpens: (id: number) => client.delete<void>(`/finance/expenses/${id}`),

  openShift: (openingCash = 0) =>
    client.post<{ data: CashShift }>('/finance/shifts/open', { opening_cash: openingCash }),

  /** Z-report: the server derives expected cash; you only send the count. */
  closeShift: (shiftId: number, countedCash: number, note?: string) =>
    client.post<{ data: CashShift }>(`/finance/shifts/${shiftId}/close`, {
      counted_cash: countedCash,
      note,
    }),

  refund: (paymentId: number, reason: string) =>
    client.post<{ data: Payment }>(`/finance/payments/${paymentId}/refund`, { reason }),
});

export type FinanceClient = ReturnType<typeof createFinanceClient>;
