import type { AxiosInstance } from 'axios';
import type { ListParams, ModuleInfo, Paginated, Single } from './contracts';

// ============ Inventory module types ============

export type StockMovementKind = 'receipt' | 'consumption' | 'write_off' | 'transfer' | 'stock_take';

export type Ingredient = {
  id: number;
  sku: string;
  name: string;
  /** Quantities are integers in this unit — grams, millilitres or pieces. */
  unit: 'g' | 'ml' | 'pcs';
  stock_quantity: number;
  min_quantity: number;
  is_low: boolean;
  cost_per_unit: number;
  stock_value: number;
  storage: 'dry' | 'chilled' | 'frozen' | null;
  shelf_life_days: number | null;
  is_active: boolean;
};

export type StockMovement = {
  id: number;
  ingredient_id: number;
  kind: StockMovementKind;
  quantity: number;
  balance_after: number;
  reason: string | null;
  reference: string | null;
  happened_at: string | null;
};

// ============ Client ============

/**
 * Inventory API client.
 *
 * Module clients never import each other — same boundary as the backend
 * modules. Anything genuinely shared lives in ./contracts.
 */
export const createInventoryClient = (client: AxiosInstance) => ({
  /** Capability discovery — labels, endpoints and headline counts. */
  info: () => client.get<ModuleInfo>('/inventory/'),

  listIngredients: (params?: ListParams) =>
    client.get<Paginated<Ingredient>>('/inventory/ingredients', { params }),

  getIngredient: (id: number) => client.get<Single<Ingredient>>(`/inventory/ingredients/${id}`),

  createIngredient: (payload: Partial<Ingredient> & Record<string, unknown>) =>
    client.post<Single<Ingredient>>('/inventory/ingredients', payload),

  updateIngredient: (id: number, payload: Partial<Ingredient> & Record<string, unknown>) =>
    client.patch<Single<Ingredient>>(`/inventory/ingredients/${id}`, payload),

  deleteIngredient: (id: number) => client.delete<void>(`/inventory/ingredients/${id}`),

  listMovements: (params?: ListParams) =>
    client.get<Paginated<StockMovement>>('/inventory/movements', { params }),

  getMovement: (id: number) => client.get<Single<StockMovement>>(`/inventory/movements/${id}`),

  createMovement: (payload: Partial<StockMovement> & Record<string, unknown>) =>
    client.post<Single<StockMovement>>('/inventory/movements', payload),

  updateMovement: (id: number, payload: Partial<StockMovement> & Record<string, unknown>) =>
    client.patch<Single<StockMovement>>(`/inventory/movements/${id}`, payload),

  deleteMovement: (id: number) => client.delete<void>(`/inventory/movements/${id}`),

  /** Positive adds, negative removes. A write-off must carry a reason. */
  move: (
    ingredientId: number,
    payload: { kind: StockMovementKind; quantity: number; reason?: string; reference?: string },
  ) =>
    client.post<{ movement: StockMovement; ingredient: Ingredient }>(
      `/inventory/ingredients/${ingredientId}/movements`,
      payload,
    ),
});

export type InventoryClient = ReturnType<typeof createInventoryClient>;
