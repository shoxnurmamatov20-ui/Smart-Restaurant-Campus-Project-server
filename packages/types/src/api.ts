/**
 * Common API response shapes.
 * Matches Laravel API Resource conventions.
 */

export type ApiSuccess<T> = {
  data: T;
  meta?: ApiMeta;
};

export type ApiError = {
  message: string;
  errors?: Record<string, string[]>;
  code?: string;
};

export type ApiResponse<T> = ApiSuccess<T> | ApiError;

export type ApiMeta = {
  current_page?: number;
  per_page?: number;
  total?: number;
  last_page?: number;
  next_cursor?: string | null;
  prev_cursor?: string | null;
};

export type PaginatedResponse<T> = {
  data: T[];
  meta: ApiMeta;
  links?: {
    first?: string;
    last?: string;
    prev?: string | null;
    next?: string | null;
  };
};

export type SortDirection = 'asc' | 'desc';

export type ListQuery = {
  page?: number;
  per_page?: number;
  cursor?: string;
  sort?: string;
  filter?: Record<string, string | number | boolean | string[]>;
  search?: string;
  include?: string[];
};
