<?php

declare(strict_types=1);

namespace Modules\Analytics\Providers;

use App\Support\Modules\ApiModuleServiceProvider;

class AnalyticsServiceProvider extends ApiModuleServiceProvider
{
    /**
     * The name of the module.
     */
    protected string $name = 'Analytics';

    /**
     * The lowercase version of the module name.
     */
    protected string $nameLower = 'analytics';

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
