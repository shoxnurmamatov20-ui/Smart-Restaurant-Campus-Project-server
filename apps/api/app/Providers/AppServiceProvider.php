<?php

declare(strict_types=1);

namespace App\Providers;

use App\Contracts\Finance\TillLedger;
use App\Contracts\Finance\UnavailableTillLedger;
use App\Contracts\Menu\MenuCatalog;
use App\Contracts\Menu\UnavailableMenuCatalog;
use App\Contracts\Orders\BillRegistry;
use App\Contracts\Orders\UnavailableBillRegistry;
use App\Support\Events\EventBus;
use App\Support\Modules\ModuleRegistry;
use App\Support\Tenancy\BranchContext;
use App\Support\Tenancy\TenantContext;
use Illuminate\Cache\RateLimiting\Limit;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\ServiceProvider;

class AppServiceProvider extends ServiceProvider
{
    /**
     * Register any application services.
     */
    public function register(): void
    {
        // All per-request state: the tenant and its branch obviously, and the
        // module registry because it memoises config that a long-running worker
        // (Octane) must not carry between restaurants. `scoped` resets them.
        //
        // `scoped` and not a plain binding: an unregistered class is rebuilt on
        // every app() call, so whatever the middleware resolved would be thrown
        // away and the model traits would read an empty context — rows land
        // unstamped, and an unstamped branch_id means "every branch".
        $this->app->scoped(TenantContext::class);
        $this->app->scoped(BranchContext::class);
        $this->app->scoped(ModuleRegistry::class);
        $this->app->scoped(EventBus::class);

        // Fallbacks for the cross-module read contracts. `bindIf` so a module
        // that is installed always wins; this only answers when it is not, which
        // is what lets the rest of the platform boot without it.
        $this->app->bindIf(MenuCatalog::class, UnavailableMenuCatalog::class);

        // The two write contracts the till depends on. Their fallbacks refuse
        // rather than no-op: a POS quietly "selling" into a module that is not
        // running would take cash off guests with no record of it.
        $this->app->bindIf(BillRegistry::class, UnavailableBillRegistry::class);
        $this->app->bindIf(TillLedger::class, UnavailableTillLedger::class);
    }

    /**
     * Bootstrap any application services.
     */
    public function boot(): void
    {
        $this->configureRateLimiting();
    }

    /**
     * bootstrap/app.php calls `throttleApi()`, which resolves a limiter named
     * "api". Without this registration every API request dies with
     * "Rate limiter [api] is not defined" — so this is not optional.
     *
     * Limits are sized for a restaurant, not a blog: a POS terminal or a
     * kitchen display polls far harder than a human, and it is authenticated,
     * so signed-in traffic gets a much wider lane than anonymous traffic.
     */
    private function configureRateLimiting(): void
    {
        RateLimiter::for('api', function (Request $request): Limit {
            return $request->user()
                ? Limit::perMinute(300)->by('user:'.$request->user()->id)
                : Limit::perMinute(60)->by('ip:'.$request->ip());
        });

        // Guest-facing QR menu / feedback endpoints: generous enough for a full
        // table scanning at once, tight enough to be worthless for scraping.
        RateLimiter::for('public', function (Request $request): Limit {
            return Limit::perMinute(120)->by('ip:'.$request->ip());
        });

        // Login and password endpoints — brute-force protection.
        RateLimiter::for('auth', function (Request $request): Limit {
            return Limit::perMinute(5)
                ->by(mb_strtolower((string) $request->input('email')).'|'.$request->ip());
        });
    }
}
