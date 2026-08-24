import * as SecureStore from 'expo-secure-store';

/**
 * Where the credentials live on a phone.
 *
 * The web build keeps its tokens in httpOnly cookies the page cannot read. A
 * native app has no such place: whatever it holds, it holds in its own storage,
 * and `AsyncStorage` is a plain file another app on a rooted device can read.
 * `SecureStore` is the Keychain on iOS and the Keystore on Android — the same
 * hardware-backed store the platform uses for its own passwords.
 *
 * Three credentials, three keys, mirroring the three cookies — and for the same
 * reason the cookies are three: the device token says *which phone*, the session
 * says *who is holding it*, and signing one person out must not unpair the
 * phone from the restaurant.
 */
export const KEYS = {
  /** The Sanctum bearer for a signed-in person. */
  session: 'srcp.session',
  /** The role the server named at sign-in, so the tab bar can draw before the first fetch. */
  role: 'srcp.role',
  /** The staff device token from `POST /api/v1/staff/devices/pair`. */
  crewDevice: 'srcp.crew.device',
  /** Which tenant that device was paired to. */
  crewTenant: 'srcp.crew.tenant',
  /** The crew PIN session from `POST /api/v1/staff/auth/pin`. */
  crewSession: 'srcp.crew.session',
  /**
   * The MyPOS consumer token from `POST /api/v1/mp/auth/otp/verify`.
   *
   * Its own key rather than `session`, because the two tokens are not the same
   * credential and cannot be swapped: `session` belongs to a person inside one
   * restaurant (`public.users`, resolved against `X-Tenant`), while this one
   * belongs to a `marketplace.consumers` row that has no tenant at all — it is
   * the whole point of the consumer surface that somebody ordering from four
   * restaurants is a customer of none of them. One phone can hold both, and
   * sending either where the other is expected is a 403 the screen cannot
   * explain.
   */
  mpSession: 'srcp.mp.session',
  /** The language the person chose, when they chose one. */
  locale: 'srcp.locale',
  /**
   * Light, dark, or the phone's own — when the person said.
   *
   * Beside the language rather than in a store of its own, for the reason
   * given at the top of this file: a phone has one place its settings live.
   */
  theme: 'srcp.theme',
} as const;

export type Key = (typeof KEYS)[keyof typeof KEYS];

export const read = (key: Key): Promise<string | null> => SecureStore.getItemAsync(key);

export const write = (key: Key, value: string): Promise<void> =>
  SecureStore.setItemAsync(key, value, {
    // Readable only while the device is unlocked. A phone left on a table is
    // the threat model; this is the cheapest thing that answers it.
    keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  });

export const erase = (key: Key): Promise<void> => SecureStore.deleteItemAsync(key);
