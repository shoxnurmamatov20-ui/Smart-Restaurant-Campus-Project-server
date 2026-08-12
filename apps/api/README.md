# Smart Restaurant Campus API (Laravel 13)

> Backend REST API for the Smart Restaurant Campus platform.
> Architecture: **modular monolith** — 12 modules via `nwidart/laravel-modules`:
> the ten Phase-1 business modules plus `TelegramBots` (bot gateway) and `Pos` (till).

## Stack

| Layer                    | Technology                              |
| ------------------------ | --------------------------------------- |
| Runtime                  | PHP 8.3+                                |
| Framework                | Laravel 13.x                            |
| Database                 | PostgreSQL 16                           |
| Cache / Queue / Sessions | Redis 7                                 |
| Search                   | Meilisearch                             |
| Object storage           | MinIO (S3-compatible)                   |
| WebSocket                | Laravel Reverb (KDS, floor, cash desk)  |
| Auth                     | Laravel Sanctum + Keycloak (SSO, later) |
| RBAC                     | Spatie laravel-permission               |
| Audit                    | Spatie laravel-activitylog              |
| Modules                  | nwidart/laravel-modules v13             |

## Key packages

| Package                             | Purpose                                                  |
| ----------------------------------- | -------------------------------------------------------- |
| `laravel/sanctum`                   | SPA auth + API tokens (POS terminals, bots)              |
| `nwidart/laravel-modules`           | Modular monolith infrastructure                          |
| `spatie/laravel-permission`         | Roles + permissions (RBAC)                               |
| `spatie/laravel-activitylog`        | Immutable audit log (price changes, refunds, write-offs) |
| `spatie/laravel-medialibrary`       | Dish photos, receipts                                    |
| `spatie/laravel-query-builder`      | API filtering + sorting                                  |
| `spatie/laravel-data`               | DTOs                                                     |
| `spatie/laravel-backup`             | Scheduled backups                                        |
| `laravel/horizon`                   | Queue dashboard                                          |
| `laravel/reverb`                    | WebSocket server                                         |
| `laravel/scout` + `meilisearch-php` | Menu and guest search                                    |
| `maatwebsite/excel`                 | Stock-take and sales export                              |
| `barryvdh/laravel-dompdf`           | Receipts, invoices, Z-reports                            |

## Setup

```bash
# 1. Verify PHP 8.3+ and Composer
php --version
composer --version

# 2. Install Composer dependencies
composer install

# 3. Prepare .env
cp .env.example .env
php artisan key:generate

# 4. Run migrations + seed (roles, demo restaurant, demo menu)
php artisan migrate --seed

# 5. Create the first Super Admin
php artisan admin:create
```

## Run

```bash
# Local PHP server
php artisan serve --port=8000

# Or with docker compose (from project root)
docker compose up -d api

# Background workers
php artisan horizon      # Queue workers + dashboard
php artisan reverb:start # WebSocket server (kitchen display, floor)
php artisan pail         # Real-time logs
```

## Testing & quality

```bash
composer test          # Laravel test runner (Unit + Feature + Modules)
composer pest          # Pest framework
composer pint          # Format code (Laravel Pint)
composer stan          # PHPStan / Larastan static analysis
composer rector        # Apply Rector refactorings
composer ide-helper    # Generate IDE helper files
```

`phpunit.xml` defines three suites — `Unit`, `Feature` and `Modules`. The last
one collects `Modules/*/tests/**`; without it per-module tests would never run.

## Phase 1 modules

```
Modules/
├── Menu/               # Modul 1 — Menyu, taomlar, narxlar, stop-list   ⭐ canonical
├── Orders/             # Modul 2 — Buyurtmalar (zal / takeaway / delivery)
├── Kitchen/            # Modul 3 — Oshxona displey tizimi (KDS)
├── Tables/             # Modul 4 — Stollar, zallar, bronlar, QR-menyu
├── Inventory/          # Modul 5 — Ombor, ingredient, texnologik karta
├── Suppliers/          # Modul 6 — Yetkazib beruvchilar va xaridlar
├── Staff/              # Modul 7 — Xodimlar, smenalar, davomat
├── Finance/            # Modul 8 — Kassa, to'lovlar, fiskal cheklar
├── Crm/                # Modul 9 — Mijozlar, sodiqlik, aksiyalar
├── Analytics/          # Modul 10 — Sotuv analitikasi, food-cost, KPI
└── TelegramBots/       # Ko'p-botli Telegram infratuzilmasi
```

**`Modules/Menu` is the canonical module.** It is fully implemented — models,
migrations, factories, form requests, API resources, controllers, RBAC routes,
seeder with a real Uzbek menu, and feature tests including tenant isolation.
Every other module is expected to replicate that exact shape.

Each module contains:

```
Modules/<Name>/
├── app/
│   ├── Events/
│   ├── Http/{Controllers,Requests,Resources}/
│   ├── Listeners/
│   ├── Models/
│   ├── Providers/
│   └── Services/
├── config/config.php
├── database/{factories,migrations,seeders}/
├── resources/{assets,views}/
├── routes/{api.php,web.php}
├── tests/{Feature,Unit}/
├── composer.json
├── module.json
└── README.md
```

## API conventions

- **Versioning:** all routes under `/api/v1/...`
- **Module namespace:** `/api/v1/{module-alias}/...` (e.g. `/api/v1/menu/items`)
- **Module discovery:** `GET /api/v1/{alias}/` returns labels, endpoints, counts
- **Guest endpoints:** `/api/v1/public/...` — QR menu, feedback. No auth, still tenant-scoped.
- **Platform admin:** `/api/v1/admin/...` (requires `super-admin` role)
- **Auth:** Laravel Sanctum (SPA cookies for web/admin, tokens for POS/mobile/bots)
- **Tenancy:** every authenticated route carries the `tenant` middleware; the
  restaurant comes from the `X-Tenant` header or the subdomain
- **Money:** integers in **tiyin** (1 UZS = 100 tiyin). Never a float.
- **Multilingual content:** jsonb `{uz, ru, en}` columns + `HasTranslations`
- **Filtering:** Spatie Query Builder (`?filter[search]=osh&sort=-price`)
- **Errors:** standard Laravel responses, 422 for validation

## RBAC

15 restaurant roles seeded by `RolesAndPermissionsSeeder`:

`super-admin` · `owner` · `brand-manager` · `branch-manager` · `chef` · `cook` ·
`waiter` · `bartender` · `cashier` · `host` · `courier` · `storekeeper` ·
`accountant` · `marketer` · `guest`

Permissions follow `{module}.{action}` where action is
`view | create | update | delete | manage`, plus platform-level permissions
(`system.*`, `tenants.manage`, `reports.export`, ...).

## Broadcast channels

| Channel                  | Who listens                     |
| ------------------------ | ------------------------------- |
| `tenant.{id}.kitchen`    | cook, chef, bartender, managers |
| `tenant.{id}.floor`      | waiter, host, managers          |
| `tenant.{id}.cashdesk`   | cashier, accountant, managers   |
| `tenant.{id}.management` | branch/brand manager, owner     |

## Folder structure

```
apps/api/
├── app/                # Core — shared by every module, depends on none of them
│   ├── Console/Commands/
│   ├── Http/{Controllers,Middleware}/
│   ├── Models/         # User, Tenant, Concerns/{BelongsToTenant,HasTranslations}
│   ├── Providers/
│   └── Support/Tenancy/
├── bootstrap/
├── config/
├── database/{factories,migrations,seeders}/
├── Modules/            # ⭐ Per-module isolated code
├── public/
├── resources/
├── routes/             # api.php, web.php, console.php, channels.php
├── storage/
├── tests/              # Core tests (per-module tests live in Modules/*/tests)
├── artisan
├── composer.json
├── phpunit.xml
└── .env.example
```
