<?php

declare(strict_types=1);
use Modules\Finance\Database\Seeders\DemoTakingsSeeder;
use Modules\Finance\Database\Seeders\FinanceLedgerSeeder;

return [
    'name' => 'Finance',
    'alias' => 'finance',

    // Registry metadata — GET /api/v1/modules reads these.
    'icon' => 'wallet',
    'group' => 'back-office',
    'order' => 8,  // sidebar position, independent of module.json load priority
    'route' => 'v1/finance',
    'permission_prefix' => 'finance',

    /*
    |--------------------------------------------------------------------------
    | Module display names (uz / ru / en)
    |--------------------------------------------------------------------------
    */
    'labels' => [
        'uz' => 'Moliya va kassa',
        'ru' => 'Финансы и касса',
        'en' => 'Finance & POS Payments',
    ],

    /*
    |--------------------------------------------------------------------------
    | Feature flags
    |--------------------------------------------------------------------------
    | Per-tenant overrides live in the tenants.settings JSON column; these are
    | the platform-wide defaults.
    */
    'enabled' => env('MODULE_FINANCE_ENABLED', true),

    /*
    |--------------------------------------------------------------------------
    | Counting the drawer
    |--------------------------------------------------------------------------
    | The notes a cashier can hold, in SO'M — not tiyin. This file is read by
    | people, and a ladder written in tiyin is eight chances to be wrong by a
    | factor of a hundred. App\Support\Finance\CashRounding makes the same
    | choice for the same reason.
    |
    | Uzbekistan's eight notes in circulation. No coin row: coins exist on paper
    | and no restaurant has seen one in years, and a row nobody fills is a row
    | somebody eventually fills wrongly.
    |
    | The rounding step must stay a multiple of the smallest note here, or a
    | rounded bill is a figure the drawer cannot pay. DayCloseLadderTest asserts
    | it from both sides.
    */
    'cash' => [
        'denominations_som' => [200_000, 100_000, 50_000, 20_000, 10_000, 5_000, 2_000, 1_000],
    ],

    /*
    |--------------------------------------------------------------------------
    | What a difference costs at closing
    |--------------------------------------------------------------------------
    | In SO'M, and read as absolute values — a surplus is as much a red flag as
    | a shortfall, because the usual cause of one is a sale that was never rung
    | up. A ladder rather than a single limit, because the three cases are
    | genuinely different:
    |
    |   under `reason_som`     the drawer still has to explain itself, and that
    |                          is the whole intervention. Refusing to close a
    |                          till over a hundred so'm would lock the shift and
    |                          teach everyone to type a round number instead.
    |
    |   at `approval_som`      a manager has to authorise it. The cashier can no
    |                          longer both cause and clear the gap.
    |
    |   at `owner_som`         the owner hears about it the same evening rather
    |                          than at the end of the month, which is the
    |                          difference between one bad night and a habit.
    |
    | Per-tenant overrides ride in tenants.settings under
    | `variance_thresholds_som`, the same shape as `acquirer_fees_bps`.
    */
    /*
    |--------------------------------------------------------------------------
    | Fiskallashtirish (P11)
    |--------------------------------------------------------------------------
    | A fiscal receipt is a legal requirement and a dead fiscal module must never
    | block a sale — so everything here is about deferring, not about refusing.
    |
    | `window_hours` is what that deferral costs. A declaration has to reach the
    | authority inside it; one that misses it stops being a queue item and
    | becomes a liability, which is why expiring raises its own event.
    |
    | `driver` selects an implementation of Modules\Finance\Fiscal\FiscalDriver.
    | `demo` manufactures fiscal signs locally and REFUSES TO RUN IN PRODUCTION —
    | a fake sign is worse than no receipt, because the restaurant believes it is
    | compliant and the guest believes they have proof.
    |
    | `module_no` is the fiscal module's number, at least eight digits. The
    | connection probe checks both it and whether anything answers, because a
    | configured number with a dead endpoint and an answering endpoint with no
    | number are different faults needing opposite responses.
    */
    'fiscal' => [
        'enabled' => env('FINANCE_FISCAL_ENABLED', false),
        'driver' => env('FISCAL_DRIVER', 'none'),
        'module_no' => env('FISCAL_MODULE_NO'),
        'window_hours' => env('FISCAL_WINDOW_HOURS', 24),

        /*
        |----------------------------------------------------------------------
        | The real operator — Modules\Finance\Fiscal\HttpOfdDriver
        |----------------------------------------------------------------------
        | Selected by FISCAL_DRIVER=soliq (or =multibank; both build the same
        | class with a different name on the row, because a receipt has to say
        | which operator filed it).
        |
        | One class rather than one per operator, because what actually differs
        | between Uzbekistan's OFDs is two paths and four field names — and both
        | of those are here. A venue whose integration document names
        | `fiskalBelgi` instead of `fiscal_sign` connects by editing an
        | environment file, not by writing a driver.
        |
        | Nothing here is guessed in a way that can hurt: with no `url` or no
        | `token` the driver reports itself unavailable, the receipts queue, and
        | `GET /api/v1/finance/fiscal/probe` says which of the two is missing.
        | That is exactly the state a restaurant is in between signing with an
        | OFD and being given its credentials.
        */
        'ofd' => [
            'url' => env('FISCAL_OFD_URL', 'https://ofd.soliq.uz/api/v1'),
            'token' => env('FISCAL_OFD_TOKEN'),
            'register_path' => env('FISCAL_OFD_REGISTER_PATH', '/receipts'),
            'status_path' => env('FISCAL_OFD_STATUS_PATH', '/status'),

            // The operator's own names for what comes back. Defaults are the
            // shape the demo driver produces, so a misconfigured field name
            // shows up as "no fiscal sign in the answer" rather than as a
            // receipt carrying an empty one.
            'fields' => [
                'fiscal_sign' => env('FISCAL_OFD_FIELD_SIGN', 'fiscal_sign'),
                'receipt_seq' => env('FISCAL_OFD_FIELD_SEQ', 'receipt_seq'),
                'qr_url' => env('FISCAL_OFD_FIELD_QR', 'qr_url'),
                'error_code' => env('FISCAL_OFD_FIELD_ERROR_CODE', 'error_code'),
                'error_message' => env('FISCAL_OFD_FIELD_ERROR_MESSAGE', 'error_message'),
            ],
        ],
    ],

    'variance' => [
        // Stored in TIYIN with the multiplication left visible, exactly as
        // App\Support\Finance\CashRounding writes its step. This conversion is
        // the most dangerous one in the project: a factor of a hundred either way
        // is silent — too low and every difference needs a manager, too high and
        // none of them ever does — and both stay quiet for a month.
        'reason_tiyin' => (int) env('FINANCE_VARIANCE_REASON_SOM', 0) * 100,
        'approval_tiyin' => (int) env('FINANCE_VARIANCE_APPROVAL_SOM', 20_000) * 100,
        'owner_tiyin' => (int) env('FINANCE_VARIANCE_OWNER_SOM', 50_000) * 100,
    ],

    /*
    |--------------------------------------------------------------------------
    | Demo data
    |--------------------------------------------------------------------------
    |
    | What `demo:seed` runs for the demo tenant, and the tables it first clears
    | of tenantless rows — a `db:seed --class` run without a tenant context
    | writes `tenant_id IS NULL` rows that RLS hides from everyone.
    |
    */

    'demo' => [
        'seeders' => [
            FinanceLedgerSeeder::class,
            DemoTakingsSeeder::class,
        ],
        'tables' => ['finance.accounting_periods', 'finance.cash_accounts', 'finance.expense_categories', 'finance.fixed_assets', 'finance.payment_methods', 'finance.cash_shifts', 'finance.payments'],
    ],
];
