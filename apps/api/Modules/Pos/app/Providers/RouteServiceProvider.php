<?php

declare(strict_types=1);

namespace Modules\Pos\Providers;

use Illuminate\Foundation\Support\Providers\RouteServiceProvider as ServiceProvider;
use Illuminate\Support\Facades\Route;

class RouteServiceProvider extends ServiceProvider
{
    protected string $name = 'Pos';

    public function boot(): void
    {
        parent::boot();
    }

    /**
     * Define the routes for the module.
     */
    public function map(): void
    {
        $this->mapApiRoutes();
        $this->mapWebRoutes();
    }

    /**
     * Web routes — session state, CSRF protection, etc.
     */
    protected function mapWebRoutes(): void
    {
        Route::middleware('web')->group(module_path($this->name, '/routes/web.php'));
    }

    /**
     * API routes — stateless, tenant-scoped.
     */
    protected function mapApiRoutes(): void
    {
        // The route file declares the full path and name (v1/pos, api.v1.pos.),
        // so this must add ONLY the /api prefix.
        Route::middleware('api')->prefix('api')->group(module_path($this->name, '/routes/api.php'));
    }
}
