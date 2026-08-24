<?php

declare(strict_types=1);

use App\Http\Controllers\AdminAuthController;
use App\Http\Controllers\AuditController;
use App\Http\Controllers\AuthController;
use App\Http\Controllers\BranchController;
use App\Http\Controllers\HealthController;
use App\Http\Controllers\ModuleController;
use App\Http\Controllers\NotificationController;
use App\Http\Controllers\PasswordResetController;
use App\Http\Controllers\Platform;
use App\Http\Controllers\PublicBranchController;
use App\Http\Controllers\PublicSiteController;
use App\Http\Controllers\PushTokenController;
use App\Http\Controllers\RoleController;
use App\Http\Controllers\SettingsController;
use App\Http\Controllers\SiteVisitController;
use Illuminate\Support\Facades\Route;
use Spatie\Permission\Middleware\PermissionMiddleware;
use Spatie\Permission\Middleware\RoleMiddleware;

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
        // Forgot / reset: no session by definition, same throttle as login,
        // same tenant header so the mail goes to the right restaurant's owner.
        Route::post('auth/forgot-password', [PasswordResetController::class, 'forgot'])->name('auth.forgot');
        Route::post('auth/reset-password', [PasswordResetController::class, 'reset'])->name('auth.reset');

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

    /*
     * ---- Public: the restaurant's own website ----
     * `(site)/r/{slug}` is the one indexable surface on the platform. No
     * session, tenant-scoped like the QR menu, and narrowed in the controller
     * to what is already printed on the door.
     */
    Route::middleware(['tenant', 'throttle:60,1'])
        ->get('public/site', PublicSiteController::class)
        ->name('public.site');

    /*
     * ---- Public: the venues ----
     * Tenant-scoped and open, like the public menu: a customer app asks
     * "which branch" before it can order, and a stranger has no session to
     * ask with. Throttled like the other public doors.
     */
    Route::middleware(['tenant', 'throttle:60,1'])
        ->get('public/branches', PublicBranchController::class)
        ->name('public.branches');

    /*
     * ---- The archive a restaurant asked for ----
     *
     * No session and no tenant, and both are the design rather than an
     * oversight. The link is created by `URL::temporarySignedRoute`, lives
     * exactly as long as the file behind it, and is MAILED — the person who
     * opens it is on a laptop that has never signed in here, and requiring a
     * console session would mean requiring a restaurant owner to hold a
     * platform credential.
     *
     * The signature is the credential: the export id is inside what was
     * signed, so a caller cannot walk to a different restaurant's archive
     * without invalidating the thing that let them in. It is verified in
     * `download()` rather than by the `signed` middleware, so the refusal
     * comes back in the one error envelope with a code — see the controller.
     *
     * Documented in ModuleRouteGuardTest (ANONYMOUS + UNGUARDED) and
     * TenancyClaimTest (TENANTLESS), each with the reason.
     */
    Route::middleware('throttle:30,1')
        ->get('exports/{export}/download', [Platform\TenantExportController::class, 'download'])
        ->name('exports.download');

    // ---- Signed in ----
    Route::middleware(['auth:sanctum', 'tenant'])->group(function (): void {
        Route::post('auth/logout', [AuthController::class, 'logout'])->name('auth.logout');
        Route::get('auth/me', [AuthController::class, 'me'])->name('auth.me');

        // What restaurant am I in and what may I do? Clients read this on boot
        // instead of inferring capabilities from the token.
        Route::get('auth/context', [AuthController::class, 'context'])->name('auth.context');

        /*
         * ---- Push ----
         * Where this person's phone can be reached. No permission beyond being
         * signed in: the row is the caller's own device, the controller scopes
         * every write to `$request->user()`, and a waiter who could not
         * register a phone would never hear that a table is waiting.
         */
        Route::post('push/tokens', [PushTokenController::class, 'store'])->name('push.register');
        Route::delete('push/tokens', [PushTokenController::class, 'destroy'])->name('push.forget');

        /*
         * ---- The bell ----
         * What is waiting for this person, in this restaurant. No permission
         * beyond being signed in, and none that would help: "may I read my own
         * notifications" is not a question a role can be refused, and every
         * query in the controller is scoped to `$request->user()` — an id that
         * belongs to somebody else is not found rather than refused.
         *
         * The uuid constraint is not decoration. The primary key is a uuid, so
         * a segment that is not one reaches PostgreSQL as `uuid = 'garbage'`
         * and comes back a 500 where the honest answer is 404.
         */
        Route::get('notifications', [NotificationController::class, 'index'])
            ->name('notifications.index');
        Route::patch('notifications/{notification}/read', [NotificationController::class, 'read'])
            ->whereUuid('notification')->name('notifications.read');
        Route::post('notifications/read-all', [NotificationController::class, 'readAll'])
            ->name('notifications.read-all');

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

        /*
         * ---- Restoran sozlamalari ----
         *
         * Reading and writing are different permissions on purpose. A branch
         * manager has to read the VAT rate to explain a receipt to a guest;
         * changing it reprices every bill in the building, so it is the
         * owner's — `system.settings`, which by the RBAC seeder only the owner
         * and the platform operator hold.
         *
         * `site` is the same document's other half, split at the route because
         * the two pages are saved by different people: a marketer writes the
         * website copy, the owner writes the bank details.
         */
        Route::get('settings', [SettingsController::class, 'show'])
            ->middleware(PermissionMiddleware::using('settings.view'))->name('settings.show');
        Route::patch('settings', [SettingsController::class, 'update'])
            ->middleware(PermissionMiddleware::using('system.settings'))->name('settings.update');
        /*
         * ---- How the website did ----
         *
         * The Traffic tab on the same screen that edits the site. `settings.view`
         * for the same reason `settings/site` carries it: a restaurant's own
         * visit counts are not more sensitive than the copy on its front page,
         * and a second permission would leave the tab dark for exactly the
         * people the screen is built for.
         *
         * The counter itself is written by `PublicSiteController` — the request
         * a render of `(site)/r/{slug}` makes — so nothing about it needs a
         * script tag or a third party.
         */
        Route::get('site-visits', SiteVisitController::class)
            ->middleware(PermissionMiddleware::using('settings.view'))->name('site-visits');

        Route::get('settings/site', [SettingsController::class, 'site'])
            ->middleware(PermissionMiddleware::using('settings.view'))->name('settings.site.show');
        Route::put('settings/site', [SettingsController::class, 'updateSite'])
            ->middleware(PermissionMiddleware::using('system.settings'))->name('settings.site.update');
        /*
         * Putting the draft on the internet.
         *
         * A POST rather than a flag on the PUT above, because they are two acts
         * by two people at two moments: a marketer rewrites the blurb all
         * afternoon, and somebody decides it is ready. `system.settings` on
         * both, so the person who may change the site is the person who may
         * show it — a marketer who could publish but not edit, or edit but not
         * publish, is a workflow this product does not have.
         */
        Route::post('settings/site/publish', [SettingsController::class, 'publish'])
            ->middleware(PermissionMiddleware::using('system.settings'))->name('settings.site.publish');

        /*
         * The owner's own copy of everything we hold — the same job the
         * platform console queues, aimed at the caller's own restaurant.
         *
         * `system.settings` on the READ as well as the write, unlike the pair
         * above. The list carries signed download links, so being able to see
         * it is being able to take the archive; a permission that let a branch
         * manager watch the progress would let them fetch the file.
         */
        Route::post('settings/export', [SettingsController::class, 'export'])
            ->middleware(PermissionMiddleware::using('system.settings'))->name('settings.export');
        Route::get('settings/exports', [SettingsController::class, 'exports'])
            ->middleware(PermissionMiddleware::using('system.settings'))->name('settings.exports');

        /*
         * ---- Rollar va ruxsatlar ----
         *
         * `roles.manage` on the read as well as the write: the matrix names
         * every power on the platform and who holds it, which is a map of the
         * building for anybody planning to walk through it. Only the owner and
         * the operator hold it — see DesignRoleMatrixTest.
         */
        Route::middleware(PermissionMiddleware::using('roles.manage'))->group(function (): void {
            Route::get('roles', [RoleController::class, 'index'])->name('roles.index');
            Route::put('roles/{role}', [RoleController::class, 'update'])->name('roles.update');
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
            ->middleware([RoleMiddleware::using('super-admin')])
            ->name('admin.')
            ->group(function (): void {
                // Platform-level admin routes mount here
            });

        /*
         * ---- The platform console ----
         *
         * Twelve screens that are cross-tenant by definition: every restaurant
         * on the product, what each is on, what each owes.
         *
         * `role:super-admin` and NOT a permission, because there is no
         * permission a restaurant could hold that should open these. An owner
         * is an admin of their business; the difference is the whole model, and
         * `platform-data.ts` names the test it needs — "a request carrying an
         * owner's token must be refused here even though that owner is an admin
         * of their own restaurant".
         *
         * Inside the `tenant` group on purpose. `ResolveTenant` already knows
         * the platform operator — tenant_id null, super-admin — and OPENS the
         * row-level-security policies for them (`bypass`). Mounting outside it
         * would leave `app.tenant_id` unset, which fails closed: every query
         * would read zero rows and every screen would draw empty.
         */
        /*
         * The class, not the `role:` alias.
         *
         * This application registers no middleware aliases — see
         * bootstrap/app.php, where `tenant` is a GROUP and everything else is
         * named by class. `role:super-admin` therefore resolves as a container
         * binding called "role", which does not exist, and every route under it
         * answers 500. The group above carried the same string and never showed
         * it, because it has no routes in it.
         */
        Route::prefix('platform')
            ->middleware([RoleMiddleware::using('super-admin')])
            ->name('platform.')
            ->group(function (): void {
                Route::get('overview', Platform\OverviewController::class)->name('overview');

                Route::get('tenants', [Platform\TenantController::class, 'index'])->name('tenants.index');
                Route::post('tenants', [Platform\TenantController::class, 'store'])->name('tenants.store');
                Route::get('tenants/{tenant}', [Platform\TenantController::class, 'show'])->name('tenants.show');
                Route::patch('tenants/{tenant}', [Platform\TenantController::class, 'update'])->name('tenants.update');
                Route::delete('tenants/{tenant}', [Platform\TenantController::class, 'destroy'])->name('tenants.destroy');

                /*
                 * The most powerful call on the platform. Its guard is not the
                 * route — every route here is super-admin — it is the reason
                 * field, which is NOT NULL in the table and refused empty by
                 * the request. See TenantController::impersonate.
                 */
                Route::post('tenants/{tenant}/impersonate', [Platform\TenantController::class, 'impersonate'])
                    ->name('tenants.impersonate');

                /*
                 * A new password for the restaurant's owner, answered once.
                 *
                 * Not "show the password" — `users.password` is a hash, so the
                 * only honest answer to that question is a new one. It exists
                 * because there was previously no answer at all: the password
                 * `POST tenants` prints is printed once, and an operator asked
                 * for it a day later had nowhere to go. See
                 * TenantController::resetOwnerPassword.
                 */
                Route::post('tenants/{tenant}/owner-password', [Platform\TenantController::class, 'resetOwnerPassword'])
                    ->name('tenants.owner-password');

                /*
                 * The owner's own details — the address they sign in with.
                 *
                 * Separate from the line above because the two are different
                 * acts: this is an idempotent correction, that one issues a
                 * credential and ends every session the account has open. An
                 * operator fixing a typo in a phone number must not sign the
                 * owner out of the till they are standing at.
                 */
                Route::patch('tenants/{tenant}/owner', [Platform\TenantController::class, 'updateOwner'])
                    ->name('tenants.owner.update');

                /*
                 * Read back the password the platform issued.
                 *
                 * Not "show the password" — `users.password` is a hash and
                 * nothing turns it back. This answers a narrower question: what
                 * did *this platform* hand over, which it is entitled to
                 * remember about a credential it issued itself. The column is
                 * encrypted at rest and cleared the moment anybody changes the
                 * password by another route, so a stale value can never be read
                 * out as current.
                 *
                 * GET because it changes nothing, and every read is logged with
                 * the operator's identity — "who looked at this restaurant's
                 * password, and when" has to be answerable.
                 */
                Route::get('tenants/{tenant}/owner-password', [Platform\TenantController::class, 'ownerPassword'])
                    ->name('tenants.owner-password.show');
                Route::post('tenants/{tenant}/invoices', [Platform\BillingController::class, 'store'])
                    ->name('tenants.invoices.store');

                /*
                 * A GDPR-shaped archive of one customer's data. 202 and a row
                 * to poll — the walk is a queued job, because a restaurant with
                 * a year of orders behind it cannot be serialised inside an
                 * HTTP request. The download itself is NOT here: it hangs off
                 * the public block above, on a signed link that expires.
                 */
                Route::post('tenants/{tenant}/export', [Platform\TenantExportController::class, 'store'])
                    ->name('tenants.export');
                Route::get('tenants/{tenant}/exports', [Platform\TenantExportController::class, 'index'])
                    ->name('tenants.exports');

                Route::get('plans', [Platform\PlanController::class, 'index'])->name('plans.index');
                Route::patch('plans/{plan}', [Platform\PlanController::class, 'update'])->name('plans.update');

                Route::get('billing', [Platform\BillingController::class, 'index'])->name('billing.index');
                Route::post('billing/{invoice}/mark-paid', [Platform\BillingController::class, 'markPaid'])
                    ->name('billing.mark-paid');
                Route::post('billing/{invoice}/retry', [Platform\BillingController::class, 'retry'])
                    ->name('billing.retry');

                Route::get('terminals', Platform\DeviceController::class)->name('terminals');
                Route::get('sign-ins', Platform\SignInController::class)->name('sign-ins');
                Route::get('health', Platform\PlatformHealthController::class)->name('health');
                Route::get('releases', Platform\ReleaseController::class)->name('releases');

                Route::get('issues', [Platform\IssueController::class, 'index'])->name('issues.index');
                Route::post('issues', [Platform\IssueController::class, 'store'])->name('issues.store');
                Route::patch('issues/{issue}', [Platform\IssueController::class, 'update'])->name('issues.update');

                Route::get('settings', [Platform\PlatformSettingsController::class, 'index'])->name('settings.index');
                Route::patch('settings', [Platform\PlatformSettingsController::class, 'update'])->name('settings.update');

                Route::get('team', [Platform\TeamController::class, 'index'])->name('team.index');
                Route::post('team', [Platform\TeamController::class, 'store'])->name('team.store');
            });

        // ---- Module routes auto-mount via nwidart/laravel-modules ----
    });
});
