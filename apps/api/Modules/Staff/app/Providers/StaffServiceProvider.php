<?php

declare(strict_types=1);

namespace Modules\Staff\Providers;

use App\Contracts\Staff\Roster;
use App\Support\Modules\ApiModuleServiceProvider;
use Modules\Staff\Services\EloquentRoster;

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

    /**
     * Attendance's one cross-module read — how many people are in the
     * building. Overrides the zero-answering fallback once Staff is installed.
     */
    public function register(): void
    {
        parent::register();

        $this->app->bind(Roster::class, EloquentRoster::class);
    }
}
