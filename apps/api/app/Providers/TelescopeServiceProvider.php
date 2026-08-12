<?php

declare(strict_types=1);

namespace App\Providers;

use App\Models\User;
use Illuminate\Support\Facades\Gate;
use Laravel\Telescope\IncomingEntry;
use Laravel\Telescope\Telescope;
use Laravel\Telescope\TelescopeApplicationServiceProvider;

class TelescopeServiceProvider extends TelescopeApplicationServiceProvider
{
    /**
     * The platform operator, as RolesAndPermissionsSeeder names them.
     *
     * Written down rather than inlined because HorizonServiceProvider gates on
     * the same role, and the two must not drift apart.
     */
    public const OPERATOR_ROLE = 'super-admin';

    /**
     * Register any application services.
     */
    public function register(): void
    {
        // Telescope::night();

        $this->hideSensitiveRequestDetails();

        $isLocal = $this->app->environment('local');

        Telescope::filter(function (IncomingEntry $entry) use ($isLocal) {
            return $isLocal ||
                   $entry->isReportableException() ||
                   $entry->isFailedRequest() ||
                   $entry->isFailedJob() ||
                   $entry->isScheduledTask() ||
                   $entry->hasMonitoredTag();
        });
    }

    /**
     * Prevent sensitive request details from being logged by Telescope.
     */
    protected function hideSensitiveRequestDetails(): void
    {
        if ($this->app->environment('local')) {
            return;
        }

        Telescope::hideRequestParameters(['_token']);

        Telescope::hideRequestHeaders([
            'cookie',
            'x-csrf-token',
            'x-xsrf-token',
        ]);
    }

    /**
     * Who may read Telescope outside local.
     *
     * Laravel generates this method with an empty array of email addresses,
     * and an empty array means `in_array()` is always false: in production the
     * dashboard becomes unopenable by anyone. Safe, and useless — the first
     * time an operator needs to see why a queue is backing up, they cannot.
     *
     * The platform already has the answer to "who supports every restaurant
     * and belongs to none": `super-admin`. Gating on the role rather than on a
     * hardcoded list also means adding an operator is `syncRoles`, not a deploy.
     *
     * Telescope records requests, queries and payloads across every tenant, so
     * this is the one gate where the restaurant roles — owner included — must
     * not pass. An owner is an admin of their own business, not of the
     * platform, and Telescope shows them everyone's.
     */
    protected function gate(): void
    {
        Gate::define('viewTelescope', function (User $user): bool {
            return $user->hasRole(self::OPERATOR_ROLE);
        });
    }
}
