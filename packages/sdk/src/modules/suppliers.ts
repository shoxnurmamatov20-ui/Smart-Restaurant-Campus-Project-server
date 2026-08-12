import type { AxiosInstance } from 'axios';
import type { ListParams, ModuleInfo, Paginated, Single } from './contracts';

// ============ Suppliers module types ============

export type Supplier = {
  id: number;
  code: string;
  name: string;
  contact_name: string | null;
  phone: string | null;
  email: string | null;
  payment_terms_days: number;
  rating: number;
  debt: number;
  is_active: boolean;
};

export type PurchaseOrderItem = {
  id: number;
  purchase_order_id: number;
  ingredient_id: number | null;
  name: string;
  quantity: number;
  unit_price: number;
  total_price: number;
};

export type PurchaseOrder = {
  id: number;
  supplier_id: number;
  supplier?: { id: number; name: string };
  number: string;
  status: 'draft' | 'sent' | 'confirmed' | 'received' | 'cancelled';
  expected_at: string | null;
  received_at: string | null;
  total: number;
  note: string | null;
  items?: PurchaseOrderItem[];
};

// ============ Client ============

/**
 * Suppliers API client.
 *
 * Module clients never import each other — same boundary as the backend
 * modules. Anything genuinely shared lives in ./contracts.
 */
export const createSuppliersClient = (client: AxiosInstance) => ({
  /** Capability discovery — labels, endpoints and headline counts. */
  info: () => client.get<ModuleInfo>('/suppliers/'),

  listSuppliers: (params?: ListParams) =>
    client.get<Paginated<Supplier>>('/suppliers/suppliers', { params }),

  getSupplier: (id: number) => client.get<Single<Supplier>>(`/suppliers/suppliers/${id}`),

  createSupplier: (payload: Partial<Supplier> & Record<string, unknown>) =>
    client.post<Single<Supplier>>('/suppliers/suppliers', payload),

  updateSupplier: (id: number, payload: Partial<Supplier> & Record<string, unknown>) =>
    client.patch<Single<Supplier>>(`/suppliers/suppliers/${id}`, payload),

  deleteSupplier: (id: number) => client.delete<void>(`/suppliers/suppliers/${id}`),

  listPurchaseOrders: (params?: ListParams) =>
    client.get<Paginated<PurchaseOrder>>('/suppliers/purchase-orders', { params }),

  getPurchaseOrder: (id: number) =>
    client.get<Single<PurchaseOrder>>(`/suppliers/purchase-orders/${id}`),

  createPurchaseOrder: (payload: Partial<PurchaseOrder> & Record<string, unknown>) =>
    client.post<Single<PurchaseOrder>>('/suppliers/purchase-orders', payload),

  updatePurchaseOrder: (id: number, payload: Partial<PurchaseOrder> & Record<string, unknown>) =>
    client.patch<Single<PurchaseOrder>>(`/suppliers/purchase-orders/${id}`, payload),

  deletePurchaseOrder: (id: number) => client.delete<void>(`/suppliers/purchase-orders/${id}`),

  addLine: (
    purchaseOrderId: number,
    payload: { ingredient_id?: number; name: string; quantity: number; unit_price: number },
  ) =>
    client.post<{ data: PurchaseOrderItem }>(
      `/suppliers/purchase-orders/${purchaseOrderId}/items`,
      payload,
    ),

  /** Receiving is what turns a purchase into stock and debt. Idempotent-guarded. */
  receive: (purchaseOrderId: number) =>
    client.post<{ data: PurchaseOrder }>(`/suppliers/purchase-orders/${purchaseOrderId}/receive`),
});

export type SuppliersClient = ReturnType<typeof createSuppliersClient>;
