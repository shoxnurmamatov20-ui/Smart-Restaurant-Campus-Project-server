<?php

declare(strict_types=1);

namespace Modules\Crm\Providers;

use App\Support\Modules\ApiModuleServiceProvider;

class CrmServiceProvider extends ApiModuleServiceProvider
{
    /**
     * The name of the module.
     */
    protected string $name = 'Crm';

    /**
     * The lowercase version of the module name.
     */
    protected string $nameLower = 'crm';

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
