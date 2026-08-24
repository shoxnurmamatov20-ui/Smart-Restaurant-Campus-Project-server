# Load — does the box hold when forty-two restaurants open at once

```bash
pnpm load                                   # 30 users, 30 s, through nginx as the public host
node infrastructure/load/run.mjs --base http://127.0.0.1 --host mypos.tashmedunitf.uz --users 100 --seconds 60
```

No dependency: `fetch`, a clock, a sort. The mix is a restaurant's morning —
the public menu most of all (every QR scan is one), health (every monitor),
the consumer surfaces, the marketing site barely. **Reads only.** A load test
that places orders is an incident with a nice graph.

**Go through nginx, never `next start` directly.** The first run of this
script hit `:3100` and reported the API at 8 ms and the site at 18 s — both
wrong: Next answers `/api/*` itself with a 404, and the site was slow because
the box was running six build agents. `--host` sends the public `Host` header
to `127.0.0.1:80`, which is the real path: proxy, php-fpm pool, cache.

## Budget

|                    | limit      | why                                                                     |
| ------------------ | ---------- | ----------------------------------------------------------------------- |
| error share        | ≤ 1%       | anything above means something fell over, whatever the latency says     |
| p95, any page      | ≤ 1 000 ms | what a phone on restaurant Wi-Fi tolerates before re-tapping            |
| p95, `public/menu` | ≤ 300 ms   | a QR scan is the first thing a guest does; this is the first impression |

## Baseline — 2026-08-22, 8 GB box, six agents building beside it

30 users · 20 s → **101 rps · p50 243 ms · p95 587 ms · 0 errors.** API
`public/menu` p50 32 ms. Pages ~250–400 ms, which is Next SSR; the restaurant
site's home (`/r/{slug}`) is the slowest page at ~400 ms because it renders
the menu and the JSON-LD graph for five branches on every request. An ISR
window there would halve it; not done, because nothing asked for it yet.
