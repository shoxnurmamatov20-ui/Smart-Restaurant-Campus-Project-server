<?php

declare(strict_types=1);

return [
    /*
    |--------------------------------------------------------------------------
    | Smart Restaurant Campus tenancy mode
    |--------------------------------------------------------------------------
    |
    | A tenant is one restaurant business — "Osh Markazi" with four branches is
    | a single tenant. Phase 1 uses one shared PostgreSQL database with
    | tenant_id columns, which keeps cross-branch reporting a plain SQL join
    | while leaving a clear path to schema-per-tenant for large chains.
    |
    */

    'mode' => env('TENANCY_MODE', 'single_database'),

    /*
    |--------------------------------------------------------------------------
    | Tenant resolution
    |--------------------------------------------------------------------------
    |
    | Supported inputs:
    | - X-Tenant header: canonical for the API, POS terminals, Telegram bots
    |   and service-to-service calls.
    | - subdomain: production routing, e.g. osh-markazi.restaurant-campus.uz
    |
    */

    'header' => env('TENANCY_HEADER', 'X-Tenant'),
    'central_domains' => array_filter(explode(',', (string) env(
        'TENANCY_CENTRAL_DOMAINS',
        'localhost,127.0.0.1,restaurant-campus.uz'
    ))),
    'default_slug' => env('TENANCY_DEFAULT_SLUG', 'demo-restaurant'),

    /*
    |--------------------------------------------------------------------------
    | Branch resolution
    |--------------------------------------------------------------------------
    |
    | A branch is one venue of one restaurant. The header carries its slug and
    | is resolved inside the already-known tenant, so a slug from another
    | restaurant never matches.
    |
    | There is deliberately no `require_branch`. Omitting the header means
    | "every branch of this restaurant", which is what the owner's dashboard
    | and every group-level report ask for. Tenancy has no such reading — an
    | absent tenant is a hole, an absent branch is a roll-up.
    |
    */

    'branch_header' => env('TENANCY_BRANCH_HEADER', 'X-Branch'),

    /*
    |--------------------------------------------------------------------------
    | Enforcement
    |--------------------------------------------------------------------------
    |
    | Keep false for local scaffolding. In staging and production this MUST be
    | true: without it a request that forgets its tenant header silently reads
    | across every restaurant on the platform.
    |
    */

    'require_tenant' => (bool) env('TENANCY_REQUIRE_TENANT', false),
];
