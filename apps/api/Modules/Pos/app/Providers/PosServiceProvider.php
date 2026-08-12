<?php

declare(strict_types=1);

namespace Modules\Pos\Providers;

use Modules\Pos\Http\Middleware\RequireTerminalSession;
use Nwidart\Modules\Support\ModuleServiceProvider;

class PosServiceProvider extends ModuleServiceProvider
{
    /**
     * The name of the module.
     */
    protected string $name = 'Pos';

    /**
     * The lowercase version of the module name.
     */
    protected string $nameLower = 'pos';

    /**
     * Provider classes to register.
     *
     * @var string[]
     */
    protected array $providers = [
        EventServiceProvider::class,
        RouteServiceProvider::class,
    ];

    public function boot(): void
    {
        parent::boot();

        // Every till write needs to know which terminal and which person, and
        // neither may come from the request body. See the middleware.
        $this->app['router']->aliasMiddleware('pos.session', RequireTerminalSession::class);
    }
}
