# 🍽️ Smart Restaurant Campus

> **Restoranlar uchun yagona raqamli platforma** — menyudan kassagacha, oshxonadan analitikagacha.
>
> _SMART RESTAURANT CAMPUS — RESTORANINGIZ BITTA EKRANDA_

[![Status](https://img.shields.io/badge/status-phase%201-yellow.svg)](<>)
[![Phase](https://img.shields.io/badge/phase-1%20%2810%20modules%29-blue.svg)](<>)
[![License](https://img.shields.io/badge/license-Proprietary-red.svg)](<>)

---

## 🎯 Loyiha haqida

Smart Restaurant Campus — restoran, kafe, oshxona va fast-food tarmoqlarini
to'liq raqamlashtiruvchi multi-tenant SaaS platforma. **30 modul**
rejalashtirilgan, **Phase 1** da **10 ta asosiy modul** quriladi.

**Maqsad:** O'zbekiston (va kelajakda xalqaro) ovqatlanish biznesi uchun yagona
ekotizim — bitta tizimda menyu, buyurtma, oshxona, ombor, kassa, xodim va analitika.

**Hajm:** Multi-tenant (bitta tenant = bitta restoran biznesi), multi-filial,
multi-til (uz/ru/en), multi-kanal (zal + olib ketish + yetkazib berish + agregator).

📚 To'liq spetsifikatsiya: [`docs/RESTAURANT_30_MODULLAR.md`](docs/RESTAURANT_30_MODULLAR.md)

---

## 🧩 Phase 1 — 10 modul

| #   | Modul                          | Maqsad                                                     |
| --- | ------------------------------ | ---------------------------------------------------------- |
| 1   | **Menu** — Menyu               | Kategoriyalar, taomlar, narxlar, modifikatorlar, stop-list |
| 2   | **Orders** — Buyurtmalar       | Zal, olib ketish, yetkazib berish, agregator               |
| 3   | **Kitchen** — Oshxona (KDS)    | Sexlar bo'yicha chiptalar, taymer, kechikish nazorati      |
| 4   | **Tables** — Stollar           | Zal xaritasi, bandlik, bron, QR-menyu                      |
| 5   | **Inventory** — Ombor          | Ingredient, texnologik karta, qoldiq, inventarizatsiya     |
| 6   | **Suppliers** — Yetkazuvchilar | Xarid arizasi, kirim, narx taqqoslash, qarzdorlik          |
| 7   | **Staff** — Xodimlar           | Smenalar, davomat (Face ID/QR), ish haqi asosi             |
| 8   | **Finance** — Moliya           | Kassa smenasi, to'lovlar, fiskal chek, xarajatlar          |
| 9   | **CRM** — Mijozlar             | Sodiqlik, bonus, aksiyalar, fikr-mulohaza                  |
| 10  | **Analytics** — Analitika      | Tushum, food-cost, ABC tahlil, filiallar taqqoslash        |

Qo'shimcha: **TelegramBots** — 10 ta ishlaydigan + 40 ta rejalashtirilgan bot.

**`Modules/Menu` — kanonik namuna.** U to'liq yozilgan (model, migratsiya,
factory, form request, API resource, controller, RBAC route, real menyuli
seeder, tenant izolyatsiyasini tekshiruvchi testlar). Qolgan modullar aynan shu
shaklni takrorlaydi.

---

## 🏗️ Texnologiyalar (Tech Stack)

| Layer          | Choice                                                                                  |
| -------------- | --------------------------------------------------------------------------------------- |
| **Backend**    | PHP 8.3+ / Laravel 13 / Eloquent / **modular monolith** (`nwidart/laravel-modules`)     |
| **Auth**       | Laravel Sanctum + Keycloak (SSO)                                                        |
| **Realtime**   | Laravel Reverb — KDS, zal xaritasi, kassa                                               |
| **Frontend**   | Next.js 16 (App Router) + React 19 + TypeScript 5 + Tailwind v4 + shadcn/ui             |
| **Admin**      | Alohida Next.js ilovasi (`apps/admin/`)                                                 |
| **Bots**       | Python 3.13 + aiogram 3 — bitta dispatcher, 50 bot                                      |
| **AI/ML**      | Python 3.13+ / FastAPI / uv                                                             |
| **Database**   | PostgreSQL 16 (primary), Redis 7 (cache/queue), ClickHouse (analytics), MinIO (objects) |
| **Monorepo**   | pnpm workspaces + Composer + Turborepo                                                  |
| **Containers** | Docker Compose (dev) → Kubernetes (prod)                                                |
| **i18n**       | next-intl: uz / ru / en                                                                 |

---

## 📁 Folder strukturasi

```
smart-restaurant-campus/
├── apps/
│   ├── web/              # Next.js — xodimlar konsoli · 3000 (10 modul; kassa hali qurilmagan)
│   ├── admin/            # Next.js — platforma administratori · 3001
│   ├── api/              # Laravel — backend REST API (12 modul)
│   ├── ai-services/      # Python FastAPI — AI/ML xizmatlari
│   ├── telegram-bots/    # Python aiogram — 50 botli dispatcher
│   └── mobile/           # React Native (Phase 2 — hozircha faqat README)
├── packages/             # Shared TS packages (@restaurant/*)
│   ├── ui/               # Yagona komponent kutubxonasi — 26 primitiv + token qatlami
│   ├── types/            # TS types
│   ├── config/           # ESLint (flat) va TSConfig presetlari
│   ├── i18n/             # uz/ru/en tarjimalar
│   ├── utils/            # Helpers (cn, pul formatlash)
│   └── sdk/              # API SDK
├── infrastructure/       # Docker, K8s, Nginx, scripts, monitoring
├── docs/                 # Hujjatlar
├── tools/                # Ichki skriptlar (PWA ikonkalarini generatsiya qilish)
└── .github/              # CI/CD workflows
```

**Dizayn tizimi.** Uchala Next.js ilovasi ham `packages/ui` dan oladi — nusxa yo'q.
Ranglar, radius va shriftlar `packages/ui/src/styles/tokens.css` da e'lon qilinadi,
har bir ilova esa o'z `globals.css` ida faqat qiymatlarni qayta belgilaydi. Jonli
galereya: **http://localhost:3000/design**. Batafsil: [`docs/design/README.md`](docs/design/README.md).

---

## 🚀 Boshlash (Getting Started)

### Talablar (Prerequisites)

- **Node.js 24+** (`.nvmrc`)
- **pnpm 11+** (`npm install -g pnpm`)
- **PHP 8.3+** + **Composer** — `pdo_pgsql` yoqilgan bo'lsin
- **PostgreSQL 16+** — testlar ham shu dvigatelda ishlaydi, SQLite emas: har bir
  modul o'z schema'sida yashaydi va schema'lar faqat PostgreSQL'da bor
  ([ADR-0010](docs/decisions/0010-schema-per-module.md))
- **Python 3.13+** + **uv** (`pip install uv`)
- **Docker Desktop** (local dev environment uchun)
- **Git**

### O'rnatish

```bash
# 1. Klonlash
git clone https://github.com/<owner>/smart-restaurant-campus.git
cd smart-restaurant-campus

# 2. Frontend va shared packages
pnpm install

# 3. Laravel API
cd apps/api
composer install
cp .env.example .env
php artisan key:generate
cd ../..

# 4. Python xizmatlari
cd apps/ai-services && uv sync && cd ../..
cd apps/telegram-bots && uv sync && cd ../..

# 5. Environment variables
cp .env.example .env
# .env ni ochib, kerakli qiymatlar bilan to'ldiring

# 6. Docker servislar (Postgres, Redis, ClickHouse, MinIO, Keycloak)
docker compose up -d

# 7. Migratsiya + seed (rollar, demo restoran, real menyu)
cd apps/api
php artisan migrate --seed
php artisan admin:create      # Birinchi Super Admin
cd ../..

# 8. Run!
pnpm dev    # Hammasi parallel ishga tushadi (Turborepo)
```

### Manzillar

- **Xodimlar konsoli** → http://localhost:3000
- **Dizayn tizimi galereyasi** → http://localhost:3000/design
- **Platforma admin** → http://localhost:3001
- **API** → http://localhost:8000
- **AI Services** → http://localhost:8001
- **Telegram bots** → http://localhost:8002
- **Keycloak** → http://localhost:8090
- **MinIO Console** → http://localhost:9001
- **Mailpit** → http://localhost:8025

---

## 🧪 Testlar

```bash
# Laravel (Unit + Feature + Modules + Architecture)
# restaurant_campus_test bazasi ishlab turishi shart — to'plam migrate:fresh
# bilan boshlanadi, shuning uchun ochiq psql/tinker seanslarini oldin yoping.
cd apps/api && php vendor/bin/phpunit

# Telegram botlar
cd apps/telegram-bots && uv run pytest

# AI xizmatlari
cd apps/ai-services && uv run pytest

# Frontend
pnpm test
```

---

## 💡 Muhim konventsiyalar

- **Pul — butun son, tiyinda.** 45 000 so'm = `4500000`. Float ishlatilmaydi.
- **Ko'p tilli kontent** — jsonb `{uz, ru, en}`. API `title` maydonida joriy
  til bo'yicha tayyor qiymatni ham qaytaradi.
- **Tenant** — har bir so'rov `X-Tenant` header yoki subdomen orqali restoranni
  aniqlaydi. Global scope bitta restoranni boshqasidan ajratadi.
- **RBAC** — 15 ta restoran roli: `owner`, `branch-manager`, `chef`, `cook`,
  `waiter`, `bartender`, `cashier`, `host`, `courier`, `storekeeper`,
  `accountant`, `marketer`, `brand-manager`, `super-admin`, `guest`.

---

## 📖 Hujjatlar

| Hujjat                 | Joylashuv                                                          |
| ---------------------- | ------------------------------------------------------------------ |
| Loyiha vizioni         | [`CLAUDE.md`](CLAUDE.md)                                           |
| 30 modullar spec       | [`docs/RESTAURANT_30_MODULLAR.md`](docs/RESTAURANT_30_MODULLAR.md) |
| Arxitektura            | [`docs/architecture/`](docs/architecture/)                         |
| Modullar               | [`docs/modules/`](docs/modules/)                                   |
| ADRs (qarorlar tarixi) | [`docs/decisions/`](docs/decisions/)                               |
| Deploy                 | [`docs/deployment/`](docs/deployment/)                             |

---

## 🤝 Hissa qo'shish (Contributing)

[CONTRIBUTING.md](CONTRIBUTING.md) ko'ring.

## 🔒 Xavfsizlik

Xavfsizlik muammosini topdingizmi? [SECURITY.md](SECURITY.md) ko'ring.

## 📝 Litsenziya

Proprietary — [LICENSE](LICENSE) ko'ring.

---

**Maintainer:** uzbcorp@gmail.com
