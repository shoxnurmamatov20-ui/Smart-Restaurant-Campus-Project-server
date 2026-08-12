# Production Readiness Baseline

**Status:** accepted baseline
**Target:** 30-module Smart Restaurant Campus platform

## SLO targets

| Area             | Target                                  |
| ---------------- | --------------------------------------- |
| API availability | 99.9% monthly                           |
| API p95 latency  | < 500 ms for normal endpoints           |
| Queue delay      | < 60 seconds for default/notifications  |
| Error rate       | < 1% 5xx over 10 minutes                |
| Backup RPO       | <= 24 hours                             |
| Restore RTO      | <= 4 hours for single-server deployment |

## Observability

Required in staging and production:

- Prometheus metrics
- Grafana dashboards
- Loki logs
- Alertmanager routing
- health endpoints for API, web, admin, AI services
- queue and failed-job monitoring
- database and Redis exporter metrics

## Backup and DR

Minimum backup scope:

- PostgreSQL logical backup
- MinIO bucket backup
- ClickHouse analytics backup
- `.env`/secrets backup through secure secret manager export

Minimum restore drill:

1. Restore PostgreSQL into clean environment.
2. Restore MinIO objects.
3. Run migrations.
4. Verify Super Admin login.
5. Verify one tenant workflow and one file download.

## Deployment

Docker Compose is acceptable for early on-prem rollout. Kubernetes/K3s becomes required when:

- multiple app replicas are needed
- zero-downtime deploys are required
- queue workers need independent scaling
- monitoring and secrets must be standardized

## Go-live gate

- all module contracts pass
- tenant isolation tests pass
- alert rules are active
- backup restore drill completed
- security checklist completed
- rollback plan documented
