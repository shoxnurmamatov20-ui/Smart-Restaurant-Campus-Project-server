<?php

declare(strict_types=1);

namespace Modules\Tables\Providers;

use App\Contracts\Tables\FloorBoard;
use App\Support\Modules\ApiModuleServiceProvider;
use Modules\Tables\Services\EloquentFloorBoard;

class TablesServiceProvider extends ApiModuleServiceProvider
{
    /**
     * The name of the module.
     */
    protected string $name = 'Tables';

    /**
     * The lowercase version of the module name.
     */
    protected string $nameLower = 'tables';

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
     * The floor's one cross-module read. `bind` overrides the Unavailable
     * fallback in AppServiceProvider the moment this module is installed —
     * same shape as Menu's catalogue.
     */
    public function register(): void
    {
        parent::register();

        $this->app->bind(FloorBoard::class, EloquentFloorBoard::class);
    }
}
