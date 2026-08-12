<?php

declare(strict_types=1);

namespace Modules\Tables\Providers;

use Nwidart\Modules\Support\ModuleServiceProvider;

class TablesServiceProvider extends ModuleServiceProvider
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
}
