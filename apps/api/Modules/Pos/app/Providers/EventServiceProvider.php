<?php

declare(strict_types=1);

namespace Modules\Pos\Providers;

use Illuminate\Foundation\Support\Providers\EventServiceProvider as ServiceProvider;
use Illuminate\Support\Facades\Event;
use Modules\Pos\Listeners\PageTheManager;

class EventServiceProvider extends ServiceProvider
{
    /**
     * The event handler mappings for the module.
     *
     * @var array<string, array<int, string>>
     */
    protected $listen = [];

    /**
     * Domain events this module subscribes to, by bus name. Registered in
     * `boot()` rather than through `$listen`, which maps class names — the
     * bus delivers by string name so that modules never import each other's
     * event classes.
     */
    private const DOMAIN_EVENTS = [
        'pos.approval_requested' => [PageTheManager::class],
    ];

    /**
     * Indicates if events should be discovered.
     *
     * @var bool
     */
    protected static $shouldDiscoverEvents = true;

    /**
     * Configure the proper event listeners for email verification.
     */
    public function boot(): void
    {
        parent::boot();

        foreach (self::DOMAIN_EVENTS as $name => $listeners) {
            foreach ($listeners as $listener) {
                Event::listen($name, $listener);
            }
        }
    }

    protected function configureEmailVerification(): void {}
}
