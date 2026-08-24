import { describe, expect, it } from 'vitest';

import appJson from '../app.json';

type Config = { extra?: Record<string, unknown> };
type Dynamic = (args: { config: Config }) => Config;

// eslint-disable-next-line @typescript-eslint/no-require-imports
const dynamic = require('../app.config.js') as Dynamic;

/**
 * The API address is an input to the build. Two APKs went out without it and
 * talked to the phone itself; this is what makes the third the last.
 */
describe('app.config.js', () => {
  const base = appJson.expo as Config;

  function withEnv<T>(value: string | undefined, run: () => T): T {
    const previous = process.env.SRCP_API_BASE;

    if (value === undefined) delete process.env.SRCP_API_BASE;
    else process.env.SRCP_API_BASE = value;

    try {
      return run();
    } finally {
      if (previous === undefined) delete process.env.SRCP_API_BASE;
      else process.env.SRCP_API_BASE = previous;
    }
  }

  it('writes SRCP_API_BASE into extra.apiBase, where src/lib/api.ts reads it', () => {
    const config = withEnv('https://mypos.tashmedunitf.uz', () => dynamic({ config: base }));

    expect(config.extra?.apiBase).toBe('https://mypos.tashmedunitf.uz');
    // Everything else app.json says survives — the default tenant included.
    expect(config.extra?.defaultTenant).toBe(base.extra?.defaultTenant);
  });

  it('leaves a developer build alone, so the dev server host is used', () => {
    const config = withEnv(undefined, () => dynamic({ config: base }));

    expect(config.extra?.apiBase).toBeUndefined();
  });

  it('refuses cleartext and paths — Android would refuse the requests anyway', () => {
    expect(() => withEnv('http://10.0.0.5:8000', () => dynamic({ config: base }))).toThrow(/https/);
    expect(() =>
      withEnv('https://mypos.tashmedunitf.uz/api', () => dynamic({ config: base })),
    ).toThrow(/no path/);
  });
});
