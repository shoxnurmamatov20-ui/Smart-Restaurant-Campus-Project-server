/**
 * The one thing app.json cannot say: where the API is for THIS build.
 *
 * `src/lib/api.ts` reads `extra.apiBase`, and without it a release build falls
 * back to the Expo dev server's host — which a release build does not have —
 * and then to `http://localhost:8000`, the phone itself. The first two APKs
 * shipped exactly like that: installed fine, signed with the right key, and
 * talked to nothing. Nothing in the build had to know the server's address,
 * so nothing told it.
 *
 * So the address is an input to the build, not a constant in the repo:
 * `srcp-apk` sets `SRCP_API_BASE` (defaulting to the production host), and
 * this file writes it into `extra.apiBase`, where expo-constants embeds it
 * in the APK. The tool then reads the embedded config back out of the APK and
 * refuses to publish one that does not carry it. A developer build on a
 * laptop leaves the variable unset and keeps the dev-server behaviour.
 *
 * Static `app.json` stays the source for everything else; Expo parses it
 * first and hands it in here as `config`.
 */
module.exports = ({ config }) => {
  const apiBase = process.env.SRCP_API_BASE;

  if (apiBase === undefined || apiBase === '') {
    return config;
  }

  // A release build on Android refuses cleartext HTTP by default; better to
  // refuse it here, forty minutes earlier, than to ship an app that cannot
  // make a single request.
  if (!/^https:\/\/[^/\s]+$/.test(apiBase)) {
    throw new Error(
      `SRCP_API_BASE must be an https origin with no path, got '${apiBase}' — see app.config.js`,
    );
  }

  return { ...config, extra: { ...config.extra, apiBase } };
};
