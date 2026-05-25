# Performance benchmarks

Tizim performansini o'lchash uchun skriptlar.

## Rejada

- **API load test** — `k6` skripts: 1K → 10K → 100K concurrent users
- **Database benchmarks** — eng tez-tez ishlatiladigan querylar latency
- **Frontend** — Lighthouse CI, bundle size monitoring
- **AI services** — model inference latency

## Asboblar (kelajakda)

- [k6.io](https://k6.io) — HTTP load testing
- [Apache Bench](https://httpd.apache.org/docs/2.4/programs/ab.html) — oddiy stress
- [pgbench](https://www.postgresql.org/docs/current/pgbench.html) — Postgres benchmark
- [autocannon](https://github.com/mcollina/autocannon) — Node.js HTTP benchmarking

> **Hozir bo'sh.** Performance testlar zarur bo'lganda yoziladi (odatda Phase 1 oxiri / Phase 2 boshi).
