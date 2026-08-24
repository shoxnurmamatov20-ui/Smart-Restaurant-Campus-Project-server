import base from '@restaurant/config/eslint/base';

/**
 * The web config, minus the two things a React Native tree does not have.
 *
 * `src/theme.ts` is generated from `packages/ui/src/styles/tokens.css` by
 * `pnpm theme`, so it is not edited and not linted — a formatting rule applied
 * to it would be a rule the generator has to satisfy, which is the generator
 * serving the linter rather than the design.
 */
export default [
  ...base,
  { ignores: ['src/theme.ts', '.expo/**', 'expo-env.d.ts', 'android/**', 'ios/**', 'dist/**'] },
  {
    /*
     * Metro, Babel and Expo's config plugins are loaded with `require()` before any module
     * loader is in play, so these two files are CommonJS by the toolchain's
     * rule rather than by choice. Written as an override rather than as two
     * inline waivers, because the next person to add a native config file will
     * hit the same wall for the same reason.
     */
    files: ['metro.config.js', 'babel.config.js', 'plugins/*.js'],
    rules: { '@typescript-eslint/no-require-imports': 'off' },
  },
];
