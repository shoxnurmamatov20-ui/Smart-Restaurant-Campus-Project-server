<?php

declare(strict_types=1);

namespace Modules\Kitchen\Providers;

use App\Contracts\Kitchen\KitchenLoad;
use App\Contracts\Kitchen\TicketWriter;
use App\Contracts\Printing\PrintSpooler;
use App\Support\Modules\ApiModuleServiceProvider;
use Modules\Kitchen\Printing\EloquentPrintSpooler;
use Modules\Kitchen\Services\EloquentKitchenLoad;
use Modules\Kitchen\Services\EloquentTicketWriter;

class KitchenServiceProvider extends ApiModuleServiceProvider
{
    /**
     * The name of the module.
     */
    protected string $name = 'Kitchen';

    /**
     * The lowercase version of the module name.
     */
    protected string $nameLower = 'kitchen';

    /**
     * Provider classes to register.
     *
     * @var string[]
     */
    protected array $providers = [
        EventServiceProvider::class,
        RouteServiceProvider::class,
    ];

    /**
     * The kitchen's inbound contracts, and where the fallbacks stop refusing.
     *
     * `TicketWriter` is how Orders fires a bill at a pass without knowing what a
     * docket is. `PrintSpooler` is how the till gets a receipt and a cash drawer
     * without knowing what a printer is — the hardware registry and the spool
     * live in this module because a printer and a station know the same thing
     * (what is cooked where), and separating them would put a module boundary in
     * the middle of the routing. They move to a module of their own the day the
     * printer estate stops being organised around the kitchen.
     */
    public function register(): void
    {
        parent::register();

        $this->app->bind(TicketWriter::class, EloquentTicketWriter::class);
        $this->app->bind(KitchenLoad::class, EloquentKitchenLoad::class);
        $this->app->bind(PrintSpooler::class, EloquentPrintSpooler::class);
    }
}
