<?php

declare(strict_types=1);

namespace Modules\Staff\Providers;

use Nwidart\Modules\Support\ModuleServiceProvider;

class StaffServiceProvider extends ModuleServiceProvider
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
