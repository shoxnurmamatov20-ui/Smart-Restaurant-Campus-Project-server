<?php

declare(strict_types=1);

return [
    'name' => 'Kitchen',
    'alias' => 'kitchen',

    // Registry metadata — GET /api/v1/modules reads these.
    'icon' => 'chef-hat',
    'group' => 'operations',
    'order' => 3,  // sidebar position, independent of module.json load priority
    'route' => 'v1/kitchen',
    'permission_prefix' => 'kitchen',

    /*
    |--------------------------------------------------------------------------
    | Module display names (uz / ru / en)
    |--------------------------------------------------------------------------
    */
    'labels' => [
        'uz' => 'Oshxona (KDS)',
        'ru' => 'Кухня (KDS)',
        'en' => 'Kitchen Display System',
    ],

    /*
    |--------------------------------------------------------------------------
    | Feature flags
    |--------------------------------------------------------------------------
    | Per-tenant overrides live in the tenants.settings JSON column; these are
    | the platform-wide defaults.
    */
    'enabled' => env('MODULE_KITCHEN_ENABLED', true),

    /*
    |--------------------------------------------------------------------------
    | Printing
    |--------------------------------------------------------------------------
    | The spool's timings. All four are about one question — how long a piece of
    | paper is allowed to be late before somebody is told — so they live
    | together rather than being scattered as constants.
    */
    'printing' => [

        /*
         * How long a printer may go quiet before the status bar calls it
         * offline.
         *
         * The agent heartbeats every 15 seconds, so 90 tolerates five missed
         * beats. Tighter than that and a wifi hiccup during service paints the
         * bar red for something that fixed itself; looser and a printer
         * unplugged at the start of a shift stays green through the rush.
         */
        'heartbeat_seconds' => env('KITCHEN_PRINTER_HEARTBEAT_SECONDS', 90),

        /*
         * Attempts before a job is given up on — roughly ten minutes of
         * retrying under the backoff below.
         *
         * It gives up rather than retrying forever because a document that has
         * been refused eight times is not going to print: the paper is out, the
         * head is jammed, the address is wrong. A queue that never gives up
         * hides that behind a number that only goes up.
         */
        'max_attempts' => env('KITCHEN_PRINT_MAX_ATTEMPTS', 8),

        /*
         * Seconds before each retry, then the last value repeats.
         *
         * Fast at the start because the common failure is a roll of paper being
         * changed, which takes twenty seconds and should not cost the kitchen a
         * five-minute wait afterwards.
         */
        'backoff' => [5, 10, 30, 60, 120, 300],

        /*
         * How long an agent may hold a claimed job before another agent may take
         * it.
         *
         * This is what makes an agent that dies mid-print survivable. The cost
         * of getting it wrong in one direction is a docket printed twice; in the
         * other, a docket never printed at all. Two pieces of paper is the
         * cheaper mistake, so the window is deliberately short.
         */
        'claim_seconds' => env('KITCHEN_PRINT_CLAIM_SECONDS', 60),

        /*
         * How many jobs an agent may take in one poll. Enough to drain a busy
         * pass in a couple of round trips, small enough that a crashed agent
         * strands only a few.
         */
        'claim_limit' => env('KITCHEN_PRINT_CLAIM_LIMIT', 10),
    ],
];
