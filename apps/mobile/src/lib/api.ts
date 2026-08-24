import Constants from 'expo-constants';
import type { ApiError, PaginatedResponse } from '@restaurant/types';

import { KEYS, read } from './storage';

/**
 * The API, from a phone.
 *
 * The same contract `apps/web/src/lib/api-server.ts` keeps, carried over
 * deliberately rather than redesigned: one error envelope, `X-Tenant` for which
 * restaurant, `X-Branch` for which venue, `X-Locale` for which words, and the
 * bearer from secure storage. A server that already answers the web build must
 * not be asked for a second dialect by the phone.
 *
 * One difference, and it is the whole reason this file is not a copy. The web
 * client returns `null` on any failure and lets the screen fall back to
 * fixtures, because a server-rendered console mid-restart is better shown stale
 * than shown broken. A native screen has no fixtures to fall back to and no
 * server render to hide behind — a person is holding it, and "could not reach
 * the restaurant, retry" is the honest answer. So this *throws* a typed
 * `Failure`, and the screen decides what to say.
 */

export class Failure extends Error {
  constructor(
    readonly status: number,
    readonly body: ApiError | null,
    readonly retryable: boolean,
  ) {
    super(body?.message ?? `HTTP ${status}`);
  }
}

/** How long a screen waits before it calls the request failed. */
const TIMEOUT_MS = 8_000;

/**
 * Where the API is.
 *
 * `extra.apiBase` in `app.json` for a build; the Expo dev server's own host in
 * development, so a phone on the same Wi-Fi reaches the Laravel on the laptop
 * without anybody typing an IP address into a config file.
 */
export function apiBase(): string {
  const configured = (Constants.expoConfig?.extra as { apiBase?: string } | undefined)?.apiBase;

  if (configured !== undefined) return configured;

  const host = Constants.expoConfig?.hostUri?.split(':')[0];

  return host === undefined ? 'http://localhost:8000' : `http://${host}:8000`;
}

export type Scope = {
  tenant?: string | null;
  branch?: string | null;
  locale?: 'uz' | 'ru' | 'en';
  /** Which stored token to send, when not the signed-in session. */
  bearer?: (typeof KEYS)[keyof typeof KEYS] | null;
  /**
   * Headers this one endpoint needs and no other.
   *
   * Deliberately not a general escape hatch, and there is exactly one caller:
   * `GET /public/orders/{number}` proves who is asking with the last four
   * digits of the phone that ordered, and the API takes them in
   * `X-Guest-Phone` or in `?phone=`. The header is the right half of that
   * choice — a query string ends up in nginx's access log and in every proxy
   * between here and the guest — and a client that can choose should choose it.
   */
  headers?: Readonly<Record<string, string>>;
  /**
   * The idempotency key for a write, when the caller wants to choose it.
   *
   * Left out for almost everything: a fresh key per request is what "this is a
   * new attempt" means, and it is what a PIN entry needs — a retry there is a
   * second attempt and has to count as one. Pass a stable key only to make a
   * *resend* of one operation land once, which is the case a dropped connection
   * creates.
   */
  idempotencyKey?: string;
};

/**
 * A key for one write. Unique, not unguessable.
 *
 * `EnsureIdempotency` refuses every mutating request that arrives without one
 * (`request.idempotency_key_missing`), so this is not optional decoration — it
 * is the difference between a POST and a 4xx. Sixty-four characters is the
 * server's ceiling.
 *
 * Not `crypto.randomUUID()`: Hermes has no `crypto` global unless a polyfill is
 * installed, and this value is a de-duplication token rather than a secret —
 * the counter is what makes two writes in the same millisecond distinct.
 */
let writes = 0;

function idempotencyKey(): string {
  writes += 1;

  return `m-${Date.now().toString(36)}-${writes.toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

async function call<T>(
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
  path: string,
  body: unknown,
  scope: Scope,
): Promise<T> {
  const token = scope.bearer === null ? null : await read(scope.bearer ?? KEYS.session);

  const headers: Record<string, string> = {
    Accept: 'application/json',
    'X-Locale': scope.locale ?? 'uz',
  };

  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (method !== 'GET') headers['Idempotency-Key'] = scope.idempotencyKey ?? idempotencyKey();
  if (token !== null) headers.Authorization = `Bearer ${token}`;
  if (scope.tenant) headers['X-Tenant'] = scope.tenant;
  if (scope.branch) headers['X-Branch'] = scope.branch;

  for (const [name, value] of Object.entries(scope.headers ?? {})) headers[name] = value;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  let response: Response;

  try {
    response = await fetch(`${apiBase()}/api/v1${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
    });
  } catch {
    // No network, DNS failed, or the timer fired: all of them are "try again".
    throw new Failure(0, null, true);
  } finally {
    clearTimeout(timer);
  }

  if (!response.ok) {
    const parsed = (await response.json().catch(() => null)) as ApiError | null;

    // 5xx and 429 are the server's problem and worth a retry; 4xx is ours and
    // retrying it is asking the same question louder.
    throw new Failure(response.status, parsed, response.status >= 500 || response.status === 429);
  }

  if (response.status === 204) return undefined as T;

  return (await response.json()) as T;
}

export const get = <T>(path: string, scope: Scope = {}): Promise<T> =>
  call<T>('GET', path, undefined, scope);

export const post = <T>(path: string, body: unknown, scope: Scope = {}): Promise<T> =>
  call<T>('POST', path, body, scope);

export const patch = <T>(path: string, body: unknown, scope: Scope = {}): Promise<T> =>
  call<T>('PATCH', path, body, scope);

/** No body: the platform's deletes name the thing in the path, never in JSON. */
/**
 * DELETE with an optional body. HTTP allows it and the API uses it where the
 * thing being removed is named by a value rather than an id — a push token is
 * the example: it is the phone's own secret and does not belong in a URL.
 */
export const del = <T>(path: string, scope: Scope = {}, body?: unknown): Promise<T> =>
  call<T>('DELETE', path, body, scope);

export type { PaginatedResponse };
