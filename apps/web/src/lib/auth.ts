import type { LoginPayload, User } from '@campus/types';
import { api } from './api';

/**
 * Sanctum SPA auth flow.
 * 1. GET /sanctum/csrf-cookie  → sets XSRF token cookie
 * 2. POST /login               → sets session cookie
 * 3. GET /api/v1/user          → returns authenticated user
 */
export async function login(payload: LoginPayload): Promise<User> {
  await fetch(`${process.env.NEXT_PUBLIC_API_URL?.replace('/api/v1', '')}/sanctum/csrf-cookie`, {
    credentials: 'include',
  });

  await api.post('/login', payload);

  const { data } = await api.get<{ data: User }>('/user');
  return data.data;
}

export async function logout(): Promise<void> {
  await api.post('/logout');
}

export async function fetchCurrentUser(): Promise<User | null> {
  try {
    const { data } = await api.get<{ data: User }>('/user');
    return data.data;
  } catch {
    return null;
  }
}
