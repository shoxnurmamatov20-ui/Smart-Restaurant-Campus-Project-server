# Smart Restaurant Campus Module Contract Standard

**Status:** enforced by `tests/Architecture/ModuleBoundaryTest`
**Applies to:** every Laravel module under `apps/api/Modules/*`

## Module boundary

Each module owns its own domain models, migrations, controllers, requests,
resources, jobs, events, policies, and tests. Cross-module access must go through
one of these:

| Contract                                   | Use it for                                | Example                                 |
| ------------------------------------------ | ----------------------------------------- | --------------------------------------- |
| **Domain event** (`App\Support\Events`)    | "something happened, react if you care"   | `orders.paid` → CRM credits the guest   |
| **Core read contract** (`App\Contracts\*`) | "I need to read your data, synchronously" | `MenuCatalog` → Orders snapshots a dish |
| Public API route `/api/v1/{module}`        | another service or a frontend             | the admin UI                            |
| Queued job                                 | slow side effects                         | `SendTelegramMessage`                   |
| Read model / analytics table               | reporting                                 | Analytics                               |

**Direct writes into another module's tables are not allowed.** Neither are
`use Modules\Other\...` imports, `DB::table('their_table')`, or an
`exists:their_table,id` validation rule — the last one is the same coupling with
none of the visibility, and the architecture test catches all three.

### Recorded exceptions

Real edges that exist today are listed in `ModuleBoundaryTest::ALLOWED_EDGES`
with a reason. Anything not on that list fails the build; an entry that no longer
corresponds to real code also fails, so the list cannot rot into decoration.

- `Analytics → Menu | Orders | Finance` — a reporting module reads across the
  business by definition. Read-only.
- `Kitchen → Orders` — to become a subscriber to `orders.confirmed`.
- `Suppliers → Inventory` — to become a publisher of `suppliers.delivery_received`.

## Adding a read contract

1. Define the interface and its value objects in `app/Contracts/{Domain}/`.
   Value objects only — no Eloquent models cross the boundary.
2. Bind a null implementation in `AppServiceProvider` with `bindIf`, so the rest
   of the platform still boots when the module is absent or switched off.
3. Implement it in the owning module and bind it in that module's provider.

`App\Contracts\Menu\MenuCatalog` is the worked example.

## Database layout

Every module keeps its tables in a **PostgreSQL schema of its own** — see
[ADR-0010](../decisions/0010-schema-per-module.md). Adding a module means two
edits, and the architecture tests fail until both exist:

1. A line in `database/migrations/0000_01_01_000000_create_module_schemas.php`
2. A line in `tests/Architecture/ModuleBoundaryTest::MODULE_SCHEMAS`

Then, inside the module:

```php
// migration — names the schema outright
Schema::create('menu.menu_items', function (Blueprint $table): void { … });

// model — Eloquent's convention would land it in `public`
protected $table = 'menu.menu_items';
```

`search_path` lists `public` first and every module schema after it, so an
unqualified reference still resolves: `exists:menu_items,id` in a rule and
`assertDatabaseHas('orders', …)` in a test need no schema. Explicit where it
matters, inferred where it does not.

A module may add a column to a **core** table it extends (`public.users`), but
never touches another module's schema. `ModuleBoundaryTest` enforces all of it.

PostgreSQL is the only supported engine — development, tests, CI and production.
No module may use SQL another engine would need translated.

## Required module structure

```text
Modules/{Name}/
  app/Http/Controllers/
  app/Http/Requests/
  app/Http/Resources/
  app/Models/
  app/Policies/
  app/Services/          ← implementations of core contracts live here
  app/Events/            ← DomainEvent subclasses
  app/Listeners/         ← subscribers, registered by name in EventServiceProvider
  app/Jobs/
  config/config.php      ← registry metadata (see below)
  database/migrations/
  database/seeders/
  routes/api.php
  tests/Feature/
  tests/Unit/
```

## Registry metadata

Every module describes itself in `config/config.php`, and `GET /api/v1/modules`
serves it. Clients build their navigation from that endpoint rather than
hard-coding a module list.

```php
'alias' => 'menu',
'icon' => 'utensils',          // lucide name
'group' => 'operations',
'order' => 1,                  // sidebar position
'route' => 'v1/menu',
'permission_prefix' => 'menu', // RBAC prefix; may differ from the alias
'required' => true,            // a restaurant cannot switch this off
'labels' => ['uz' => 'Menyu', 'ru' => 'Меню', 'en' => 'Menu'],
'enabled' => env('MODULE_MENU_ENABLED', true),
```

A restaurant switching a module off closes its routes, not just its sidebar entry
— `EnsureModuleEnabled` resolves the owning module from the controller namespace.

## API rules

- Route prefix: `/api/v1/{module}`, mounted under the `tenant` middleware group
- Response shape: JSON object with `data`, optional `meta`, optional `links`
- Validation: Form Request classes only
- Authorization: policies or explicit permission middleware on the route
- Pagination: required for list endpoints, capped page size
- Filtering/sorting: `spatie/laravel-query-builder`
- Versioning: breaking changes require `/api/v2` or additive fields only

## Multi-tenancy rules

- Every business table carries `tenant_id`; every module model uses
  `BelongsToTenant`. Both enforced by the architecture test.
- Cross-module references are plain ids with **no foreign key** — a hard FK would
  make Orders undeployable without Tables.
- Route-model binding runs _after_ tenant resolution (`bootstrap/app.php`
  middleware priority). Reversing that order makes every `/{id}` route a
  cross-tenant read.

## Data rules

- Money: integer **tiyin** (1 UZS = 100 tiyin). Never a float.
- Stock: integer grams, millilitres or pieces.
- User-visible content: jsonb `{uz, ru, en}` via `HasTranslations`. The resource
  exposes both the resolved string (`title`) and the full map (`name`).
- History is snapshotted: an order line copies sku, title, price and station, so
  repricing the menu tomorrow never rewrites yesterday's bill.

## Test rules

Minimum coverage per module:

- tenant isolation, by list **and** by id
- authorization per role
- validation failure
- happy path CRUD or workflow
- domain invariants (the arithmetic a restaurant actually checks)
- event publication or subscription for side effects
