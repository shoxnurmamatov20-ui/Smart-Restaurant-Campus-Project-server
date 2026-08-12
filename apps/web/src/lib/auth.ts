import type { User } from '@restaurant/types';
import { api } from './api';

/**
 * Signing in against the real API.
 *
 * This file used to describe a flow the server does not serve. It posted to
 * `/login` and read `/user`, which under the client's `/api/v1` base URL are
 * `/api/v1/login` and `/api/v1/user` — neither route exists. The endpoints are
 * `/auth/login` and `/auth/me`, and the API answers with a **token**, not a
 * session cookie: `POST /api/v1/auth/login` returns `{ token, user }` and every
 * later request carries `Authorization: Bearer`. Nothing caught it because the
 * only page that called it was the scaffold sign-in nobody used.
 *
 * The token already carries the restaurant. `ResolveTenant` falls back to the
 * authenticated user's `tenant_id`, so a staff client never needs to send
 * `X-Tenant` — verified against a running API, not assumed.
 *
 * What is still missing is the session, and it is deliberately missing rather
 * than half-built: a token held in JavaScript cannot be read by a server
 * component, and every console screen renders on the server. Closing that means
 * a route handler that signs in server-side and sets an httpOnly cookie, which
 * is the same piece of work as replacing the fixture seam in ./session.ts.
 * Until then this returns the user and the caller decides what to do with them.
 */
export type LoginPayload = {
  email: string;
  password: string;
  /** Named so a person can revoke one device without revoking the rest. */
  device_name?: string;
};

export type LoginResult = {
  token: string;
  user: User;
};

/**
 * Where Sanctum issues the CSRF cookie, derived from the API base.
 *
 * It sits at the application root, not under `/api/v1`, so the version segment
 * comes off. Split rather than `.replace('/api/v1', '')` so a deployment whose
 * base is `https://api.example.uz/v1` is handled too.
 */
function csrfEndpoint(): string {
  const base = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000/api/v1';
  const url = new URL(base);

  return `${url.origin}/sanctum/csrf-cookie`;
}

export async function login(payload: LoginPayload): Promise<LoginResult> {
  /*
   * Ask for the CSRF cookie first.
   *
   * The client sends credentials, and the console's origin is listed in
   * `SANCTUM_STATEFUL_DOMAINS`, so Sanctum treats these as session requests and
   * enforces CSRF on them — a POST without this returns 419, which surfaces to
   * a person as "wrong password" for a password that is right. curl never sees
   * it, because curl carries no cookies and no Origin; only a browser does.
   * Found exactly that way, against a running API.
   *
   * Axios reads the XSRF-TOKEN cookie this sets and adds the header itself.
   */
  await fetch(csrfEndpoint(), { credentials: 'include' });

  const { data } = await api.post<LoginResult>('/auth/login', {
    device_name: 'web',
    ...payload,
  });

  // Every subsequent call on this client instance is now that person's.
  api.defaults.headers.common['Authorization'] = `Bearer ${data.token}`;

  return data;
}

export async function logout(): Promise<void> {
  try {
    await api.post('/auth/logout');
  } finally {
    // Dropped even if the call failed: a token the server may still honour is
    // better forgotten here than left on a shared terminal.
    delete api.defaults.headers.common['Authorization'];
  }
}

export async function fetchCurrentUser(): Promise<User | null> {
  try {
    const { data } = await api.get<{ data: User }>('/auth/me');
    return data.data;
  } catch {
    return null;
  }
}

/**
 * What this person may do, from the server rather than from a guess.
 *
 * `GET /api/v1/auth/context` answers with the user, their restaurant and its
 * settings, the branch they are pinned to, their roles and the full permission
 * list. It is what ./session.ts will read once sessions are server-side, and
 * the reason clients do not infer capabilities from a role name.
 */
export type AuthContext = {
  user: User;
  tenant: { id: number; name: string; slug: string; locale: string; timezone: string };
  branch: { id: number; name: string } | null;
  branch_pinned: boolean;
  roles: string[];
  permissions: string[];
};

export async function fetchContext(): Promise<AuthContext> {
  const { data } = await api.get<AuthContext>('/auth/context');
  return data;
}
