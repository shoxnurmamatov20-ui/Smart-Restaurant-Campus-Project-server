# Smart Restaurant Campus Multi-Tenancy Foundation

**Status:** accepted baseline
**Applies to:** all 30 modules

## Decision

Smart Restaurant Campus starts with **single PostgreSQL database + `tenant_id` on tenant-owned tables**.

This is the default for Phase 1 because it keeps reporting, joins, admin support, and module development simple. Large institutions can later move selected modules to schema-per-tenant or standalone services without changing the public API contract.

## Tenant resolution

Tenant context is resolved in this order:

1. `X-Tenant` header, using tenant slug, for API clients and service calls.
2. Subdomain, for example `osh-markazi.restaurant-campus.uz`, after production DNS is ready.

Local development can run without a tenant while scaffolding. Staging and production must set `TENANCY_REQUIRE_TENANT=true` once all authenticated clients send tenant context.

## Data rules

Every tenant-owned table must include:

- `tenant_id` foreign key to `tenants.id`
- composite business uniques, for example `unique(tenant_id, employee_code)`
- indexes that start with `tenant_id` for high-volume filters
- model-level tenant scope using `App\Models\Concerns\BelongsToTenant`

Global reference tables can stay tenantless only when data is identical for every institution, for example permission names, countries, or static dictionaries.

## Migration path

| Scale         | Storage model                    | Notes                                      |
| ------------- | -------------------------------- | ------------------------------------------ |
| Phase 1       | Shared DB + `tenant_id`          | Fastest to build and operate               |
| Large tenant  | PostgreSQL schema per tenant     | Move only hot tenants or regulated tenants |
| Extreme scale | Service/database split by module | Use event contracts and outbox first       |

## Required checks before each module ships

- All tenant-owned models use `BelongsToTenant`.
- No API endpoint returns data without tenant context unless explicitly public.
- Imports, exports, jobs, notifications, and analytics events carry `tenant_id`.
- Tests include cross-tenant isolation checks for list, show, update, delete.
