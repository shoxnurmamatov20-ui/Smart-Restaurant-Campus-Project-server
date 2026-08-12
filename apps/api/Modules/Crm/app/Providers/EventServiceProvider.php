<?php

declare(strict_types=1);

namespace Modules\Crm\Providers;

use Illuminate\Foundation\Support\Providers\EventServiceProvider as ServiceProvider;
use Illuminate\Support\Facades\Event;
use Modules\Crm\Listeners\RecordGuestVisit;

class EventServiceProvider extends ServiceProvider
{
    /**
     * The event handler mappings for the module.
     *
     * @var array<string, array<int, string>>
     */
    protected $listen = [];

    /**
     * Indicates if events should be discovered.
     *
     * @var bool
     */
    protected static $shouldDiscoverEvents = true;

    /**
     * Cross-module subscriptions, keyed by event name.
     *
     * Names, not classes: `Modules\Orders\Events\OrderPaid` is never imported
     * here. CRM knows that bills get settled somewhere in the building; it does
     * not know, and must not know, which module settles them.
     *
     * @var array<string, array<int, class-string>>
     */
    private const DOMAIN_EVENTS = [
        'orders.paid' => [RecordGuestVisit::class],
    ];

    public function boot(): void
    {
        parent::boot();

        foreach (self::DOMAIN_EVENTS as $name => $listeners) {
            foreach ($listeners as $listener) {
                Event::listen($name, $listener);
            }
        }
    }

    /**
     * Configure the proper event listeners for email verification.
     */
    protected function configureEmailVerification(): void {}
}
