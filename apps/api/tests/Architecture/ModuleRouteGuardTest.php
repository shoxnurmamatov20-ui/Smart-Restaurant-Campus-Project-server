<?php

declare(strict_types=1);

namespace Tests\Architecture;

use Illuminate\Routing\Route as RoutingRoute;
use Illuminate\Support\Facades\Route;
use Spatie\Permission\Middleware\PermissionMiddleware;
use Spatie\Permission\Middleware\RoleMiddleware;
use Tests\TestCase;

/**
 * Every API route says who may call it.
 *
 * CLAUDE.md states it as binding: each module action sits behind
 * `auth:sanctum` + `tenant`, guarded by a `{module}.{action}` permission. That
 * held everywhere it was written by hand and failed in the one place nobody
 * wrote it — `module:make` generates an `apiResource` onto a scaffold
 * controller, and the eleventh module shipped with `auth:sanctum` and nothing
 * else. Any signed-in user, a waiter included, could reach its POST and
 * DELETE.
 *
 * Nothing caught it. The permission seeder was right, `DesignRoleMatrixTest`
 * proved every role held exactly what the design says — and none of that
 * matters on a route that never asks. A role's permissions and the routes that
 * check them are two halves, and only the second one is reachable from the
 * internet.
 *
 * So the rule is inverted here: a route is guarded unless it is on the list
 * below, and adding to that list is a deliberate act with a reason written
 * next to it. A generated route lands in the failure, not in the allowlist.
 */
final class ModuleRouteGuardTest extends TestCase
{
    /**
     * Routes that answer before there is a permission to check.
     *
     * Each is a decision, not an oversight. Read as: *why* this endpoint can
     * be reached without holding anything.
     *
     * @var array<string, string>
     */
    private const UNGUARDED = [
        // ---- Becoming someone ----
        'api/v1/auth/register' => 'no session yet, by definition',
        'api/v1/auth/login' => 'no session yet, by definition',
        // Email + password + TOTP, and the role check is inside the controller
        // because there is no authenticated user to check it against yet.
        'api/v1/admin/login' => 'the platform door; super-admin enforced in the handler',
        'api/v1/auth/logout' => 'ending a session needs no permission to end it',
        'api/v1/auth/me' => 'who am I — the answer is scoped to the asker',
        'api/v1/auth/context' => 'what may I do — the client reads this to build its nav',

        // ---- Guest-facing (convention 6) ----
        'api/v1/public/menu' => 'the QR menu: no login, tenant-scoped, sale items only',

        // ---- Discovery ----
        // These return a module's name, labels and endpoint map. No figures,
        // no rows — a manifest a client builds navigation from.
        'api/v1/modules' => 'the capability manifest every client boots against',
        'api/v1/menu' => 'module info',
        'api/v1/orders' => 'module info',
        'api/v1/kitchen' => 'module info',
        'api/v1/tables' => 'module info',
        'api/v1/inventory' => 'module info',
        'api/v1/suppliers' => 'module info',
        'api/v1/staff' => 'module info',
        'api/v1/finance' => 'module info',
        'api/v1/crm' => 'module info',
        'api/v1/analytics' => 'module info',
        'api/v1/pos' => 'module info',

        // ---- Branches ----
        // The top-bar switcher needs this on every screen, and a waiter who
        // cannot name their own workplace is a broken console. The controller
        // narrows the list to a pinned user's own venue; changing the estate
        // is `branches.manage` and is guarded.
        'api/v1/branches' => 'the branch switcher, narrowed in the controller',
        'api/v1/branches/{branch}' => 'as above',

        // ---- The till, before a person is at it ----
        // A terminal authenticates as a device; a person then authenticates
        // with a PIN. Neither can hold a permission before it happens.
        'api/v1/pos/terminals/pair' => 'device pairing: no user yet',
        'api/v1/pos/terminals/heartbeat' => 'device liveness: no user yet',
        'api/v1/pos/auth/pin' => 'the PIN keypad itself, throttled 20/min',
        'api/v1/pos/auth/staff' => 'who may sign in at this terminal',
        'api/v1/pos/auth/session' => 'the session the PIN opened',

        // ---- Asking is not deciding ----
        // Anyone at a till may request a void or a discount; granting one is
        // `pos.approve` and is guarded. That asymmetry is the approval model.
        'api/v1/pos/approvals' => 'asking for approval is open; deciding is pos.approve',
    ];

    /**
     * Route prefixes with an auth channel of their own.
     *
     * The Python dispatcher is not a user and holds no Spatie permissions; it
     * presents a shared secret and `internal.bots` checks it. Guarded, just
     * not by this mechanism.
     *
     * @var array<string, string>
     */
    private const OWN_GUARD = [
        'api/v1/bots/' => 'internal.bots — shared LARAVEL_INTERNAL_TOKEN',
    ];

    /**
     * Routes reachable with no credential whatsoever.
     *
     * The shortest list in the codebase, and the one to argue about hardest.
     * Every entry is a door onto the internet.
     *
     * @var array<string, string>
     */
    private const ANONYMOUS = [
        'api/v1/auth/register' => 'creating the first account',
        'api/v1/auth/login' => 'exchanging a password for a token; throttle:auth',
        'api/v1/admin/login' => 'the platform door: password + TOTP; throttle:auth',
        'api/v1/public/menu' => 'the QR menu a guest scans; tenant-scoped, sale items only',
        // A tablet that has never paired holds nothing. The pairing code is
        // what identifies the restaurant, it lives ten minutes, and the route
        // is throttled to ten attempts a minute for exactly that reason.
        'api/v1/pos/terminals/pair' => 'first contact from an unpaired till; throttle:10,1',
    ];

    public function test_every_api_route_is_guarded_or_deliberately_open(): void
    {
        $unguarded = [];

        foreach (Route::getRoutes()->getRoutes() as $route) {
            $uri = $route->uri();

            if (! str_starts_with($uri, 'api/v1/')) {
                continue;
            }

            if (array_key_exists($uri, self::UNGUARDED) || $this->hasItsOwnGuard($uri)) {
                continue;
            }

            if (! $this->carriesAPermission($route)) {
                $unguarded[] = implode('|', $route->methods()).' '.$uri;
            }
        }

        sort($unguarded);

        $this->assertSame([], $unguarded, sprintf(
            "These routes ask for no permission and are not on the allowlist:\n  %s\n\n".
            'Add PermissionMiddleware::using(\'{module}.{action}\') — or, if reaching it '.
            'without holding anything is the intent, add it to self::UNGUARDED with the reason.',
            implode("\n  ", $unguarded),
        ));
    }

    public function test_every_api_route_requires_a_signed_in_caller(): void
    {
        // A permission implies a user, but the reverse is what bites: an
        // endpoint that is open by design still has to say which door it is
        // open to, or it is open to the internet.
        $anonymous = [];

        foreach (Route::getRoutes()->getRoutes() as $route) {
            $uri = $route->uri();

            if (! str_starts_with($uri, 'api/v1/') || array_key_exists($uri, self::ANONYMOUS)) {
                continue;
            }

            $middleware = $route->gatherMiddleware();

            $authenticated = false;
            foreach ($middleware as $entry) {
                $entry = (string) $entry;
                if (str_starts_with($entry, 'auth:') || str_starts_with($entry, 'internal.')
                    || str_starts_with($entry, 'pos.')) {
                    $authenticated = true;
                }
            }

            if (! $authenticated) {
                $anonymous[] = implode('|', $route->methods()).' '.$uri;
            }
        }

        sort($anonymous);
        $this->assertSame([], $anonymous, "Reachable with no credential at all:\n  ".implode("\n  ", $anonymous));
    }

    public function test_the_allowlist_has_no_entries_for_routes_that_are_gone(): void
    {
        // An allowlist outlives what it excused. Left unchecked it becomes a
        // list of names nobody recognises, and the next person adds to it
        // rather than questioning it.
        $live = [];
        foreach (Route::getRoutes()->getRoutes() as $route) {
            $live[$route->uri()] = true;
        }

        $stale = array_keys(array_diff_key(self::UNGUARDED + self::ANONYMOUS, $live));

        sort($stale);
        $this->assertSame([], $stale, 'Allowlisted but no longer routed: '.implode(', ', $stale));
    }

    public function test_the_generated_telegram_scaffold_is_not_mounted(): void
    {
        // The one that got through, named so it cannot come back quietly.
        // `module:make` writes an apiResource onto a controller whose index()
        // returns a blade view and whose store() is empty.
        foreach (Route::getRoutes()->getRoutes() as $route) {
            $this->assertStringNotContainsString(
                'telegrambots',
                $route->uri(),
                "The scaffold CRUD is mounted again at {$route->uri()} — see Modules/TelegramBots/routes/api.php",
            );
        }
    }

    private function hasItsOwnGuard(string $uri): bool
    {
        foreach (array_keys(self::OWN_GUARD) as $prefix) {
            if (str_starts_with($uri, $prefix)) {
                return true;
            }
        }

        return false;
    }

    private function carriesAPermission(RoutingRoute $route): bool
    {
        foreach ($route->gatherMiddleware() as $entry) {
            $entry = (string) $entry;

            if (str_starts_with($entry, PermissionMiddleware::class)
                || str_starts_with($entry, RoleMiddleware::class)
                || str_starts_with($entry, 'permission:')
                || str_starts_with($entry, 'role:')) {
                return true;
            }
        }

        return false;
    }
}
