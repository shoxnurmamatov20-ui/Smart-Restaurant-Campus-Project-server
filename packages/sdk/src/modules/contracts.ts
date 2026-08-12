/**
 * Shapes shared by more than one module client.
 *
 * The admission rule mirrors the backend's Core: something lives here only if
 * at least two modules genuinely need it. Everything else stays in its own
 * module file, so the client boundaries match the server's.
 */

/** Content the API returns per locale. `title` is the resolved convenience field. */
export type Translated = { uz?: string; ru?: string; en?: string };

export type SalesChannel = 'dine_in' | 'takeaway' | 'delivery' | 'aggregator';

export type KitchenStationCode = 'hot' | 'cold' | 'grill' | 'bar' | 'pastry';

/** Laravel API Resource collection envelope. */
export type Paginated<T> = {
  data: T[];
  links: { first: string | null; last: string | null; prev: string | null; next: string | null };
  meta: {
    current_page: number;
    from: number | null;
    last_page: number;
    per_page: number;
    to: number | null;
    total: number;
  };
};

export type Single<T> = { data: T };

/** Spatie QueryBuilder conventions: ?filter[x]=y&sort=-z&per_page=n */
export type ListParams = {
  filter?: Record<string, string | number | boolean>;
  sort?: string;
  include?: string;
  per_page?: number;
  page?: number;
};

/** What every module's discovery endpoint returns. */
export type ModuleInfo = {
  module: string;
  alias: string;
  labels: Translated;
  description: string;
  enabled: boolean;
  endpoints: Record<string, string>;
  counts?: Record<string, number | string | null>;
};
