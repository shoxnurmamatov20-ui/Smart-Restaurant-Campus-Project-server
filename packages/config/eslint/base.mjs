import tsPlugin from '@typescript-eslint/eslint-plugin';
import prettier from 'eslint-config-prettier';

/**
 * The lint baseline for every workspace package that is not a Next.js app.
 *
 * This is flat config. The presets that lived here before were `.eslintrc`
 * objects — `module.exports = { root: true, extends: [...] }` — a format ESLint
 * 10 no longer reads at all, which is why nothing consumed them and why the
 * shared library went unlinted while the three apps each rolled their own.
 *
 * The apps stay on `eslint-config-next`, which brings its own React and a11y
 * rules; this preset is for the packages, where there is no Next.js to inherit
 * from. `eslint-config-prettier` goes last so formatting is prettier's job and
 * only prettier's.
 *
 * @type {import('eslint').Linter.Config[]}
 */
export default [
  {
    ignores: ['node_modules/**', 'dist/**', 'build/**', '.next/**', '.turbo/**', 'coverage/**'],
  },

  ...tsPlugin.configs['flat/recommended'],

  {
    files: ['**/*.{ts,tsx,mts,cts}'],
    rules: {
      // A leading underscore is the agreed way to say "deliberately unused".
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      // `verbatimModuleSyntax` is on across the repo, so a value import of a
      // type is a build error later rather than a lint warning now.
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { prefer: 'type-imports', fixStyle: 'inline-type-imports' },
      ],
      '@typescript-eslint/no-explicit-any': 'error',
      'no-console': ['warn', { allow: ['warn', 'error'] }],
    },
  },

  prettier,
];
