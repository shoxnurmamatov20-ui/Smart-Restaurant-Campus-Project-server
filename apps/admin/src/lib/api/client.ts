import { createClient } from '@campus/sdk';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000/api/v1';

/**
 * Admin API client — all calls hit /api/v1/admin/...
 * Requires super-admin role on the server side.
 */
export const adminApi = createClient({
  baseURL: API_URL,
  onUnauthorized: () => {
    if (typeof window !== 'undefined') {
      window.location.href = '/login';
    }
  },
});
