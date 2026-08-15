/**
 * Where this deployment is mounted, for the handful of URLs Next cannot fix.
 *
 * `basePath` in next.config.ts rewrites what the framework owns — links,
 * redirects, chunks — but not a string handed to `fetch`. Under a prefix,
 * `fetch('/api/auth/session')` reaches the site root, which belongs to another
 * application on this host. See apps/web/src/lib/base-path.ts for the longer
 * version of the same argument.
 */
export const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? '';

/** The sign-in/sign-out handler in app/api/auth/session, prefix included. */
export const SESSION_ENDPOINT = `${BASE_PATH}/api/auth/session`;
