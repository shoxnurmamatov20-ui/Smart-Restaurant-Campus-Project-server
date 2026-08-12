<?php

declare(strict_types=1);

namespace App\Providers;

use App\Models\User;
use Illuminate\Support\Facades\Gate;
use Laravel\Horizon\HorizonApplicationServiceProvider;

class HorizonServiceProvider extends HorizonApplicationServiceProvider
{
    /**
     * Bootstrap any application services.
     */
    public function boot(): void
    {
        parent::boot();

        // Horizon::routeSmsNotificationsTo('15556667777');
        // Horizon::routeMailNotificationsTo('example@example.com');
        // Horizon::routeSlackNotificationsTo('slack-webhook-url', '#channel');
    }

    /**
     * Who may open Horizon outside local.
     *
     * Generated with an empty list of emails, which reads as "nobody yet" and
     * behaves as "nobody, ever": `in_array($email, [])` is false for every
     * value, so in production the queue dashboard could not be opened at all.
     *
     * Gated on `super-admin` instead — the same role
     * TelescopeServiceProvider uses, and the constant lives there so the two
     * cannot drift. A queue holds job payloads from every tenant: bills,
     * customers, phone numbers. That is the platform operator's to see and
     * nobody else's, an owner included.
     *
     * `$user` is nullable because Horizon calls this for guests too. Laravel's
     * own wrapper adds `|| app()->environment('local')`, so a developer still
     * gets the dashboard without an account.
     */
    protected function gate(): void
    {
        Gate::define('viewHorizon', function (?User $user = null): bool {
            return $user?->hasRole(TelescopeServiceProvider::OPERATOR_ROLE) ?? false;
        });
    }
}
