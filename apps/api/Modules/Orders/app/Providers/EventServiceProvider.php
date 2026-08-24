<?php

declare(strict_types=1);

namespace Modules\Orders\Providers;

use Illuminate\Foundation\Support\Providers\EventServiceProvider as ServiceProvider;
use Illuminate\Support\Facades\Event;
use Modules\Orders\Listeners\TellTheGuest;

class EventServiceProvider extends ServiceProvider
{
    /**
     * The event handler mappings for the module.
     *
     * @var array<string, array<int, string>>
     */
    protected $listen = [];

    /**
     * Subscriptions, keyed by event name.
     *
     * By name and not by class even here, where the publisher is this same
     * module: the listener runs off the RELAY, against a `ReceivedEvent`
     * rebuilt from an outbox row, and that is what makes it at-least-once and
     * therefore deduplicable. Binding the class directly would run it inline
     * inside the transaction that moved the bill, where a slow SMS gateway
     * would hold a row lock on somebody's order.
     *
     * @var array<string, array<int, class-string>>
     */
    private const DOMAIN_EVENTS = [
        'orders.moved' => [TellTheGuest::class],
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
     * Indicates if events should be discovered.
     *
     * @var bool
     */
    protected static $shouldDiscoverEvents = true;

    /**
     * Configure the proper event listeners for email verification.
     */
    protected function configureEmailVerification(): void {}
}
