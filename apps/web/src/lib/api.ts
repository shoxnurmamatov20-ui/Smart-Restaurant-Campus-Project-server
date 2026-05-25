import { createClient } from '@campus/sdk';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000/api/v1';

/**
 * Shared API client instance for the web app.
 * Uses Sanctum SPA auth (cookies, withCredentials: true).
 */
export const api = createClient({
  baseURL: API_URL,
  onUnauthorized: () => {
    // Redirect to login on 401
    if (typeof window !== 'undefined') {
      window.location.href = '/login';
    }
  },
});
