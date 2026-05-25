# Grafana dashboards

Grafana auto-provisioning uchun JSON dashboard fayllari.

## Tuzilma

```
grafana-dashboards/
├── system-health.json       # CPU, RAM, disk, network
├── api-performance.json     # Laravel API metrics
├── database.json            # PostgreSQL stats
├── redis.json               # Redis stats
├── nginx.json               # Nginx access patterns
└── modules/                 # Per-modul KPI dashboards
    ├── hr.json
    ├── students.json
    └── ...
```

## Foydalanish

Docker Compose'da `monitoring` profile yoqilsa, ushbu papkadagi dashboardlar avtomatik o'rnatiladi:

```bash
docker compose --profile monitoring up -d
```

Grafana: http://localhost:3030 (admin/admin)

> **Hozir bo'sh.** Birinchi dashboard'lar Phase 1 modullari ishlay boshlagach qo'shiladi.
