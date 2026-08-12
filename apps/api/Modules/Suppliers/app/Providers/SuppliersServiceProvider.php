<?php

declare(strict_types=1);

namespace Modules\Suppliers\Providers;

use Nwidart\Modules\Support\ModuleServiceProvider;

class SuppliersServiceProvider extends ModuleServiceProvider
{
    /**
     * The name of the module.
     */
    protected string $name = 'Suppliers';

    /**
     * The lowercase version of the module name.
     */
    protected string $nameLower = 'suppliers';

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
