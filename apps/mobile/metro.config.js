const { getDefaultConfig } = require('expo/metro-config');
const path = require('node:path');

/*
 * A monorepo Metro: watch the workspace root so `@restaurant/surfaces` and the
 * other shared packages resolve from source, and look in both node_modules.
 *
 * Without `watchFolders` Metro sees only this directory and a workspace import
 * fails with "Unable to resolve module" — which reads as a typo, and is not.
 */
const root = path.resolve(__dirname, '../..');
const config = getDefaultConfig(__dirname);

config.watchFolders = [root];
config.resolver.nodeModulesPaths = [
  path.resolve(__dirname, 'node_modules'),
  path.resolve(root, 'node_modules'),
];

/*
 * What Metro must not watch.
 *
 * Watching the workspace root means watching everything under it, and a native
 * build leaves tens of thousands of files behind: `android/build`, `.gradle`,
 * `.cxx` and the per-package `android/build` trees Gradle writes *inside*
 * `node_modules`. None of them is source, all of them churn, and together they
 * pushed the process past the kernel's inotify ceiling — `expo start` died with
 * `ENOSPC: System limit for number of file watchers reached` on a machine that
 * had just built an APK.
 *
 * `exclusionList` is not exported by Expo's preset, so the patterns are written
 * out. Every one of them names a build directory that belongs to *this*
 * monorepo — never a bare fragment. `blockList` is a resolver list, not just a
 * watcher one: a first draft blocked `/dist/` outright and Metro stopped
 * resolving `react-native-web/dist/index`, which is a real module half the
 * packages here ship from a folder of that name.
 */
config.resolver.blockList = [
  /\/android\/build\//,
  /\/android\/\.gradle\//,
  /\/android\/app\/\.cxx\//,
  /\/ios\/build\//,
  /\/ios\/Pods\//,
  /\/apps\/web\/\.next\//,
  /\/apps\/mobile\/dist\//,
  /*
   * The parts of the monorepo that are not JavaScript and change under Metro's
   * feet. The watcher crawls every root, and `storage/` is where the API writes
   * exports and the test suite creates and deletes directories by the hundred:
   * the tunnel died with `ENOENT … storage/app/exports/332` — a folder removed
   * between the watcher noticing it and watching it. `vendor/` and the Python
   * environments are the other two hundred thousand files nothing here imports.
   */
  /\/apps\/api\/storage\//,
  /\/apps\/api\/vendor\//,
  /\/apps\/api\/bootstrap\/cache\//,
  /\/\.venv\//,
  /\/__pycache__\//,
];

module.exports = config;
