<?php

declare(strict_types=1);

namespace Modules\Board\Providers;

use Illuminate\Foundation\Support\Providers\EventServiceProvider as ServiceProvider;

class EventServiceProvider extends ServiceProvider
{
    /**
     * @var array<string, array<int, string>>
     */
    protected $listen = [];

    /**
     * @var bool
     */
    protected static $shouldDiscoverEvents = true;

    /**
     * This module subscribes to nothing, and that is the design.
     *
     * The board is downstream of everything and upstream of nobody: it READS
     * the menu and the stop list through `App\Contracts\Menu\*` at render
     * time, so there is no event it would have to hear to stay correct. A
     * listener for `menu.price_changed` would be a cache this module
     * deliberately does not keep.
     *
     * When one is needed it goes here, subscribed BY NAME — never by importing
     * another module's event class:
     *
     *     Event::listen('orders.paid', ReactToPaidOrder::class);
     */
    public function boot(): void
    {
        parent::boot();
    }

    protected function configureEmailVerification(): void {}
}
