import type { LoginPayload, User } from '@restaurant/types';
import { adminApi } from '../api/client';

/**
 * Platform admin login (always 2FA).
 * Returns user + session (cookie-based via Sanctum).
 */
export async function adminLogin(
  payload: LoginPayload & { two_factor_code: string },
): Promise<User> {
  await fetch(`${process.env.NEXT_PUBLIC_API_URL?.replace('/api/v1', '')}/sanctum/csrf-cookie`, {
    credentials: 'include',
  });

  await adminApi.post('/admin/login', payload);

  const { data } = await adminApi.get<{ data: User }>('/user');

  if (!data.data.roles.includes('super-admin')) {
    throw new Error('Super-admin emassiz');
  }

  return data.data;
}

export async function adminLogout(): Promise<void> {
  await adminApi.post('/logout');
}
