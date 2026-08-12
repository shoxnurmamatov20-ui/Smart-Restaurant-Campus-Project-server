<?php

declare(strict_types=1);
use App\Models\Activity;

return [

    /*
    |--------------------------------------------------------------------------
    | Recording
    |--------------------------------------------------------------------------
    | Left on in every environment including tests: an audit trail that only
    | exists in production is one nobody ever verifies.
    */

    'enabled' => env('ACTIVITY_LOGGER_ENABLED', true),

    /*
    |--------------------------------------------------------------------------
    | Retention
    |--------------------------------------------------------------------------
    | Two years. Uzbek bookkeeping expects records to be producible well past
    | the end of a financial year, and `activitylog:clean` only removes rows
    | older than this when it is actually scheduled.
    */

    'delete_records_older_than_days' => 730,

    'default_log_name' => 'default',

    'default_auth_driver' => null,

    /*
     * A dish that was deleted is exactly the one an owner asks about, so the
     * subject must still resolve after a soft delete.
     */
    'subject_returns_soft_deleted_models' => true,

    /*
    |--------------------------------------------------------------------------
    | Model
    |--------------------------------------------------------------------------
    | Ours, not Spatie's: it carries `tenant_id` so one restaurant can never
    | read another's history. Every module writes through this without knowing.
    */

    'activity_model' => Activity::class,

    'table_name' => env('ACTIVITY_LOGGER_TABLE_NAME', 'activity_log'),

    'database_connection' => env('ACTIVITY_LOGGER_DB_CONNECTION'),
];
