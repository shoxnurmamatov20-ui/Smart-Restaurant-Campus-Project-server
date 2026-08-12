import hooks from 'eslint-plugin-react-hooks';
import prettier from 'eslint-config-prettier';

import base from './base.mjs';

/**
 * The baseline plus the rules that only matter once there are components.
 *
 * Used by @restaurant/ui. Only the hooks rules are pulled in, not
 * `eslint-plugin-react` itself: that plugin's peer range stops at ESLint 9,
 * and its version-detection path calls `context.getFilename()`, which ESLint 10
 * removed — the same crash the apps work around by pinning
 * `settings.react.version`. The hooks plugin has no such problem, and it is the
 * half that catches real defects rather than style.
 *
 * @type {import('eslint').Linter.Config[]}
 */
export default [
  ...base,

  {
    files: ['**/*.{ts,tsx}'],
    // `configs.flat[...]`, not `configs[...]`: the top-level entries are still
    // eslintrc-shaped and declare `plugins` as an array of strings, which flat
    // config rejects outright.
    ...hooks.configs.flat['recommended-latest'],
  },

  {
    files: ['**/*.{ts,tsx}'],
    rules: {
      // A stale closure in a shared primitive is a bug in every app at once.
      'react-hooks/exhaustive-deps': 'error',
    },
  },

  prettier,
];
