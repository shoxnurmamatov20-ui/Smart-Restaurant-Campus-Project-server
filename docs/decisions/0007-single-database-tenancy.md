# ADR-0007: Single database tenancy for Phase 1

**Status:** accepted
**Date:** 2026-05-26
**Decision makers:** Project owner + architect

## Context

The platform must support multiple restaurant businesses, countries and languages from the start. A tenant is one business — a chain with four branches is a single tenant. The first 10 modules need strong tenant isolation, but the platform should still move quickly during Phase 1.

## Decision

Use one PostgreSQL database with `tenant_id` on tenant-owned tables for Phase 1. Resolve tenant context from `X-Tenant` header first, then subdomain. Keep a documented path to schema-per-tenant and module service extraction.

## Consequences

Positive:

- simple operations for early on-prem deployments
- easy cross-module reporting and KPI joins
- fewer moving parts than database-per-tenant
- clear tenant filter standard in models and migrations

Negative:

- application code must enforce tenant scope rigorously
- very large tenants may later need schema or database isolation
- all imports/jobs/events must carry tenant context

## Alternatives considered

| Option                         | Reason not chosen                                      |
| ------------------------------ | ------------------------------------------------------ |
| Database per tenant            | Too heavy for Phase 1 operations and migrations        |
| Schema per tenant from day one | Good future option, but slows early module development |
| No tenancy until later         | Violates project principle and creates rewrite risk    |
