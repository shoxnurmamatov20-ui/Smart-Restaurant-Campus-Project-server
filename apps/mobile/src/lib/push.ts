/* eslint-disable @typescript-eslint/no-require-imports */
import Constants, { ExecutionEnvironment } from 'expo-constants';
import type * as ExpoNotifications from 'expo-notifications';
import { Platform } from 'react-native';

import { del, post, type Scope } from './api';

/**
 * Registering this phone as somewhere the restaurant can reach.
 *
 * Two halves, and this is the second. `expo-notifications` has shipped in the
 * binary since the first build; until `POST /api/v1/push/tokens` existed there
 * was nothing to hand the token to, so a courier could be assigned and the
 * phone that should have buzzed sat silent.
 *
 * Permission is asked once, after sign-in, never on the first launch: a prompt
 * before the person knows what the app is for is the prompt they refuse, and
 * iOS does not ask twice.
 *
 * The Expo token — not the raw APNs/FCM one — so the server has one sender for
 * both platforms. It is obtained with the project id from `app.json`, which is
 * what ties a token to this app rather than to any Expo app on the phone.
 */

/**
 * Loaded when it can be, and never at the top of the file.
 *
 * Expo Go dropped remote notifications in SDK 53: the module is still in the
 * client, and *importing* it throws. This file is reached from the root layout,
 * so a top-level `import * as Notifications` took the whole app down at launch
 * with a red screen about push — on a phone whose owner only wanted to look at
 * the menu.
 *
 * So: `require` on first use, behind a check for the environment that cannot
 * have it. Everything below degrades to "no push" rather than to no app. A
 * development build or a release APK takes the normal path and nothing changes.
 */
type Push = typeof ExpoNotifications;

const IN_EXPO_GO = Constants.executionEnvironment === ExecutionEnvironment.StoreClient;

let loaded: Push | null | undefined;

function push(): Push | null {
  if (loaded !== undefined) return loaded;

  if (IN_EXPO_GO) {
    loaded = null;

    return null;
  }

  try {
    loaded = require('expo-notifications') as Push;
  } catch {
    /* A build without the module linked. Same answer as Expo Go: no push. */
    loaded = null;

    return null;
  }

  loaded.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });

  return loaded;
}

/**
 * Whether this build can receive a notification at all.
 *
 * Separate from `pushAllowed()`, which asks the operating system. A screen that
 * conflates them tells an Expo Go reader their phone is blocking notifications,
 * which is not true and not something they can fix in settings.
 */
export function pushSupported(): boolean {
  return push() !== null;
}

export type Surface = 'customer' | 'crew' | 'mp' | 'guest';

/**
 * Which door each surface knocks on.
 *
 * Three of the four share one: `POST /push/tokens` sits behind `auth:sanctum` +
 * `tenant` and stamps the caller's `tenant_id` on the row, which is right for
 * anybody who belongs to a restaurant.
 *
 * The marketplace consumer does not. That token is a `marketplace.consumers`
 * row with no tenant at all — somebody ordering from four restaurants is a
 * customer of none of them — so `ResolveTenant` has nothing to stamp and the
 * shared route answers 403 for every phone. `POST /mp/push/tokens` is the same
 * registration without the tenant, and it is the reason this map exists rather
 * than one constant.
 */
const ENDPOINT: Readonly<Record<Surface, string>> = {
  customer: '/push/tokens',
  crew: '/push/tokens',
  guest: '/push/tokens',
  mp: '/mp/push/tokens',
};

/**
 * Whether the OS would let a notification through, asked without asking.
 *
 * `pushToken()` raises the system prompt when it has to, which is right at
 * sign-in and wrong on a settings screen: a preferences sheet that fires the
 * one-shot iOS prompt the instant it opens spends it before the person has
 * decided anything. This only reads, so the sheet can say "the phone is
 * blocking these" beside switches that are otherwise all on and doing nothing.
 */
export async function pushAllowed(): Promise<boolean> {
  const n = push();

  if (n === null) return false;

  const settings = await n.getPermissionsAsync().catch(() => null);

  return settings?.status === 'granted';
}

/** The token for this install, or null when the person said no. */
export async function pushToken(): Promise<string | null> {
  const n = push();

  if (n === null) return null;

  const settings = await n.getPermissionsAsync();
  let status = settings.status;

  if (status !== 'granted') {
    status = (await n.requestPermissionsAsync()).status;
  }

  if (status !== 'granted') return null;

  // Android needs a channel before anything with sound shows at all.
  if (Platform.OS === 'android') {
    await n.setNotificationChannelAsync('default', {
      name: 'Smart Restaurant',
      importance: n.AndroidImportance.HIGH,
      sound: 'default',
    });
  }

  const projectId = (Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined)
    ?.eas?.projectId;

  try {
    const { data } = await n.getExpoPushTokenAsync(projectId ? { projectId } : undefined);

    return data;
  } catch {
    // A simulator, or a build without push entitlements. Not an error the
    // person can do anything about, so it is not one they are shown.
    return null;
  }
}

/**
 * Tell the server about this phone. Called after every sign-in and on launch
 * while signed in — the token can rotate, and the server keeps the latest.
 */
export async function registerForPush(surface: Surface, scope: Scope = {}): Promise<boolean> {
  const token = await pushToken();

  if (token === null) return false;

  try {
    await post(
      ENDPOINT[surface],
      {
        token,
        platform: Platform.OS === 'ios' ? 'ios' : 'android',
        /*
         * The consumer route names its own surface and refuses to be told
         * otherwise — there is exactly one kind of caller on it. The shared
         * route serves four and has to be told which.
         */
        ...(surface === 'mp' ? {} : { surface }),
        device_name: Constants.deviceName ?? null,
        ...(scope.locale === undefined ? {} : { locale: scope.locale }),
      },
      scope,
    );

    return true;
  } catch {
    // Registration is best-effort: a failed call here must not block the
    // sign-in that triggered it. The next launch tries again.
    return false;
  }
}

/** On sign-out: this phone stops being a place to reach this person. */
export async function forgetPush(scope: Scope = {}, surface: Surface = 'crew'): Promise<void> {
  const token = await pushToken().catch(() => null);

  if (token === null) return;

  await del(ENDPOINT[surface], scope, { token }).catch(() => undefined);
}

/**
 * Where a tap lands. Every notification carries `data.url` — `/mp/track`,
 * `/crew/waiter/queue` — the same path the web build would open, so the
 * router resolves it exactly as a deep link.
 */
export function onNotificationTap(open: (url: string) => void): () => void {
  const n = push();

  /* Nothing to listen to, and nothing to clean up. */
  if (n === null) return () => undefined;

  const sub = n.addNotificationResponseReceivedListener((response) => {
    const url = response.notification.request.content.data?.url;

    if (typeof url === 'string' && url.startsWith('/')) open(url);
  });

  // A notification that launched the app cold arrives here, not in the listener.
  void n.getLastNotificationResponseAsync().then((response) => {
    const url = response?.notification.request.content.data?.url;

    if (typeof url === 'string' && url.startsWith('/')) open(url);
  });

  return () => sub.remove();
}
