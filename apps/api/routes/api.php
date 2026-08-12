<?php

declare(strict_types=1);

use App\Http\Controllers\AdminAuthController;
use App\Http\Controllers\AuditController;
use App\Http\Controllers\AuthController;
use App\Http\Controllers\BranchController;
use App\Http\Controllers\HealthController;
use App\Http\Controllers\ModuleController;
use Illuminate\Support\Facades\Route;
use Spatie\Permission\Middleware\PermissionMiddleware;

/*
|--------------------------------------------------------------------------
| API Routes — Smart Restaurant Campus
|--------------------------------------------------------------------------
| All API routes are versioned under /api/v1/...
| Module routes (Menu, Orders, Kitchen, ...) auto-load from
| Modules/{Name}/routes/api.php via nwidart/laravel-modules.
|
| Every authenticated route carries the 'tenant' middleware, which both
| resolves the restaurant and pins a user to their own — see
| App\Http\Middleware\ResolveTenant.
*/

/*
 * Health. Three endpoints because an orchestrator asks three different
 * questions — see App\Http\Controllers\HealthController. Kubernetes probes
 * point at /live and /ready; /health is for humans and dashboards.
 */
Route::get('/health', [HealthController::class, 'show'])->name('health');
Route::get('/health/live', [HealthController::class, 'live'])->name('health.live');
Route::get('/health/ready', [HealthController::class, 'ready'])->name('health.ready');

Route::prefix('v1')->name('api.v1.')->group(function (): void {

    // ---- The front door (no auth) ----
    // Throttled hard: these are the endpoints worth brute-forcing.
    Route::middleware('throttle:auth')->group(function (): void {
        Route::post('auth/register', [AuthController::class, 'register'])->name('auth.register');
        Route::post('auth/login', [AuthController::class, 'login'])->name('auth.login');

        /*
         * The platform operator's door — handoff §3.12, third tab.
         *
         * Its own endpoint rather than a flag on auth/login: what passes here
         * is email, password *and* a six-digit code, the account belongs to no
         * restaurant, and the token it issues expires in thirty minutes. Four
         * differences is a different door.
         *
         * Unauthenticated by necessity — this is how one becomes
         * authenticated — and under the same hard throttle as the others.
         */
        Route::post('admin/login', AdminAuthController::class)->name('admin.login');
    });

    // ---- Signed in ----
    Route::middleware(['auth:sanctum', 'tenant'])->group(function (): void {
        Route::post('auth/logout', [AuthController::class, 'logout'])->name('auth.logout');
        Route::get('auth/me', [AuthController::class, 'me'])->name('auth.me');

        // What restaurant am I in and what may I do? Clients read this on boot
        // instead of inferring capabilities from the token.
        Route::get('auth/context', [AuthController::class, 'context'])->name('auth.context');

        /*
         * ---- Branches ----
         * The venues of this restaurant. Listing is open to everyone signed
         * in, because the top-bar branch switcher needs it and a waiter who
         * cannot name their own workplace is a broken screen; the controller
         * narrows the list to a pinned user's own venue. Everything that
         * changes the estate needs `branches.manage`.
         */
        Route::get('branches', [BranchController::class, 'index'])->name('branches.index');
        Route::get('branches/{branch}', [BranchController::class, 'show'])->name('branches.show');
        Route::middleware(PermissionMiddleware::using('branches.manage'))->group(function (): void {
            Route::post('branches', [BranchController::class, 'store'])->name('branches.store');
            Route::patch('branches/{branch}', [BranchController::class, 'update'])->name('branches.update');
            Route::delete('branches/{branch}', [BranchController::class, 'destroy'])->name('branches.destroy');
        });

        // ---- Capability manifest ----
        // Every client builds its navigation from this rather than shipping a
        // hard-coded module list that can drift from the backend.
        Route::get('modules', [ModuleController::class, 'index'])->name('modules.index');
        Route::patch('modules/{key}', [ModuleController::class, 'update'])
            ->middleware(PermissionMiddleware::using('system.modules'))
            ->name('modules.update');

        // ---- Audit trail ----
        // Read-only: the log is evidence, and an endpoint that could edit it
        // would make it worthless. `facets` is declared before `{audit}` so the
        // word is not swallowed as an id.
        Route::middleware(PermissionMiddleware::using('audit.view'))
            ->name('audit.')
            ->group(function (): void {
                Route::get('audit', [AuditController::class, 'index'])->name('index');
                Route::get('audit/facets', [AuditController::class, 'facets'])->name('facets');
                Route::get('audit/{audit}', [AuditController::class, 'show'])->name('show');
            });

        // ---- Platform (super admin) endpoints ----
        Route::prefix('admin')
            ->middleware(['role:super-admin'])
            ->name('admin.')
            ->group(function (): void {
                // Platform-level admin routes mount here
            });

        // ---- Module routes auto-mount via nwidart/laravel-modules ----
    });
});
