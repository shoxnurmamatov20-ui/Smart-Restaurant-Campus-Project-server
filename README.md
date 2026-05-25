# CAMPUS — Smart Campus Platform

> **Yagona Raqamli Ekotizim Platformasi** — Oliy ta'lim muassasalari uchun yagona markazlashgan boshqaruv platformasi.
>
> *SMART CAMPUS — KELAJAK UNIVERSITETI*

[![Status](https://img.shields.io/badge/status-scaffolding-yellow.svg)]()
[![Phase](https://img.shields.io/badge/phase-1%20%2810%20modules%29-blue.svg)]()
[![License](https://img.shields.io/badge/license-Proprietary-red.svg)]()

---

## 🎯 Loyiha haqida

CAMPUS — universitet boshqaruvini to'liq raqamlashtiruvchi katta hajmli SaaS platforma. **30 modul** rejalashtirilgan, **Phase 1** da **10 ta asosiy modul** quriladi.

**Maqsad:** O'zbekiston (va kelajakda xalqaro) oliy ta'lim muassasalari uchun yagona markazlashgan ekotizim.

**Hajm:** Multi-tenant, multi-til (uz/ru/en), multi-platform (web + mobile + IoT).

📚 To'liq spetsifikatsiya: [`docs/CAMPUS_30_MODULLAR.md`](docs/CAMPUS_30_MODULLAR.md)

---

## 🧩 Phase 1 — 10 modul

| # | Modul | Maqsad |
|---|-------|--------|
| 1 | **HR** — Kadrlar boshqaruv | Xodimlar, Face ID + QR davomat |
| 2 | **Students** — Talabalar boshqaruv | HEMIS integratsiya, jurnal, davomat |
| 3 | **Online Platform** — 5–6 kurslar | Live darslar, video konferensiya |
| 4 | **EDMS** — Elektron hujjat aylanishi | E-IMZO, QR tasdiqlash, arxiv |
| 5 | **RTTM** — IT inventarizatsiya | Texnika nazorati, remont |
| 6 | **Psychology** — Psixologik testlar | Online testlar, AI tahlil |
| 7 | **Exams** — Test tizimi | Online imtihonlar, anti-cheat |
| 8 | **Library** — Elektron kutubxona | E-kitoblar, QR olish |
| 9 | **Media** — Media DAM | Cloud arxiv, AI qidiruv |
| 10 | **KPI** — Shaffof KPI | Real-time analitika, reyting |

---

## 🏗️ Texnologiyalar (Tech Stack)

| Layer | Choice |
|-------|--------|
| **Backend** | PHP 8.3+ / Laravel 11 / Eloquent / **modular monolith** (`nwidart/laravel-modules`) |
| **Auth** | Laravel Sanctum + Keycloak (SSO) |
| **Frontend** | Next.js 15 (App Router) + React 19 + TypeScript 5 + Tailwind v4 + shadcn/ui |
| **Admin** | Alohida Next.js 15 ilovasi (`apps/admin/`) |
| **Mobile** | React Native + Expo (Phase 2) |
| **AI/ML** | Python 3.13+ / FastAPI / uv |
| **Database** | PostgreSQL 16 (primary), Redis 7 (cache/queue), ClickHouse (analytics), MinIO (objects) |
| **Monorepo** | pnpm workspaces + Composer + Turborepo |
| **Containers** | Docker Compose (dev) → Kubernetes (prod) |
| **Server** | University on-prem: 12 TB / 500 GB RAM / Ubuntu 24.04 LTS |
| **Code hosting** | GitHub + GitHub Actions |
| **i18n** | next-intl: uz / ru / en |

---

## 📁 Folder strukturasi

```
smart-campus/
├── apps/
│   ├── web/              # Next.js — asosiy foydalanuvchi UI
│   ├── admin/            # Next.js — Super Admin paneli
│   ├── api/              # Laravel — backend REST API
│   ├── ai-services/      # Python FastAPI — AI/ML xizmatlari
│   └── mobile/           # React Native (Phase 2)
├── packages/             # Shared TS packages
│   ├── ui/               # shadcn komponentlar
│   ├── types/            # TS types
│   ├── config/           # ESLint, TSConfig, Tailwind, Prettier
│   ├── i18n/             # uz/ru/en tarjimalar
│   ├── utils/            # Helpers
│   └── sdk/              # API SDK (auto-gen)
├── infrastructure/       # Docker, K8s, Nginx, scripts, monitoring
├── docs/                 # Hujjatlar
├── tools/                # Internal tools
├── tests/                # E2E (Playwright)
└── .github/              # CI/CD workflows
```

---

## 🚀 Boshlash (Getting Started)

### Talablar (Prerequisites)
- **Node.js 24+** (`.nvmrc`)
- **pnpm 11+** (`npm install -g pnpm`)
- **PHP 8.3+** + **Composer**
- **Python 3.13+** + **uv** (`pip install uv`)
- **Docker Desktop** (local dev environment uchun)
- **Git**

### O'rnatish

```bash
# 1. Klonlash
git clone https://github.com/<owner>/smart-campus.git
cd smart-campus

# 2. Frontend va shared packages dependencies
pnpm install

# 3. Laravel API
cd apps/api
composer install
cp .env.example .env
php artisan key:generate
cd ../..

# 4. Python AI services
cd apps/ai-services
uv sync
cd ../..

# 5. Environment variables
cp .env.example .env
# .env ni ochib, kerakli qiymatlar bilan to'ldiring

# 6. Docker servislar (Postgres, Redis, ClickHouse, MinIO, Keycloak)
docker compose up -d

# 7. Database migration va seed
cd apps/api
php artisan migrate --seed
php artisan admin:create  # Birinchi Super Admin
cd ../..

# 8. Run!
pnpm dev    # Hammasi parallel ishga tushadi (Turborepo)
```

### Manzillar
- **Web app** → http://localhost:3000
- **Super Admin** → http://localhost:3001
- **API** → http://localhost:8000
- **AI Services** → http://localhost:8001
- **Keycloak** → http://localhost:8080
- **MinIO Console** → http://localhost:9001
- **Mailhog** → http://localhost:8025

---

## 📖 Hujjatlar

| Hujjat | Joylashuv |
|--------|-----------|
| Loyiha vizioni | [`CLAUDE.md`](CLAUDE.md) |
| Phase 1 spec (asl) | [`docs/source/CAMPUS_Yagona_Raqamli_Platforma.docx`](docs/source/) |
| 30 modullar spec | [`docs/CAMPUS_30_MODULLAR.md`](docs/CAMPUS_30_MODULLAR.md) |
| Arxitektura | [`docs/architecture/`](docs/architecture/) |
| Modullar | [`docs/modules/`](docs/modules/) |
| ADRs (qarorlar tarixi) | [`docs/decisions/`](docs/decisions/) |
| Deploy | [`docs/deployment/`](docs/deployment/) |

---

## 🤝 Hissa qo'shish (Contributing)

[CONTRIBUTING.md](CONTRIBUTING.md) ko'ring.

## 🔒 Xavfsizlik

Xavfsizlik muammosini topdingizmi? [SECURITY.md](SECURITY.md) ko'ring.

## 📝 Litsenziya

Proprietary — [LICENSE](LICENSE) ko'ring.

---

**Status:** Phase 1 scaffolding (2026-05-25)
**Maintainer:** uzbcorp@gmail.com
