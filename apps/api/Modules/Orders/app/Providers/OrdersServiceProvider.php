<?php

declare(strict_types=1);

namespace Modules\Orders\Providers;

use App\Contracts\Orders\BillRegistry;
use Modules\Orders\Services\EloquentBillRegistry;
use Nwidart\Modules\Support\ModuleServiceProvider;

class OrdersServiceProvider extends ModuleServiceProvider
{
    /**
     * The name of the module.
     */
    protected string $name = 'Orders';

    /**
     * The lowercase version of the module name.
     */
    protected string $nameLower = 'orders';

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
     * Orders answers the platform's write contract for bills.
     *
     * This is how the POS opens, splits and settles a bill without importing
     * anything from this module. The core binds a refusing implementation as a
     * fallback, so a platform without Orders fails loudly rather than taking
     * money for orders nobody recorded.
     */
    public function register(): void
    {
        parent::register();

        $this->app->bind(BillRegistry::class, EloquentBillRegistry::class);
    }
}
