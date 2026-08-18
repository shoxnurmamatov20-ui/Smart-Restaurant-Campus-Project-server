<?php

declare(strict_types=1);

namespace Modules\Staff\Providers;

use App\Support\Modules\ApiModuleServiceProvider;

class StaffServiceProvider extends ApiModuleServiceProvider
{
    /**
     * The name of the module.
     */
    protected string $name = 'Staff';

    /**
     * The lowercase version of the module name.
     */
    protected string $nameLower = 'staff';

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
