<?php

declare(strict_types=1);

namespace Modules\Menu\Providers;

use App\Contracts\Menu\MenuCatalog;
use Modules\Menu\Services\EloquentMenuCatalog;
use Nwidart\Modules\Support\ModuleServiceProvider;

class MenuServiceProvider extends ModuleServiceProvider
{
    /**
     * The name of the module.
     */
    protected string $name = 'Menu';

    /**
     * The lowercase version of the module name.
     */
    protected string $nameLower = 'menu';

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
     * Menu answers the platform's read contract for dishes.
     *
     * This is how Orders and the Telegram bots reach the menu without importing
     * anything from this module. The core binds a null implementation as a
     * fallback, so nothing breaks when Menu is absent — it just reports that
     * there are no dishes.
     */
    public function register(): void
    {
        parent::register();

        $this->app->bind(MenuCatalog::class, EloquentMenuCatalog::class);
    }
}
