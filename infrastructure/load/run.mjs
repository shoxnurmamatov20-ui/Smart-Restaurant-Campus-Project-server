#!/usr/bin/env node
/*
 * A load test with no dependencies: N concurrent readers hammering a list of
 * URLs for a fixed time, reporting latency percentiles and the error share.
 *
 *   node infrastructure/load/run.mjs --base http://127.0.0.1:3100 --users 50 --seconds 30
 *   node infrastructure/load/run.mjs --base https://mypos.tashmedunitf.uz --users 20 --seconds 20 --api
 *
 * Why this and not k6 or artillery: both are fine tools and both are a
 * dependency, and the question this answers — "does the box fall over when
 * forty-two restaurants open at once" — needs only `fetch`, a clock and a
 * sort. Numbers worth acting on are the p95 and the error share; the mean is
 * printed because people ask for it, and ignored for the same reason.
 *
 * The mix below is the morning of a restaurant: the marketing site barely, the
 * public menu heavily (every QR scan), the health endpoint (every monitor), and
 * — with --api — the authenticated reads a console makes on load. Writes are
 * deliberately absent: a load test that places real orders is an incident.
 */

const args = Object.fromEntries(
  process.argv
    .slice(2)
    .map((a, i, all) =>
      a.startsWith('--')
        ? [a.slice(2), all[i + 1]?.startsWith('--') || all[i + 1] === undefined ? true : all[i + 1]]
        : [],
    )
    .filter((p) => p.length),
);

const BASE = args.base ?? 'http://127.0.0.1:3100';
const USERS = Number(args.users ?? 20);
const SECONDS = Number(args.seconds ?? 20);
const TENANT = args.tenant ?? 'demo-restaurant';
const API = args.api === true;
/*
 * `--host` sets the Host header, so the run can go through nginx on
 * 127.0.0.1:80 as if it were the public domain — the real path, with the real
 * proxy, php-fpm pool and cache in front of it. Hitting `next start` directly
 * measures a server that answers `/api/*` itself with a 404 in eight
 * milliseconds, which is how the first run of this script reported the API as
 * fast and the site as slow, both wrongly.
 */
const HOST = args.host;

/** [path, weight, headers] — weight is how often a virtual user picks it. */
const MIX = [
  ['/', 1, {}],
  ['/pricing', 1, {}],
  ['/download', 1, {}],
  ['/r/osh-xona', 3, {}],
  ['/r/osh-xona/menu', 4, {}],
  ['/customer/menu', 3, {}],
  ['/mp', 2, {}],
  ['/api/health', 2, {}],
  ['/api/v1/public/menu?channel=dine_in', 8, { 'X-Tenant': TENANT, Accept: 'application/json' }],
];

if (API) {
  MIX.push(['/api/v1/modules', 2, { 'X-Tenant': TENANT, Accept: 'application/json' }]);
}

const table = MIX.flatMap(([path, weight, headers]) =>
  Array.from({ length: weight }, () => [path, headers]),
);
const pick = () => table[Math.floor(Math.random() * table.length)];

const samples = []; // [path, ms, status]
let inflight = 0;
const deadline = Date.now() + SECONDS * 1000;

async function user() {
  while (Date.now() < deadline) {
    const [path, headers] = pick();
    const started = performance.now();
    inflight++;

    try {
      const response = await fetch(BASE + path, {
        headers: HOST ? { ...headers, Host: HOST } : headers,
        redirect: 'manual',
      });
      // Drain the body, or keep-alive sockets pile up and the client becomes
      // the bottleneck being measured.
      await response.arrayBuffer();
      samples.push([path, performance.now() - started, response.status]);
    } catch (error) {
      samples.push([path, performance.now() - started, 0]);
    } finally {
      inflight--;
    }
  }
}

const startedAt = Date.now();
await Promise.all(Array.from({ length: USERS }, user));
const elapsed = (Date.now() - startedAt) / 1000;

const pct = (sorted, p) =>
  sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))];

function summarise(rows) {
  const latencies = rows.map((r) => r[1]).sort((a, b) => a - b);
  const errors = rows.filter((r) => r[2] === 0 || r[2] >= 500).length;

  return {
    n: rows.length,
    rps: (rows.length / elapsed).toFixed(1),
    p50: pct(latencies, 50).toFixed(0),
    p95: pct(latencies, 95).toFixed(0),
    p99: pct(latencies, 99).toFixed(0),
    max: (latencies.at(-1) ?? 0).toFixed(0),
    mean: (latencies.reduce((a, b) => a + b, 0) / Math.max(1, latencies.length)).toFixed(0),
    errors,
    errorShare: ((errors / Math.max(1, rows.length)) * 100).toFixed(2) + '%',
  };
}

const byPath = new Map();
for (const row of samples) byPath.set(row[0], [...(byPath.get(row[0]) ?? []), row]);

console.log(`\n${BASE} · ${USERS} users · ${elapsed.toFixed(0)}s\n`);
console.table(
  Object.fromEntries([...byPath.entries()].map(([path, rows]) => [path, summarise(rows)])),
);
const total = summarise(samples);
console.log('TOTAL', total);

/*
 * The verdict. p95 under a second for a page and 300 ms for the public menu is
 * what a phone on restaurant Wi-Fi tolerates; an error share above 1% means
 * something fell over, whatever the latency says.
 */
const menu = byPath.get('/api/v1/public/menu?channel=dine_in');
const verdict =
  Number(total.errorShare.replace('%', '')) <= 1 &&
  Number(total.p95) <= 1000 &&
  (!menu || Number(summarise(menu).p95) <= 300);

console.log(verdict ? '\n✓ within budget' : '\n✗ OVER BUDGET');
process.exit(verdict ? 0 : 1);
