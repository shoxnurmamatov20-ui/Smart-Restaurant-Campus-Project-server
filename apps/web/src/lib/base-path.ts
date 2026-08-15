/**
 * Where this deployment is mounted, for the handful of URLs Next cannot fix.
 *
 * `basePath` in next.config.ts rewrites everything the framework owns: links,
 * redirects, chunk URLs, the router. It does not rewrite a string handed to
 * `fetch`, because that string is opaque to it — `fetch('/api/auth/session')`
 * asks the browser for the site root, which under a prefix is somebody else's
 * application. The bug that produces is quiet: the console renders, and only
 * signing in fails, against a 404 from a server that was never ours.
 *
 * So the prefix is stated once here and joined on at the few call sites that
 * build their own paths. It is read from the environment rather than hardcoded
 * so that a deployment at the root only has to clear one variable — but the
 * literal in next.config.ts has to agree with it, since Next reads that file
 * too early for this value to reach it.
 */
export const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? '';

/** The sign-in/sign-out handler in app/api/auth/session, prefix included. */
export const SESSION_ENDPOINT = `${BASE_PATH}/api/auth/session`;
