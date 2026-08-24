/*
 * Sign release builds with the project's own key.
 *
 * `expo prebuild` regenerates `android/` from app.json, which is the whole
 * point of it — and it regenerates `app/build.gradle` with release signed by
 * the *debug* key, behind a comment telling you to change that. Editing the
 * file by hand lasts until the next prebuild. A config plugin is the only
 * place a change to the generated tree survives, so this is one.
 *
 * The key itself is never in the repo. It lives in `~/.srcp-android/` beside a
 * `signing.env` that names it, and the four values come in through the
 * environment. Gradle reads `SRCP_KEYSTORE`, `SRCP_KEY_ALIAS`,
 * `SRCP_KEYSTORE_PASSWORD`, `SRCP_KEY_PASSWORD` — and if any is missing the
 * release block falls back to the debug key with a warning rather than
 * failing, so `expo run:android` on a laptop still works.
 *
 * Why it matters: Android identifies an app by package name *and* signing key.
 * An update signed with a different key is refused, so a phone that installed
 * a debug-signed APK from the website could never be updated by a properly
 * signed one. Every APK the site hands out has to be signed with this key from
 * the first one.
 */
const { withAppBuildGradle, withGradleProperties } = require('expo/config-plugins');

const SIGNING = `
    signingConfigs {
        release {
            def ks = System.getenv('SRCP_KEYSTORE')
            if (ks != null && file(ks).exists()) {
                storeFile file(ks)
                storePassword System.getenv('SRCP_KEYSTORE_PASSWORD')
                keyAlias System.getenv('SRCP_KEY_ALIAS')
                keyPassword System.getenv('SRCP_KEY_PASSWORD')
            } else {
                logger.warn('SRCP_KEYSTORE is not set — release will be signed with the DEBUG key')
                storeFile file('debug.keystore')
                storePassword 'android'
                keyAlias 'androiddebugkey'
                keyPassword 'android'
            }
        }`;

/*
 * Gradle sized for the machine that builds it.
 *
 * The template asks for a 2 GB JVM and parallel workers, which on an 8 GB
 * server that also runs the site, php-fpm and Postgres is how the first build
 * ended: the kernel's OOM killer took the daemon mid-compile and Gradle
 * reported "daemon disappeared unexpectedly". Kotlin and the NDK each want
 * their own heap on top of Gradle's, so the numbers below leave room for
 * three JVMs rather than one — and `workers.max=2` keeps the NDK from
 * compiling eight C++ targets at once.
 *
 * Three gigabytes for Gradle, and Kotlin compiled inside it. One gigabyte was
 * enough for the first APK; once the app grew its staff, marketplace and
 * customer screens, two builds died in turn — D8, which dexes the merged
 * class set inside Gradle's JVM, at 1 GB with "Java heap space"; then the
 * separate Kotlin daemon at its 512 MB on react-native-screens. Each costs
 * half an hour of NDK work to find out. So: one JVM, sized once, and Kotlin
 * in-process rather than a second daemon with its own ceiling. The native
 * compile is serial now (`CMAKE_BUILD_PARALLEL_LEVEL=1` in srcp-apk), which is
 * what makes three gigabytes beside one clang fit an 8 GB box that is also
 * serving.
 */
const GRADLE = [
  {
    type: 'property',
    key: 'org.gradle.jvmargs',
    value: '-Xmx3072m -XX:MaxMetaspaceSize=768m -XX:+UseSerialGC',
  },
  { type: 'property', key: 'org.gradle.parallel', value: 'false' },
  { type: 'property', key: 'org.gradle.workers.max', value: '2' },
  { type: 'property', key: 'org.gradle.daemon', value: 'false' },
  { type: 'property', key: 'kotlin.compiler.execution.strategy', value: 'in-process' },
  /* Only the two ABIs real phones ship; x86 is emulators, and it doubles NDK time. */
  { type: 'property', key: 'reactNativeArchitectures', value: 'armeabi-v7a,arm64-v8a' },
];

/*
 * Not here: ninja's own parallelism. The NDK step is ninja, and ninja ignores
 * Gradle's worker cap — on eight cores it runs eight clang processes beside
 * the JVM, and the second OOM kill happened exactly there. Neither Gradle nor
 * AGP exposes a property for it; the knob is the `CMAKE_BUILD_PARALLEL_LEVEL`
 * environment variable, which `srcp-apk` exports. A gradle.properties entry
 * would have suggested the file controls something it does not.
 */

module.exports = function withReleaseSigning(config) {
  config = withGradleProperties(config, (mod) => {
    for (const entry of GRADLE) {
      const at = mod.modResults.findIndex((p) => p.type === 'property' && p.key === entry.key);

      if (at >= 0) mod.modResults[at] = entry;
      else mod.modResults.push(entry);
    }

    return mod;
  });

  return withAppBuildGradle(config, (mod) => {
    let gradle = mod.modResults.contents;

    if (!gradle.includes("System.getenv('SRCP_KEYSTORE')")) {
      // Add the release signing config beside the debug one.
      gradle = gradle.replace(
        /signingConfigs \{/,
        `signingConfigs {${SIGNING.replace('\n    signingConfigs {', '')}`,
      );
      // Point the release build type at it.
      gradle = gradle.replace(
        /release \{\s*\/\/ Caution![^\n]*\n[^\n]*\n\s*signingConfig signingConfigs\.debug/,
        'release {\n            signingConfig signingConfigs.release',
      );
    }

    /*
     * `versionCode` from the command line, when `srcp-apk` gives one.
     *
     * Android refuses to install an APK whose versionCode is not higher than
     * the one already on the phone, so every published build must carry a new
     * one. The tool derives it from the clock; app.json keeps the human
     * `version`. `findProperty` falls back to the template's `1` for a local
     * `expo run:android`, which installs fresh and does not care.
     */
    if (!gradle.includes("findProperty('versionCode')")) {
      /*
       * Assigned, not called. `versionCode (x).toInteger()` parses in Groovy as
       * `versionCode(x).toInteger()` — a call whose result is the setter's
       * void — and Gradle then reports "Value is null" from deep inside its
       * dynamic-object layer with no line number. `versionCode = …` is
       * unambiguous.
       */
      gradle = gradle
        .replace(
          /versionCode 1\b/,
          "versionCode = (findProperty('versionCode') ?: '1').toInteger()",
        )
        .replace(
          /versionName "[^"]*"/,
          "versionName = (findProperty('versionName') ?: '0.1.0').toString()",
        );
    }

    mod.modResults.contents = gradle;

    return mod;
  });
};
