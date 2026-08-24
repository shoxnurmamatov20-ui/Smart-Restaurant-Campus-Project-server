import { readFileSync } from 'node:fs';

import { type AppManifest, DOWNLOAD_MANIFEST_PATH, parseManifest } from './download-data';

/**
 * The published APK's manifest, read off this host's disk.
 *
 * **Server only.** It imports `node:fs`, so a client component that imports it
 * — even for a type — breaks the build. Types come from `download-data.ts`;
 * this file is imported by `page.tsx` and by nothing else. Same split as
 * `tables-data.ts` / `tables-server.ts` in the console.
 *
 * ---------------------------------------------------------------------------
 * Why the disk and not a fetch
 *
 * `/downloads/manifest.json` is served by nginx from the same machine
 * (`srcp-routes.conf`), so the page *could* fetch it. It must not. A server
 * component fetching its own site is a request that has to leave the Node
 * process, cross nginx and come back while the render it belongs to is
 * blocked — and during a restart, when nginx is answering 502, the page would
 * draw the "not published yet" state while the APK sits on disk two
 * directories away. Reading the file is one syscall and cannot be wrong about
 * a file on the same disk.
 *
 * ---------------------------------------------------------------------------
 * Missing is the normal case, not the exceptional one
 *
 * A developer's laptop has no `/srv/srcp/`, and a production host has none
 * either until somebody runs `srcp-apk` for the first time. So ENOENT is
 * expected and answers `null`, which the page draws as the honest empty state.
 * Anything else — a permission error, a directory where the file should be —
 * answers `null` too: there is no second thing this page could do with the
 * knowledge, and a marketing page that throws a 500 because an optional file is
 * unreadable has turned a missing download into a missing website.
 */
export function readAppManifest(): AppManifest | null {
  try {
    return parseManifest(readFileSync(DOWNLOAD_MANIFEST_PATH, 'utf8'));
  } catch {
    return null;
  }
}
