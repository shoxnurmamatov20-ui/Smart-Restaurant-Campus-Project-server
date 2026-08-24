/**
 * The font files themselves, and the one module that touches them.
 *
 * Split from `./fonts.ts` for one reason: `require('*.ttf')` is a Metro
 * transform. Node cannot evaluate it, so a test that imports the helpers beside
 * it would fail on the import rather than on anything it meant to check. The
 * helpers are pure and testable; this is the half only the app loads.
 *
 * `require` rather than an ESM import, and the rule is disabled for this file
 * alone: Metro resolves a font the same way it resolves an image, through the
 * asset registry, and that registry is reached with `require`. An `import` of a
 * `.ttf` resolves to a module Metro has no transform for.
 */
/* eslint-disable @typescript-eslint/no-require-imports */
import type { FACES } from './fonts';

/**
 * What `useFonts` is handed — family name to file.
 *
 * The keys are the families React Native resolves. `FACES` in `./fonts.ts` is
 * the same list as file names, and `fonts.test.ts` walks it on disk, so a face
 * added here without its file is a failing test rather than a silent fallback.
 */
export const FONTS: Record<(typeof FACES)[number]['family'], number> = {
  Inter_400Regular: require('../assets/fonts/Inter-Regular.ttf') as number,
  Inter_500Medium: require('../assets/fonts/Inter-Medium.ttf') as number,
  Inter_600SemiBold: require('../assets/fonts/Inter-SemiBold.ttf') as number,
  Inter_700Bold: require('../assets/fonts/Inter-Bold.ttf') as number,
  InterTight_600SemiBold: require('../assets/fonts/InterTight-SemiBold.ttf') as number,
  InterTight_700Bold: require('../assets/fonts/InterTight-Bold.ttf') as number,
  InterTight_800ExtraBold: require('../assets/fonts/InterTight-ExtraBold.ttf') as number,
};
