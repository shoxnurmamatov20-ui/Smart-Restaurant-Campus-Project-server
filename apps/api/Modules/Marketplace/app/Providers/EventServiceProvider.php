<?php

declare(strict_types=1);

namespace Modules\Marketplace\Providers;

use Illuminate\Foundation\Support\Providers\EventServiceProvider as ServiceProvider;

/**
 * Marketplace subscribes to no domain event, and that is worth writing down.
 *
 * This is the file a reader opens expecting `menu.dish_stopped` — a kitchen
 * running out of plov ought to grey the dish out in the shop window — so the
 * absence needs a reason rather than a `// TODO`.
 *
 * The window keeps no copy to invalidate. `StoreCatalogue` asks
 * `MenuCatalog::board()` on every read, so a dish 86'd thirty seconds ago is
 * already crossed out on the next page load. A cached copy kept in step by
 * messages would be a second source of truth about the most time-sensitive
 * fact in a restaurant, and its failure mode is a guest ordering something
 * nobody can cook because one message went missing.
 *
 * When a subscription is eventually needed — a courier service publishing
 * `delivery.assigned`, say — it is registered here by NAME rather than by
 * class, because this module must never import another module's event and the
 * string is the wire contract:
 *
 *     Event::listen('delivery.assigned', AttachCourier::class);
 *
 * `Modules\Crm\Providers\EventServiceProvider` is the live example, and
 * docs/architecture/events-and-analytics.md is the rule.
 */
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
     * Configure the proper event listeners for email verification.
     */
    protected function configureEmailVerification(): void {}
}
