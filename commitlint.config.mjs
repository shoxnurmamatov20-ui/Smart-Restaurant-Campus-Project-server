/**
 * Conventional Commits enforcement.
 * @see https://www.conventionalcommits.org/en/v1.0.0/
 *
 * Allowed types match the CONTRIBUTING.md guide:
 *   feat, fix, docs, style, refactor, perf, test, chore, ci, build, revert
 *
 * Allowed scopes follow Phase-1 module names + structural areas.
 */
export default {
  extends: ['@commitlint/config-conventional'],
  rules: {
    'type-enum': [
      2,
      'always',
      ['feat', 'fix', 'docs', 'style', 'refactor', 'perf', 'test', 'chore', 'ci', 'build', 'revert'],
    ],
    'scope-enum': [
      1,
      'always',
      [
        // Apps
        'web',
        'admin',
        'api',
        'ai',
        'mobile',
        // Phase 1 modules
        'hr',
        'students',
        'online',
        'edms',
        'rttm',
        'psychology',
        'exams',
        'library',
        'media',
        'kpi',
        // Cross-cutting
        'auth',
        'ui',
        'types',
        'sdk',
        'utils',
        'i18n',
        'config',
        'deps',
        'docs',
        'infra',
        'ci',
        'release',
      ],
    ],
    'subject-case': [2, 'never', ['upper-case', 'pascal-case', 'start-case']],
    'subject-max-length': [2, 'always', 100],
    'body-max-line-length': [1, 'always', 120],
  },
};
