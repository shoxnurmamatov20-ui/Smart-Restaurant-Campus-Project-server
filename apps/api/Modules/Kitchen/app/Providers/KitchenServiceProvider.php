<?php

declare(strict_types=1);

namespace Modules\Kitchen\Providers;

use App\Support\Modules\ApiModuleServiceProvider;

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
}
