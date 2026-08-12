import type { AxiosInstance } from 'axios';
import type { ListParams, ModuleInfo, Paginated, Single } from './contracts';

// ============ CRM module types ============

export type LoyaltyKind = 'earn' | 'redeem' | 'adjust' | 'expire';

export type Customer = {
  id: number;
  phone: string;
  name: string | null;
  birthday: string | null;
  birthday_is_today: boolean;
  points: number;
  tier: 'bronze' | 'silver' | 'gold';
  cashback: number;
  visits_count: number;
  total_spent: number;
  average_cheque: number;
  allergens: string[];
  note: string | null;
  is_active: boolean;
};

export type LoyaltyTransaction = {
  id: number;
  customer_id: number;
  kind: LoyaltyKind;
  points: number;
  balance_after: number;
  order_id: number | null;
  note: string | null;
};

export type Feedback = {
  id: number;
  customer_id: number | null;
  order_id: number | null;
  score: number;
  comment: string | null;
  aspect: string | null;
  source: 'bot' | 'web' | 'qr' | 'aggregator';
  is_urgent: boolean;
  status: 'new' | 'in_review' | 'resolved' | 'dismissed';
  resolved_at: string | null;
};

// ============ Client ============

/**
 * CRM API client.
 *
 * Module clients never import each other — same boundary as the backend
 * modules. Anything genuinely shared lives in ./contracts.
 */
export const createCRMClient = (client: AxiosInstance) => ({
  /** Capability discovery — labels, endpoints and headline counts. */
  info: () => client.get<ModuleInfo>('/crm/'),

  listCustomers: (params?: ListParams) =>
    client.get<Paginated<Customer>>('/crm/customers', { params }),

  getCustomer: (id: number) => client.get<Single<Customer>>(`/crm/customers/${id}`),

  createCustomer: (payload: Partial<Customer> & Record<string, unknown>) =>
    client.post<Single<Customer>>('/crm/customers', payload),

  updateCustomer: (id: number, payload: Partial<Customer> & Record<string, unknown>) =>
    client.patch<Single<Customer>>(`/crm/customers/${id}`, payload),

  deleteCustomer: (id: number) => client.delete<void>(`/crm/customers/${id}`),

  listLoyalty: (params?: ListParams) =>
    client.get<Paginated<LoyaltyTransaction>>('/crm/loyalty', { params }),

  getLoyalty: (id: number) => client.get<Single<LoyaltyTransaction>>(`/crm/loyalty/${id}`),

  createLoyalty: (payload: Partial<LoyaltyTransaction> & Record<string, unknown>) =>
    client.post<Single<LoyaltyTransaction>>('/crm/loyalty', payload),

  updateLoyalty: (id: number, payload: Partial<LoyaltyTransaction> & Record<string, unknown>) =>
    client.patch<Single<LoyaltyTransaction>>(`/crm/loyalty/${id}`, payload),

  deleteLoyalty: (id: number) => client.delete<void>(`/crm/loyalty/${id}`),

  listFeedbacks: (params?: ListParams) =>
    client.get<Paginated<Feedback>>('/crm/feedbacks', { params }),

  getFeedback: (id: number) => client.get<Single<Feedback>>(`/crm/feedbacks/${id}`),

  createFeedback: (payload: Partial<Feedback> & Record<string, unknown>) =>
    client.post<Single<Feedback>>('/crm/feedbacks', payload),

  updateFeedback: (id: number, payload: Partial<Feedback> & Record<string, unknown>) =>
    client.patch<Single<Feedback>>(`/crm/feedbacks/${id}`, payload),

  deleteFeedback: (id: number) => client.delete<void>(`/crm/feedbacks/${id}`),

  adjustPoints: (
    customerId: number,
    payload: { kind: LoyaltyKind; points: number; order_id?: number; note?: string },
  ) =>
    client.post<{ transaction: LoyaltyTransaction; customer: Customer }>(
      `/crm/customers/${customerId}/points`,
      payload,
    ),

  resolveFeedback: (id: number) => client.post<{ data: Feedback }>(`/crm/feedbacks/${id}/resolve`),
});

export type CRMClient = ReturnType<typeof createCRMClient>;
