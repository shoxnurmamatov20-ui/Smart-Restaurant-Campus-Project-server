<?php

declare(strict_types=1);

use Illuminate\Support\Facades\Route;
use Modules\Analytics\Http\Controllers\AnalyticsController;
use Modules\Analytics\Http\Controllers\ReportScheduleController;
use Spatie\Permission\Middleware\PermissionMiddleware;

/*
|--------------------------------------------------------------------------
| Analytics module API routes
|--------------------------------------------------------------------------
| Mounted at /api/v1/analytics/* by RouteServiceProvider.
|
| Read-only by design: this module answers questions, it never changes a
| number. Everything sits on 'analytics.view'.
*/

Route::middleware(['auth:sanctum', 'tenant'])
    ->prefix('v1/analytics')
    ->name('api.v1.analytics.')
    ->group(function (): void {
        Route::get('/', [AnalyticsController::class, 'index'])->name('info');

        Route::middleware(PermissionMiddleware::using('analytics.view'))->group(function (): void {
            Route::get('dashboard', [AnalyticsController::class, 'dashboard'])->name('dashboard');
            Route::get('sales', [AnalyticsController::class, 'sales'])->name('sales');
            Route::get('abc', [AnalyticsController::class, 'abc'])->name('abc');
            Route::get('food-cost', [AnalyticsController::class, 'foodCost'])->name('food-cost');
            Route::get('channels', [AnalyticsController::class, 'channels'])->name('channels');
            Route::get('peak-hours', [AnalyticsController::class, 'peakHours'])->name('peak-hours');

            /*
            |------------------------------------------------------------------
            | The console's own screens
            |------------------------------------------------------------------
            | `summary` feeds the analytics page and the KPI row above it;
            | `menu-engineering` the four-quadrant table; `control` the loss
            | prevention screen; `reports/{kind}` the five viewers.
            |
            | All on `analytics.view`, like everything else in this module, and
            | that is a decision rather than laziness: the same figures are what
            | an owner, a manager and an accountant each read, and a second
            | permission would mean deciding that one of the three may not see
            | last night's revenue. Who reaches which SCREEN is settled by the
            | route guard in the console and by the role's permission set.
            */
            Route::get('summary', [AnalyticsController::class, 'summary'])->name('summary');

            /*
             * Every venue side by side — the console's Branches screen.
             *
             * `v1/analytics/branches` rather than `v1/branches/performance`,
             * which is the URL `branches-data.ts` guessed at. The register at
             * `v1/branches` is core and is guarded by `branches.manage` for
             * anything beyond the listing; this is a report about trading and
             * belongs on `analytics.view` with the rest of them. Hanging it off
             * the register would have meant one path answering to two
             * permissions depending on the segment after it.
             */
            Route::get('branches', [AnalyticsController::class, 'branches'])->name('branches');

            /*
             * The one report keyed by a calendar month rather than by
             * `?period=`. `analytics.view` like everything else here — the same
             * figures an owner, a manager and an accountant each read — and the
             * printable sheet at `?d=profit-loss&month=` is drawn from it.
             */
            Route::get('profit-loss', [AnalyticsController::class, 'profitLoss'])->name('profit-loss');
            Route::get('menu-engineering', [AnalyticsController::class, 'menuEngineering'])
                ->name('menu-engineering');
            Route::get('control', [AnalyticsController::class, 'control'])->name('control');

            /*
             * Six months of money in and out, in one call.
             *
             * `?months=` rather than `?period=`: this is the only report in the
             * module keyed by calendar months instead of a trailing window, for
             * the same reason `profit-loss` is — the console's chart has a
             * month's name under every bar, and "the trailing thirty days"
             * cannot be labelled July.
             */
            Route::get('cashflow', [AnalyticsController::class, 'cashflow'])->name('cashflow');

            /*
             * What each hour of the day cost against what it took.
             *
             * `analytics.view` like the rest, and the reason it can be is that
             * the labour half arrives through `App\Contracts\Staff\Roster` as
             * twenty-four totals with no names on them. A per-person version of
             * this would be personnel data and would belong behind
             * `staff.manage`, in the Staff module, on a different screen.
             */
            Route::get('labour-by-hour', [AnalyticsController::class, 'labourByHour'])
                ->name('labour-by-hour');
            Route::get('reports/{kind}', [AnalyticsController::class, 'report'])->name('reports.show');

            /*
            |------------------------------------------------------------------
            | The builder
            |------------------------------------------------------------------
            | `reports/columns` is the whitelist the picker draws from, shipped
            | rather than re-declared in TypeScript — the same argument the
            | settings schema makes. `reports/custom` runs one, and its `/export`
            | sibling answers the same table as a file.
            |
            | The two POSTs cannot collide with `reports/{kind}` above, which is
            | a GET. The catalogue is a GET and would have collided — Laravel
            | matches in declaration order, so `reports/columns` after
            | `reports/{kind}` reads as the report kind "columns" — which is why
            | it is spelled `report-columns` rather than moved above.
            */
            Route::get('report-columns', [ReportScheduleController::class, 'catalogue'])
                ->name('reports.columns');
            Route::post('reports/custom', [ReportScheduleController::class, 'custom'])
                ->name('reports.custom');
            Route::post('reports/custom/export', [ReportScheduleController::class, 'customExport'])
                ->name('reports.custom.export');

            /*
            |------------------------------------------------------------------
            | Schedules
            |------------------------------------------------------------------
            | Reading on `analytics.view` like everything else in this module;
            | WRITING on `reports.export`, which is the permission that already
            | means "may take figures out of the building". A schedule is an
            | export that repeats itself to an address of the setter's choosing,
            | and a role that may not download last month's cashflow must not be
            | able to have it emailed weekly instead.
            */
            Route::get('schedules', [ReportScheduleController::class, 'index'])->name('schedules.index');

            Route::middleware(PermissionMiddleware::using('reports.export'))->group(function (): void {
                Route::post('schedules', [ReportScheduleController::class, 'store'])->name('schedules.store');
                Route::patch('schedules/{schedule}', [ReportScheduleController::class, 'update'])
                    ->name('schedules.update');
                Route::delete('schedules/{schedule}', [ReportScheduleController::class, 'destroy'])
                    ->name('schedules.destroy');
                // Send one now, so somebody who just typed an address finds out
                // today rather than next Monday that it was wrong.
                Route::post('schedules/{schedule}/send', [ReportScheduleController::class, 'send'])
                    ->name('schedules.send');
            });
        });
    });

/*
|--------------------------------------------------------------------------
| Two endpoints that are not "analytics" to the person reading them
|--------------------------------------------------------------------------
| `GET /api/v1/dashboard` is the home screen and `POST /api/v1/reports/export`
| is a download. Both are computed by this module and neither belongs under
| its prefix: a client boots against `/dashboard`, and a URL that told a
| manager their home screen lives inside "analytics" would be describing the
| implementation rather than the product.
|
| The export is a POST despite reading nothing, because it carries the report
| kind and the period in a body rather than a query string. The builder has now
| landed and took its own door — `POST v1/analytics/reports/custom/export` —
| rather than growing a column selection onto this one: the five fixed reports
| and a whitelisted projection validate against different rules, and one
| endpoint switching between them would have been the place they drifted.
| Inside the `tenant` group, so it needs an `Idempotency-Key` like every other
| POST — harmless for a read, and one fewer exception on the list.
*/
Route::middleware(['auth:sanctum', 'tenant'])
    ->prefix('v1')
    ->name('api.v1.')
    ->group(function (): void {
        /*
         * `dashboard.view`, not `analytics.view` — and the difference is the
         * reason this endpoint sits outside the module's prefix in the first
         * place. The console's sidebar points EVERY role at `/dashboard`, and
         * what it draws there is a cashier's drawer, a waiter's own six tables
         * or a storekeeper's shelf. Guarded by `analytics.view`, four of the
         * seven roles got a 403 on their own home screen and silently fell back
         * to sample figures — and the only way to fix that would have been to
         * hand a waiter the venue's sales reports, its food cost and its ABC
         * analysis, which is what `analytics.view` actually opens.
         */
        Route::get('dashboard', [AnalyticsController::class, 'home'])
            ->middleware(PermissionMiddleware::using('dashboard.view'))->name('dashboard');
        // The status strip's four counts, for every role that has a home screen.
        Route::get('dashboard/pulse', [AnalyticsController::class, 'pulse'])
            ->middleware(PermissionMiddleware::using('dashboard.view'))->name('dashboard.pulse');
        Route::post('reports/export', [AnalyticsController::class, 'export'])
            ->middleware(PermissionMiddleware::using('analytics.view'))->name('reports.export');
    });
