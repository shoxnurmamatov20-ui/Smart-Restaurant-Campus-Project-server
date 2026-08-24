<?php

declare(strict_types=1);
use Modules\Crm\Database\Seeders\CrmCaseSeeder;
use Modules\Crm\Database\Seeders\CrmFeedbackSeeder;
use Modules\Crm\Database\Seeders\CrmMarketingSeeder;
use Modules\Crm\Database\Seeders\CrmPromoSeeder;

return [
    'name' => 'Crm',
    'alias' => 'crm',

    // Registry metadata — GET /api/v1/modules reads these.
    'icon' => 'heart-handshake',
    'group' => 'growth',
    'order' => 9,  // sidebar position, independent of module.json load priority
    'route' => 'v1/crm',
    'permission_prefix' => 'crm',

    /*
    |--------------------------------------------------------------------------
    | Module display names (uz / ru / en)
    |--------------------------------------------------------------------------
    */
    'labels' => [
        'uz' => 'Mijozlar va sodiqlik',
        'ru' => 'CRM и лояльность',
        'en' => 'CRM & Loyalty',
    ],

    /*
    |--------------------------------------------------------------------------
    | Feature flags
    |--------------------------------------------------------------------------
    | Per-tenant overrides live in the tenants.settings JSON column; these are
    | the platform-wide defaults.
    */
    'enabled' => env('MODULE_CRM_ENABLED', true),

    /*
    |--------------------------------------------------------------------------
    | Segmentation
    |--------------------------------------------------------------------------
    | The thresholds `crm:segment` classifies guests by, overnight. One place,
    | because the console prints the same words next to the same figures and two
    | copies of a threshold disagree the first time somebody tunes one.
    |
    | `corporate` is absent on purpose: it is a decision somebody makes about a
    | company account, and the nightly pass never writes it.
    */
    'segments' => [
        // Older than this since their last visit and they are slipping away.
        'at_risk_days' => (int) env('CRM_SEGMENT_AT_RISK_DAYS', 30),
        /*
         * A regular is defined by both halves and needs both.
         *
         * Visits alone would keep somebody who came forty times last year and
         * has not been seen since March; recency alone would promote a first-time
         * guest who ate yesterday. The screen's whole value is telling those two
         * apart.
         */
        'regular_visits' => (int) env('CRM_SEGMENT_REGULAR_VISITS', 10),
        // Fewer visits than this and nothing has been established either way.
        'occasional_below' => (int) env('CRM_SEGMENT_OCCASIONAL_BELOW', 10),
    ],

    /*
    |--------------------------------------------------------------------------
    | Campaigns
    |--------------------------------------------------------------------------
    */
    'campaigns' => [
        /*
         * Tiyin per SMS part, and the number the composer estimates with.
         *
         * A tariff rather than a constant: it is what an aggregator charges and
         * it changes with the contract. The console reads the same figure from
         * the API so the estimate on the screen and the estimate in the record
         * are one number.
         */
        'sms_part_tiyin' => (int) env('CRM_SMS_PART_TIYIN', 5500),

        /*
         * The window messages may go out in, in the venue's own clock.
         *
         * Not a preference. Uzbek advertising law restricts unsolicited
         * commercial messages to daytime hours, and the console prints the rule
         * under the composer — so a scheduler that ignored it would make the
         * screen a lie as well as breaking the rule.
         */
        'quiet_hours' => ['from' => 21, 'to' => 9],

        /*
         * How long after a campaign a settled bill still counts as its doing.
         *
         * Attribution has to end somewhere, and a fortnight is the honest
         * outside edge for "they came because of the message". Beyond it every
         * campaign would eventually claim every regular.
         */
        'attribution_days' => (int) env('CRM_CAMPAIGN_ATTRIBUTION_DAYS', 14),
    ],

    /*
    |--------------------------------------------------------------------------
    | Complaints
    |--------------------------------------------------------------------------
    */
    'cases' => [
        /*
         * Below this, whoever picks the complaint up may answer it themselves.
         *
         * 30 000 so'm, and `cases-data.ts` gives the arithmetic: a guest who
         * waits twenty minutes for a manager to approve a 24 000 so'm refund
         * tells a different story afterwards than one refunded in ninety
         * seconds, and the difference in what that story costs is far more than
         * 24 000 so'm.
         */
        'auto_refund_ceiling_tiyin' => (int) env('CRM_CASE_AUTO_REFUND_TIYIN', 3000000),

        // Above this the owner decides, on their phone, wherever they are.
        'owner_ceiling_tiyin' => (int) env('CRM_CASE_OWNER_TIYIN', 15000000),

        /*
         * How long a complaint may sit before it is late.
         *
         * Stamped onto the row when it opens rather than compared on read: a
         * restaurant that lengthens its service level must not silently make
         * every already-late case punctual.
         */
        'sla_hours' => (int) env('CRM_CASE_SLA_HOURS', 4),
    ],

    /*
     * What `demo:seed` may run for the demo tenant, and the tenant-scoped
     * tables those seeders fill. Declared here rather than in the command so
     * the core never names a module: the command reads every module's `demo`
     * key and knows nothing else about it.
     */
    'demo' => [
        'seeders' => [
            CrmPromoSeeder::class,
            CrmFeedbackSeeder::class,
            CrmCaseSeeder::class,
            CrmMarketingSeeder::class,
        ],
        'tables' => ['crm.promo_codes', 'crm.coupons', 'crm.feedbacks', 'crm.cases', 'crm.case_events', 'crm.campaigns', 'crm.promotions', 'crm.triggers'],
    ],
];
