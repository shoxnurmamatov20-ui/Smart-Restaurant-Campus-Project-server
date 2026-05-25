# CAMPUS API (Laravel 13)

> Backend REST API for CAMPUS Smart Campus Platform.
> Architecture: **modular monolith** (10 Phase-1 modules via `nwidart/laravel-modules`).

## Stack

| Layer | Technology |
|-------|------------|
| Runtime | PHP 8.3+ |
| Framework | Laravel 13.x |
| Database | PostgreSQL 16 |
| Cache / Queue / Sessions | Redis 7 |
| Search | Meilisearch |
| Object storage | MinIO (S3-compatible) |
| WebSocket | Laravel Reverb |
| Auth | Laravel Sanctum + Keycloak (SSO, later) |
| RBAC | Spatie laravel-permission |
| Audit | Spatie laravel-activitylog |
| Modules | nwidart/laravel-modules v12 |

## Key packages

| Package | Purpose |
|---------|---------|
| `laravel/sanctum` | SPA auth + API tokens |
| `nwidart/laravel-modules` | Modular monolith infrastructure |
| `spatie/laravel-permission` | Roles + permissions (RBAC) |
| `spatie/laravel-activitylog` | Immutable audit log |
| `spatie/laravel-medialibrary` | Media files (Module 9) |
| `spatie/laravel-query-builder` | API filtering + sorting |
| `spatie/laravel-data` | DTOs (Data Transfer Objects) |
| `spatie/laravel-backup` | Scheduled backups |
| `laravel/horizon` | Queue dashboard |
| `laravel/reverb` | WebSocket server |
| `laravel/scout` + `meilisearch-php` | Full-text search |
| `maatwebsite/excel` | Excel import/export |
| `barryvdh/laravel-dompdf` | PDF generation |

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

# 4. Run migrations
php artisan migrate

# 5. Create first Super Admin (after admin:create command is implemented)
php artisan admin:create

# 6. Publish Spatie configs
php artisan vendor:publish --provider="Spatie\Permission\PermissionServiceProvider"
php artisan vendor:publish --provider="Spatie\Activitylog\ActivitylogServiceProvider"

# 7. Create Phase 1 modules via nwidart/laravel-modules
php artisan module:make HR
php artisan module:make Students
php artisan module:make Online
php artisan module:make EDMS
php artisan module:make RTTM
php artisan module:make Psychology
php artisan module:make Exams
php artisan module:make Library
php artisan module:make Media
php artisan module:make KPI
```

## Run

```bash
# Local PHP server
php artisan serve --port=8000

# Or with docker compose (from project root)
docker compose up -d api

# Background workers
php artisan horizon      # Queue workers + dashboard
php artisan reverb:start # WebSocket server
php artisan pail         # Real-time logs
```

## Testing & quality

```bash
composer test          # Run Laravel tests
composer pest          # Pest framework
composer pint          # Format code (Laravel Pint)
composer stan          # PHPStan static analysis
composer rector        # Apply Rector refactorings
composer ide-helper    # Generate IDE helper files
```

## Phase 1 modules layout

```
Modules/
├── HR/                 # Modul 1 — Kadrlar
├── Students/           # Modul 2 — Talabalar (HEMIS integration)
├── Online/             # Modul 3 — Online platform (5–6 kurslar)
├── EDMS/               # Modul 4 — Elektron hujjat aylanish
├── RTTM/               # Modul 5 — IT inventarizatsiya
├── Psychology/         # Modul 6 — Psixologik test
├── Exams/              # Modul 7 — Fanlar test tizimi
├── Library/            # Modul 8 — Elektron kutubxona
├── Media/              # Modul 9 — Media DAM
└── KPI/                # Modul 10 — Shaffof KPI
```

Each module contains:
```
Modules/<Name>/
├── Config/
├── Console/
├── Database/
│   ├── Factories/
│   ├── Migrations/
│   └── Seeders/
├── Http/
│   ├── Controllers/
│   ├── Middleware/
│   └── Requests/
├── Models/
├── Providers/
├── Resources/
├── Routes/
│   ├── api.php
│   └── web.php
├── Services/
├── Tests/
├── composer.json
└── module.json
```

## API conventions

- **Versioning:** All routes under `/api/v1/...`
- **Admin endpoints:** `/api/v1/admin/...` (requires `super-admin` role)
- **Auth:** Laravel Sanctum (SPA cookies for web/admin, tokens for mobile/integrations)
- **Response format:** JSON only, consistent with Laravel API Resources
- **Pagination:** Cursor-based (Laravel built-in)
- **Filtering:** Spatie Query Builder (`?filter[name]=foo&sort=-created_at`)
- **Errors:** Standard Laravel error responses, 422 for validation

## Folder structure

```
apps/api/
├── app/                # Global app code (shared across modules)
│   ├── Http/           # Global controllers, middleware, requests
│   ├── Models/         # Global models (User, etc.)
│   ├── Providers/
│   ├── Services/       # Global services
│   ├── Console/        # Artisan commands
│   ├── Jobs/
│   ├── Events/
│   ├── Listeners/
│   ├── Notifications/
│   ├── Mail/
│   └── Policies/
├── bootstrap/          # Laravel bootstrap
├── config/             # Configuration files
├── database/
│   ├── factories/
│   ├── migrations/     # Global migrations
│   └── seeders/        # Global seeders
├── Modules/            # ⭐ Per-module isolated code
├── public/             # Web root (index.php, assets)
├── resources/          # Blade templates (mainly for emails)
├── routes/             # Global routes
│   ├── api.php         # Bootstraps all /api/v1
│   ├── web.php
│   ├── console.php
│   └── channels.php    # WebSocket channels
├── storage/            # File storage, logs, sessions
├── tests/              # Global tests (per-module tests are in Modules/)
├── artisan             # Artisan CLI
├── composer.json
├── phpunit.xml
└── .env.example
```
