import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { forgetPush, registerForPush } from '../lib/push';

import { crewSurfaceFor, isCrewRole, type CrewRole } from '@restaurant/surfaces/crew/guard';

import { del, Failure, get, post } from '../lib/api';
import { erase, KEYS, read, write } from '../lib/storage';

/**
 * Getting a person into the staff app, in the order the platform insists on.
 *
 * Two credentials, and the order is the whole security argument (CLAUDE.md):
 *
 *   1. **The device token** says *which phone this is*. A manager reads an
 *      eight-character code aloud; `POST /api/v1/staff/devices/pair` exchanges
 *      it, once, for a token that can do exactly one thing — offer a PIN.
 *   2. **The PIN** says *who is holding it*. `POST /api/v1/staff/auth/pin`
 *      checks four digits against that one enrolled person.
 *
 * Four digits are defensible only in that order: because the device already
 * names one employee, the PIN authenticates a known person rather than being
 * matched against everybody on the floor. Reversed, thirty PINs in a
 * four-digit space means roughly one guess in three hundred hits *somebody*,
 * and a lockout that counts per account never fires.
 *
 * Both go through `lib/api.ts`, so the phone speaks the one dialect the server
 * already answers — including the `Idempotency-Key` every write here needs.
 *
 * Where the web build keeps three httpOnly cookies, this keeps three Keychain
 * entries, and for the same reason they are three: signing out at the end of a
 * turn must not unpair the handset, or the next shift starts by finding a
 * manager.
 */

/** What the pairing endpoint answers with. */
type PairBody = {
  token?: string;
  data?: { label?: string | null; branch_code?: string | null };
  tenant?: { slug?: string | null };
};

/** What the PIN exchange answers with. */
type PinBody = {
  token?: string;
  person?: { id?: number; name?: string; roles?: string[] };
  data?: { branch_code?: string | null };
};

/**
 * The API's real error envelope, which `Failure.body` is not typed for.
 *
 * `lib/api.ts` types the parsed body as `@restaurant/types`' `ApiError` — the
 * flat Laravel validation shape. This platform answers `{ error: { code,
 * message_*, field, meta } }` (`App\Support\Errors\ErrorResponse`), and the two
 * fields read here are the ones a person acts on: which refusal it was, and how
 * long the lockout has left. Read defensively rather than re-typing the shared
 * client, which every surface imports.
 */
type ErrorEnvelope = {
  error?: { code?: string; meta?: { retry_after_minutes?: number } };
} | null;

const envelopeOf = (failure: Failure): ErrorEnvelope => failure.body as unknown as ErrorEnvelope;

/**
 * Something stable per handset, and not a security control.
 *
 * It is what makes a manager's device list readable a month later — "iPhone,
 * last seen Tuesday" — and what makes a duplicate enrolment visible. The web
 * build sends its user agent for the same purpose. Anything a client can
 * generate a client can lie about; the credential is the code.
 */
function fingerprint(): string {
  const model = Constants.expoConfig?.name ?? 'Smart Restaurant';

  return `${Platform.OS} ${String(Platform.Version)} · ${model}`.slice(0, 128);
}

const appVersion = (): string => Constants.expoConfig?.version ?? '0.1.0';

/* ============================================================
   Step one — enrolling the handset
   ============================================================ */

/** The alphabet a pairing code is drawn from: no I, O, 0 or 1. */
const CODE_PATTERN = /^[ABCDEFGHJKLMNPQRSTUVWXYZ2-9]{8}$/;

/**
 * Normalise as the manager reads it out.
 *
 * The four ambiguous glyphs are absent from the alphabet precisely because the
 * code travels by voice, so a field that accepted them would be collecting the
 * mishearing. Stripping as it is typed is kinder than refusing on submit.
 */
export const tidyCode = (raw: string): string =>
  raw
    .toUpperCase()
    .replace(/[^A-Z2-9]/g, '')
    .slice(0, 8);

export const isCompleteCode = (code: string): boolean => CODE_PATTERN.test(code);

export type PairOutcome =
  | { kind: 'paired'; label: string | null; branchCode: string | null }
  | { kind: 'rejected' }
  | { kind: 'unreachable' };

/**
 * Exchange a manager's eight characters for this phone's device token.
 *
 * The only unauthenticated call this surface makes, which is not a gap: a
 * handset nobody has enrolled holds nothing to authenticate with, and the code
 * identifies both the phone and the restaurant. It lives ten minutes and the
 * route is throttled to ten attempts a minute.
 */
export async function pairDevice(code: string): Promise<PairOutcome> {
  if (!isCompleteCode(code)) return { kind: 'rejected' };

  try {
    const body = await post<PairBody>(
      '/staff/devices/pair',
      { code, device_fingerprint: fingerprint(), app_version: appVersion() },
      // No bearer at all — not "the default one, absent". `bearer: null` is the
      // only way to say that, and sending a stale session token here would make
      // the request look like somebody else's.
      { bearer: null },
    );

    const token = body.token;
    const tenant = body.tenant?.slug;

    if (typeof token !== 'string' || typeof tenant !== 'string' || tenant === '') {
      // A 200 with nothing usable in it. Treated as a refusal rather than
      // written to the Keychain, because half a credential fails later and
      // somewhere less explicable.
      return { kind: 'rejected' };
    }

    await write(KEYS.crewDevice, token);
    await write(KEYS.crewTenant, tenant);

    return {
      kind: 'paired',
      label: body.data?.label ?? null,
      branchCode: body.data?.branch_code ?? null,
    };
  } catch (error) {
    if (error instanceof Failure && !error.retryable) return { kind: 'rejected' };

    return { kind: 'unreachable' };
  }
}

/** Whether this handset has been enrolled at all. Decides which screen opens. */
export async function enrolment(): Promise<{ token: string; tenant: string } | null> {
  const [token, tenant] = await Promise.all([read(KEYS.crewDevice), read(KEYS.crewTenant)]);

  return token === null || tenant === null ? null : { token, tenant };
}

/**
 * The line above the keypad: which branch and which handset this is.
 *
 * Asked with the device token, because on the sign-in screen there is no person
 * yet — the enrolment is both the credential and the subject. `null` when the
 * phone was never enrolled, when a manager replaced the enrolment, or when the
 * server cannot be reached: from the person's side those are one problem with
 * one answer, and the screen says so rather than naming a branch.
 *
 * It replaced a fixture that printed the demo restaurant's branch and till on
 * every installed copy of the app.
 */
export async function deviceLine(): Promise<string | null> {
  const phone = await enrolment();

  if (phone === null) return null;

  try {
    const body = await get<{ data?: { label?: string | null; branch_code?: string | null } }>(
      '/staff/devices/me',
      { bearer: KEYS.crewDevice, tenant: phone.tenant },
    );

    // Branch first: it is the half a person is checking before they type.
    const line = [body.data?.branch_code ?? '', body.data?.label ?? '']
      .map((part) => part.trim())
      .filter((part) => part !== '')
      .join(' · ');

    return line === '' ? null : line;
  } catch {
    return null;
  }
}

/* ============================================================
   Step two — the person
   ============================================================ */

export type PinOutcome =
  | { kind: 'ok'; role: CrewRole; name: string }
  /** The person is real, their workspace is not here — a cashier, a cook. */
  | { kind: 'no_surface' }
  /** This phone was never enrolled, or its enrolment was replaced. */
  | { kind: 'not_enrolled' }
  | { kind: 'locked'; minutes: number }
  | { kind: 'rejected' }
  | { kind: 'unreachable' };

/**
 * Four digits from an enrolled phone, exchanged for the person's own token.
 *
 * The refusals are told apart because a person does three different things
 * about them: a wrong PIN is retried, a locked one means waiting or finding a
 * manager, and an unenrolled handset means finding a manager *first* — and must
 * not cost one of the screen's three attempts, since it is a problem with the
 * phone rather than with the person.
 *
 * `X-Tenant` comes from the pairing response, not from a guess: a device token
 * carries no user, so `ResolveTenant` has nothing to infer the restaurant from.
 * It matters twice — `public.user_pins` sits behind row-level security, and
 * without a resolved tenant the policy answers no rows and every correct PIN
 * comes back wrong.
 */
export async function signInWithPin(pin: string, locale: 'uz' | 'ru' | 'en'): Promise<PinOutcome> {
  if (!/^\d{4}$/.test(pin)) return { kind: 'rejected' };

  const phone = await enrolment();

  if (phone === null) return { kind: 'not_enrolled' };

  try {
    const body = await post<PinBody>(
      '/staff/auth/pin',
      { pin },
      { bearer: KEYS.crewDevice, tenant: phone.tenant, locale },
    );

    const token = body.token;

    if (typeof token !== 'string') return { kind: 'rejected' };

    /*
     * Which workspace this person gets. Null is an answer, not a fallback:
     * a cashier's surface is the till, and dropping them onto the waiter's
     * screen would show them somebody else's tables. `roles.ts` makes the
     * same call for the console with `no_surface`.
     */
    const role = crewSurfaceFor(body.person?.roles ?? []);

    if (role === null) return { kind: 'no_surface' };

    await write(KEYS.crewSession, token);

    // Now that there is someone to page. Best-effort and deliberately not
    // awaited into the sign-in's result: a refused permission or a slow
    // network must not stand between a waiter and their tables.
    void registerForPush('crew', { bearer: KEYS.crewSession, tenant: phone.tenant });
    await write(KEYS.role, role);

    return { kind: 'ok', role, name: body.person?.name ?? '' };
  } catch (error) {
    if (!(error instanceof Failure)) return { kind: 'unreachable' };

    // No network, DNS, or the timer fired — the client's own zero.
    if (error.status === 0) return { kind: 'unreachable' };

    // The enrolment is gone: the code was re-issued, or the device row was
    // revoked by a manager. Not a wrong PIN, and told apart from one.
    if (error.status === 401 || error.status === 409) {
      await erase(KEYS.crewDevice);
      await erase(KEYS.crewTenant);

      return { kind: 'not_enrolled' };
    }

    const envelope = envelopeOf(error);

    if (envelope?.error?.code === 'staff.pin_locked') {
      return { kind: 'locked', minutes: envelope.error.meta?.retry_after_minutes ?? 15 };
    }

    if (error.status === 403 || error.status === 422) return { kind: 'rejected' };

    return { kind: 'unreachable' };
  }
}

/** Who this handset is signed in as, for a stack deciding where to open. */
export async function currentRole(): Promise<CrewRole | null> {
  const [session, role] = await Promise.all([read(KEYS.crewSession), read(KEYS.role)]);

  // Both or neither. A session with no role beside it is a state the guard
  // cannot reason about, and the honest answer to it is the keypad.
  if (session === null || role === null || !isCrewRole(role)) return null;

  return role;
}

/**
 * Ending a turn. The enrolment survives — see `storage.ts`.
 *
 * The API call is best effort and its failure is swallowed on purpose: a person
 * who pressed sign out has to end up signed out of this handset even with no
 * network, and a token nobody holds dies at its expiry.
 */
export async function signOut(): Promise<void> {
  const phone = await enrolment();
  const session = await read(KEYS.crewSession);

  if (phone !== null && session !== null) {
    // This phone stops being a place to reach this person — before the
    // session that authorises the call is gone.
    await forgetPush({ bearer: KEYS.crewSession, tenant: phone.tenant });

    try {
      await del('/staff/auth/session', { bearer: KEYS.crewSession, tenant: phone.tenant });
    } catch {
      // Deliberately swallowed — see above.
    }
  }

  await erase(KEYS.crewSession);
  await erase(KEYS.role);
}
