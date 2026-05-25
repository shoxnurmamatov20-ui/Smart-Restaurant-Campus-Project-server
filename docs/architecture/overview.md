# CAMPUS — Arxitektura sharhi

## Yuqori darajadagi rasm

```
┌───────────────────────────────────────────────────────────────┐
│                    FOYDALANUVCHILAR                            │
│  Talabalar · O'qituvchilar · Xodimlar · Ota-onalar · Mehmonlar │
└────────────────┬──────────────────────────────┬───────────────┘
                 │                              │
                 ▼                              ▼
        ┌─────────────────┐          ┌──────────────────┐
        │   Web App       │          │  Mobile (Phase 2)│
        │   apps/web      │          │   apps/mobile    │
        │   Next.js 16    │          │   RN + Expo      │
        │   Port 3000     │          │                  │
        └────────┬────────┘          └─────────┬────────┘
                 │                             │
                 │       ┌───────────┐         │
                 │       │ Super     │         │
                 │       │ Admin     │         │
                 │       │ apps/admin│         │
                 │       │ Port 3001 │         │
                 │       └─────┬─────┘         │
                 │             │               │
                 ▼             ▼               ▼
        ┌────────────────────────────────────────────────┐
        │             NGINX (reverse proxy)              │
        │      Rate limiting · TLS · WebSocket upgrade   │
        └────────────────────┬───────────────────────────┘
                             │
        ┌────────────────────┼────────────────────────────┐
        │                    │                            │
        ▼                    ▼                            ▼
┌───────────────┐   ┌──────────────┐         ┌────────────────┐
│ Laravel API   │   │ AI Services  │         │ Reverb (WS)    │
│ apps/api      │   │ apps/ai-svc  │         │ Real-time      │
│ Port 9000     │   │ Port 8001    │         │ Port 8080      │
│ PHP-FPM 8.3   │   │ Python 3.13  │         │                │
│ Modular       │   │ FastAPI      │         │                │
│ Monolith      │   │              │         │                │
└───────┬───────┘   └──────┬───────┘         └────────┬───────┘
        │                  │                          │
        └─────────┬────────┴──────────────────────────┘
                  │
        ┌─────────┴───────────────────────────────┐
        │                                         │
        ▼                                         ▼
┌──────────────────────────┐         ┌────────────────────┐
│       DATA LAYER          │         │   IDENTITY         │
├──────────────────────────┤         │   Keycloak         │
│ PostgreSQL 16 (primary)  │         │   SSO (Phase 2)    │
│ Redis 7 (cache/queue)    │         │   Port 8090        │
│ ClickHouse (analytics)   │         └────────────────────┘
│ MinIO (S3 objects)       │
│ Meilisearch (search)     │
└──────────────────────────┘

   ┌──────────────────────────────────────────┐
   │  INTEGRATSIYALAR (tashqi)                │
   ├──────────────────────────────────────────┤
   │  HEMIS · E-IMZO · Payme · Click · Eskiz  │
   │  OpenAI · Anthropic · MyGov              │
   └──────────────────────────────────────────┘
```

## Tamoyillar

1. **Modular monolith → microservices** — Phase 1 da modular monolith, scale yetganda alohida xizmatlarga ajratish.
2. **Stateless services** — Sessiya holati Redis'da, fayl Minio'da. App container'lar restart bo'lsa ham ishlaydi.
3. **Async first** — Og'ir operatsiyalar queue'ga (Laravel Horizon + Redis).
4. **i18n from day one** — uz / ru / en. Yangi modul majburiy ravishda 3 tilga tarjima.
5. **Multi-tenant ready** — Ma'lumotlar modeli tenant_id bilan kelishi mumkin (universitetlar uchun).
6. **Audit log mandatory** — Har bir o'zgaruvchi amal Spatie ActivityLog orqali yoziladi.
7. **Defense in depth** — Sanctum (auth), Keycloak (SSO), RBAC (Spatie permission), 2FA (Super Admin majburiy).

## Komponentlar mas'uliyati

| Komponent | Mas'uliyat |
|-----------|-----------|
| **Nginx** | TLS, rate limit, statik fayllar, reverse proxy, WebSocket upgrade |
| **apps/web** | Talaba/xodim foydalanuvchi UI (multi-tenant aware) |
| **apps/admin** | Super Admin paneli (2FA, IP allowlist, audit) |
| **apps/api** | Asosiy biznes-logika, 10 ta Phase-1 modul (modular monolith) |
| **apps/ai-services** | Computational AI/ML (anti-plagiat, chatbot, prediction) |
| **PostgreSQL** | Asosiy OLTP — barcha business data |
| **Redis** | Cache (Laravel cache), Sessions, Queues (Horizon), Pub/Sub |
| **ClickHouse** | OLAP — KPI, analytics, time-series |
| **MinIO** | Fayl saqlash — media, hujjatlar, eksport |
| **Meilisearch** | Tezkor qidiruv (lugatxona, talaba qidirish) |
| **Keycloak** | Identity Provider (SSO, OIDC) |
| **Reverb** | WebSocket (chat, real-time notifikatsiyalar) |

## Data flow misol — Talaba davomatga belgi qo'yish

```
1. Talaba telefonida QR scan qiladi → apps/web yoki apps/mobile
2. Web → POST /api/v1/attendance (Sanctum token)
3. Nginx → apps/api (PHP-FPM)
4. Laravel:
   - Validation (Form Request)
   - Authorization (Policy: faqat o'z davomatini belgilashi mumkin)
   - DB: INSERT INTO attendances (PostgreSQL)
   - Activity log: yozildi (Spatie)
   - Event broadcast: AttendanceMarked (Reverb)
5. Reverb → barcha ulangan dashboardlarga (deans panel, parent app)
6. KPI service ClickHouse'ga async yozadi (background job)
```

## Scaling stretegiyasi

| Bosqich | User soni | Yondashuv |
|---------|-----------|-----------|
| **MVP** (Phase 1) | < 10K | Bitta server, Docker Compose |
| **Growth** | 10K–100K | Vertical scaling, Postgres replica, Redis cluster |
| **Scale** | 100K–1M | Kubernetes, modul'larni alohida service'larga ajratish |
| **Global** | 1M+ | Multi-region, CDN, edge caching, sharding |
