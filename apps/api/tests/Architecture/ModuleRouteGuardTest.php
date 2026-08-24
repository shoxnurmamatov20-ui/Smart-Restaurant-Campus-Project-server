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
        'api/v1/auth/forgot-password' => 'no session yet, by definition; answers 204 either way so it is not an account oracle',
        'api/v1/auth/reset-password' => 'consumes a one-use token from the mail; revokes every session of the old password',
        // Email + password + TOTP, and the role check is inside the controller
        // because there is no authenticated user to check it against yet.
        'api/v1/admin/login' => 'the platform door; super-admin enforced in the handler',
        'api/v1/auth/logout' => 'ending a session needs no permission to end it',
        'api/v1/auth/me' => 'who am I — the answer is scoped to the asker',
        'api/v1/auth/context' => 'what may I do — the client reads this to build its nav',
        'api/v1/push/tokens' => 'a phone registering its own push token — scoped to the caller in the controller',

        /*
         * The bell in the console's top bar. All three answer about the caller
         * and nobody else, and there is no permission that could improve on
         * that: a role that could be refused its own notifications is a role
         * whose console quietly stops telling it things. The guard is the
         * query — NotificationController scopes every read and every write to
         * `$request->user()`, so an id belonging to somebody else is not
         * refused, it is not found.
         */
        'api/v1/notifications' => 'your own bell — the answer is scoped to the asker',
        'api/v1/notifications/{notification}/read' => 'marking your own row read; an id that is not yours is simply not found',
        'api/v1/notifications/read-all' => 'emptying your own tray; the WHERE names the caller',

        // ---- Guest-facing (convention 6) ----
        'api/v1/public/menu' => 'the QR menu: no login, tenant-scoped, sale items only',
        'api/v1/public/branches' => 'the venues a guest may order from: no login, tenant-scoped, active venues only',
        /*
         * A restaurant's own data export, fetched from the link we mailed them.
         *
         * There is no permission the holder could carry: the archive is
         * downloaded on a laptop that has never signed in here, by an owner who
         * does not hold a platform credential. The signature IS the guard — the
         * export id is inside what was signed, so the URL cannot be walked to
         * somebody else's row — and it dies with the file it points at.
         */
        'api/v1/exports/{export}/download' => 'a signed link to your own archive; the signature is the credential, throttle:30,1',
        // The restaurant's own website. Narrowed in the controller to what is
        // already printed on the door — no figures, no ids, no `legal.*`.
        'api/v1/public/site' => 'the shop window at /r/{slug}: no login, tenant-scoped, door information only',
        /*
         * Paying for dinner. There is no permission a guest could hold, and the
         * three of them are scoped by what the caller already has to know: the
         * rail list is public by nature, the invoice needs a bill id AND the
         * number printed on the guest's own receipt, and the status poll needs a
         * 32-character random token. See PublicPaymentController.
         */
        'api/v1/public/payments/providers' => 'which rails are on; no figures, no rows',
        'api/v1/public/payments/invoice' => 'a guest asking where to pay; needs the bill number, throttle:5,1',
        'api/v1/public/payments/{invoice}' => 'polling your own payment by its random token, throttle:30,1',
        /*
         * A bank, not a person. Authentication is per-protocol and lives in the
         * driver — Payme's HTTP Basic merchant key, Click's MD5 sign_string — so
         * there is no Spatie permission it could carry and no shared middleware
         * that could check both without learning both protocols.
         */
        'api/v1/payments/{provider}/callback' => 'a payment provider; the driver verifies its own signature',

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
        'api/v1/marketplace' => 'module info',
        'api/v1/board' => 'module info',

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
        'api/v1/pos/idle' => 'the idle screen: renders before any PIN, device token is the authorisation',
        'api/v1/pos/auth/pin' => 'the PIN keypad itself, throttled 20/min',
        'api/v1/pos/auth/staff' => 'who may sign in at this terminal',
        'api/v1/pos/auth/session' => 'the session the PIN opened',

        // ---- Asking is not deciding ----
        // Anyone at a till may request a void or a discount; granting one is
        // `pos.approve` and is guarded. That asymmetry is the approval model.
        'api/v1/pos/approvals' => 'asking for approval is open; deciding is pos.approve',
        /*
         * The staff app's front door. The caller is an enrolled phone, not a
         * person — finding out which person is holding it is the entire point
         * of the request, so there is no permission it could carry. The two
         * credentials are the device token and the PIN; see StaffAuthController.
         */
        'api/v1/staff/auth/pin' => 'a phone offering a PIN; the device token is the guard, throttle:20,1',
        /*
         * Reading and ending your own session. Neither can carry a permission
         * that means anything: the answer is about the caller, and a person who
         * could be refused the right to sign themselves out would stay signed in
         * on a handset they have just handed to somebody else.
         */
        'api/v1/staff/auth/session' => 'your own session — the token is the subject as well as the credential',
        // A handset that has never been enrolled holds nothing to check.
        'api/v1/staff/devices/pair' => 'first contact from an unenrolled phone; throttle:10,1',
        /*
         * A phone reading its own enrolment, so the sign-in screen can name the
         * branch it belongs to instead of a fixture's. The device token is both
         * the credential and the subject.
         */
        'api/v1/staff/devices/me' => 'the calling handset, about itself',
        /*
         * The crew app's two working doors, and both answer about the caller
         * and nobody else.
         *
         * Neither can carry a useful permission, because no single one is held
         * by every crew role: a waiter, a courier and a storekeeper share
         * nothing. Guarding them would either lock out the people they exist
         * for or hand a storekeeper's write-off power to everybody who can sign
         * in.
         *
         * `me/today` reads one person's own shifts and hours — the same shape
         * as `auth/me` above. `actions` is the offline queue's drain and is not
         * unguarded in substance: each of its eight verbs is checked against
         * `StaffActionController::PERMISSION_FOR`, which mirrors the owning
         * modules' routes, exactly as `SyncController` does for the till. An
         * entry the caller may not perform comes back `rejected` rather than
         * failing the batch beside it.
         */
        'api/v1/staff/me/today' => 'your own day; the answer is scoped to the asker',
        'api/v1/staff/me/upcoming' => 'your own rostered shifts plus colleague names for the swap form; no wage or contact data',
        'api/v1/staff/checklists/{day_key}' => 'your own ticks and cash declaration for one trading day; scoped to the asker',
        'api/v1/staff/actions' => 'the crew queue drain; per-verb permissions in StaffActionController',
        /*
         * A guest booking a table from the restaurant's own website. There is
         * no permission a stranger could hold — and none is needed, because the
         * booking holds no table: it lands `pending` for a manager to confirm
         * against the diary. See PublicReservationController.
         */
        'api/v1/public/reservations' => 'a guest asking for a table; lands pending, holds nothing, throttle:5,1',
        /*
         * The guest's own booking, by the code they were given. Ten random
         * characters from an alphabet with the confusable pairs removed — a
         * bearer credential a stranger cannot hold a permission for, and unlike
         * a bill number it has no neighbour to guess. `cancel` is the one that
         * matters: a guest who cannot call a booking off from their phone rings
         * a room that is busy, which means nobody rings and the table stays held.
         */
        'api/v1/public/reservations/{code}' => 'your own booking, by its random code; name, party size, time, status',
        'api/v1/public/reservations/{code}/confirm' => 'a guest saying they are still coming; holds nothing new',
        'api/v1/public/reservations/{code}/cancel' => 'a guest calling their own booking off; releases the covers',
        /*
         * Which times the booking form may offer. Publishes whether a slot is
         * bookable and never how many covers are left — the second would let
         * anybody outside the building watch a restaurant's evening fill up.
         */
        'api/v1/public/booking-slots' => 'the times a guest may pick; availability only, no figures, throttle:5,1',
        /*
         * A guest ordering food and then watching it come. There is no
         * permission a stranger could hold, and the belts are elsewhere: every
         * price is read from the catalogue, one phone number may have three
         * orders open, and tracking needs the last four digits of the number
         * that placed the order as well as the bill number. See
         * PublicOrderController.
         */
        'api/v1/public/orders' => 'a guest ordering dinner; server-priced, three per number, throttle:10,1',
        'api/v1/public/orders/{number}' => 'tracking your own order; needs the number AND the phone\'s last four, throttle:10,1',
        /*
         * The QR sticker on a table. The credential is the 22-character token
         * printed on it — unique across the platform and minted once — which is
         * exactly the kind of thing a permission cannot express: the caller is a
         * chair, not a person. See PublicTableController.
         */
        'api/v1/public/tables/{table}/order' => 'the guest at that table, proved by the printed token, throttle:10,1',
        'api/v1/public/tables/{table}/call' => 'a raised hand; latched to one live call per table, throttle:10,1',
        'api/v1/public/tables/{table}/pay' => 'asking for the bill; moves no money, throttle:10,1',
        /*
         * The customer's own account — signing in by phone, and everything
         * behind the token that buys. No Spatie permission is possible on any
         * of them: a guest is not a member of staff, holds no role, and the
         * subject of every request is the token that made it.
         *
         * The five below the sign-in pair are guarded, just not by this
         * mechanism: `customer.token` resolves a Sanctum token carrying the
         * `customer` ability, after tenancy has been resolved. See
         * Modules\Crm\Http\Middleware\RequireCustomerToken for why the order
         * is a row-level-security requirement.
         */
        'api/v1/public/auth/otp' => 'asking for an SMS code; no session yet, throttle:10,1',
        'api/v1/public/auth/otp/verify' => 'the code, for a token; no session yet, throttle:10,1',
        'api/v1/public/telegram/session' => 'Telegram signed who this is with the restaurant\'s own bot token; no session yet, throttle:10,1',
        'api/v1/public/me' => 'your own profile — the token is the subject as well as the credential',
        'api/v1/public/me/session' => 'signing yourself out; refusing that would strand a handed-over phone',
        'api/v1/public/addresses' => 'your own addresses, read through your own relation',
        'api/v1/public/addresses/{address}' => 'as above; an id that is not yours is simply not found',
        'api/v1/public/coupons' => 'the loyalty shelf and your own balance',
        /*
         * A guest's own handset. The core `push/tokens` cannot take it — that
         * route stamps `$request->user()` and a CRM customer is not a `User` —
         * and there is no permission a guest could hold. `customer.token` is
         * the authorisation, and the row is scoped to the customer it belongs
         * to on both the write and the delete.
         */
        'api/v1/public/push/tokens' => 'your own phone; the customer token is the authorisation',
        'api/v1/public/coupons/{coupon}/reserve' => 'spending your own points; locked and idempotent',
        /*
         * A review, a promo check and the contact form. Each is powerless in
         * its own way: a review sets no status and cannot mark itself urgent, a
         * promo check writes nothing at all, and a lead creates a row somebody
         * has to ring.
         */
        'api/v1/public/feedback' => 'a guest saying what they thought; no account needed, throttle:10,1',
        'api/v1/public/promo-codes/check' => 'is this code worth anything; writes nothing, throttle:30,1',
        'api/v1/public/leads' => 'the contact form on the marketing site; throttle:5,1',

        /*
         * The marketplace's consumer surface. A MyPOS customer holds no Spatie
         * permission and never will: a permission describes what a member of
         * staff may do inside one restaurant, and this person is on nobody's
         * staff and shops across forty of them.
         *
         * What guards each one is written beside it. The first two are a shop
         * window and need no guard at all; the next two are the front door; the
         * rest carry a customer's own token, checked by `auth:sanctum` plus
         * `mp.consumer` — which verifies the tokenable is a Consumer and the
         * ability is `mp-consumer`, so a waiter's perfectly valid Sanctum token
         * is refused rather than let through to "your orders".
         *
         * The MERCHANT half of this module is guarded by permissions in the
         * ordinary way and is deliberately absent from this list.
         */
        'api/v1/mp/stores' => 'a shop window: names, prices, delivery windows; throttle:60,1',
        'api/v1/mp/stores/{store}' => 'one shop window and its market menu; throttle:60,1',
        'api/v1/mp/auth/otp' => 'a phone asking for a sign-in code; throttle:5,1',
        'api/v1/mp/auth/otp/verify' => 'the code, for a token; throttle:10,1',
        'api/v1/mp/me' => 'your own profile — the consumer token is the authorisation',
        'api/v1/mp/me/addresses' => 'your own address book — the consumer token is the authorisation',
        'api/v1/mp/plus' => 'your own subscription — the consumer token is the authorisation',
        'api/v1/mp/plus/subscribe' => 'starting your own subscription; one month at a time, throttle:10,1',
        'api/v1/mp/plus/cancel' => 'stopping your own subscription; the month already paid for stays, throttle:10,1',
        'api/v1/mp/push/tokens' => 'your own phone, so a courier notice can reach it — the consumer token is the authorisation',
        'api/v1/mp/orders' => 'your own orders; placing one is server-priced, throttle:10,1',
        'api/v1/mp/orders/{number}' => 'one of your own orders, scoped by consumer_id AND number',
        'api/v1/mp/orders/{number}/cancel' => 'your own order, while the ladder still allows it; throttle:10,1',
        'api/v1/mp/orders/{number}/rate' => 'your own delivered order, once; throttle:10,1',
        'api/v1/mp/orders/{number}/dispute' => 'your own order, one complaint; throttle:10,1',
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
        'api/v1/auth/forgot-password' => 'asking for a reset mail; throttle:auth, 204 either way',
        'api/v1/auth/reset-password' => 'a one-use token from the mail for a new password; throttle:auth',
        'api/v1/admin/login' => 'the platform door: password + TOTP; throttle:auth',
        'api/v1/public/menu' => 'the QR menu a guest scans; tenant-scoped, sale items only',
        'api/v1/public/site' => 'the restaurant\'s own website; tenant-scoped, door information only, throttle:60,1',
        'api/v1/public/branches' => 'the venues a guest may order from; tenant-scoped, active only, throttle:60,1',
        /*
         * The narrowest door on this list, and the only one whose credential
         * travels in the URL. A `URL::temporarySignedRoute` link over the
         * export id: unforgeable without APP_KEY, valid for the archive's own
         * twenty-four hours and not a minute longer, and answering 404 rather
         * than 410 once it lapses so it cannot be used to find out which export
         * ids were real. Every failure mode is verified in TenantExportTest.
         */
        'api/v1/exports/{export}/download' => 'a signed, expiring link to one archive; the signature is the whole credential, throttle:30,1',
        // The one write a stranger may make. Tenant-scoped like the menu, and
        // deliberately powerless: it creates a request, not a reservation.
        'api/v1/public/reservations' => 'the booking form on a restaurant’s own site; throttle:5,1',
        /*
         * The guest's own booking afterwards. The credential is the ten-character
         * code the booking answered with — random, from an alphabet with the
         * confusable pairs removed, and unique across the platform. Unlike a bill
         * number it has no neighbour to guess, which is why these three need no
         * second factor where order tracking does.
         *
         * `cancel` is the one that earns its place. A guest who cannot call a
         * booking off from their phone telephones a room that is busy serving
         * dinner, which in practice means nobody telephones: the table stays held
         * for a party that is not coming.
         */
        'api/v1/public/reservations/{code}' => 'your own booking by its random code; name, party size, time, status; throttle:5,1',
        'api/v1/public/reservations/{code}/confirm' => 'a guest saying they are still coming; holds nothing new; throttle:5,1',
        'api/v1/public/reservations/{code}/cancel' => 'a guest calling their own booking off; releases the covers; throttle:5,1',
        /*
         * Which times the booking form may offer. Publishes availability and
         * never a figure — how many covers are left would let anybody outside the
         * building watch a restaurant's evening fill up.
         */
        'api/v1/public/booking-slots' => 'the times a guest may pick; availability only; throttle:5,1',
        // Paying for dinner with no account. Tenant-scoped like the menu; the
        // invoice needs a bill id and the number on the guest's own receipt,
        // and the status poll needs the token that invoice returned.
        'api/v1/public/payments/providers' => 'the rail list a checkout draws its buttons from; throttle:30,1',
        'api/v1/public/payments/invoice' => 'a guest asking where to pay; throttle:5,1',
        'api/v1/public/payments/{invoice}' => 'polling your own payment by a random token; throttle:30,1',
        /*
         * The one door on this platform opened to a machine rather than a
         * person. A bank cannot present a credential of ours, so the wall is the
         * provider's own: Payme's merchant key in an HTTP Basic header, Click's
         * MD5 signature over eight ordered fields. Both are checked with
         * `hash_equals` inside the driver, and an unsigned callback is answered
         * with that provider's own refusal rather than a 401 it would retry
         * forever.
         */
        'api/v1/payments/{provider}/callback' => 'a payment provider; per-protocol signature, throttle:120,1',
        // A tablet that has never paired holds nothing. The pairing code is
        // what identifies the restaurant, it lives ten minutes, and the route
        // is throttled to ten attempts a minute for exactly that reason.
        'api/v1/pos/terminals/pair' => 'first contact from an unpaired till; throttle:10,1',
        // The same, for a waiter's own phone. The code identifies the
        // restaurant, it lives ten minutes, and the route is throttled to ten
        // attempts a minute for exactly that reason.
        'api/v1/staff/devices/pair' => 'first contact from an unenrolled phone; throttle:10,1',
        /*
         * Ordering dinner, and watching it come. The writes a stranger may make
         * grew from one to three here, and each is powerless in its own way: an
         * order is priced entirely by the server, tracking reads only what the
         * caller already proved they know, and both are throttled to ten a
         * minute per address.
         */
        'api/v1/public/orders' => 'a guest ordering dinner from a phone; server-priced, throttle:10,1',
        'api/v1/public/orders/{number}' => 'the number plus the phone\'s last four digits; throttle:10,1',
        // The token printed on the table is the credential. It is unguessable
        // rather than secret — it is laminated to furniture in a public room —
        // which is exactly the property a table code needs.
        'api/v1/public/tables/{table}/order' => 'the QR sticker on that table; throttle:10,1',
        'api/v1/public/tables/{table}/call' => 'the QR sticker on that table; throttle:10,1',
        'api/v1/public/tables/{table}/pay' => 'the QR sticker on that table; throttle:10,1',
        /*
         * Signing in by phone. Nobody has a credential yet — that is what these
         * two are for — and the belts are elsewhere: one send a minute and five
         * an hour per NUMBER (which is the thing being spent on), ten a minute
         * per address, and five wrong codes lock the number for fifteen
         * minutes. See App\Support\Auth\OtpCredentials.
         */
        'api/v1/public/auth/otp' => 'asking for an SMS code; per-number and per-address limits, throttle:10,1',
        'api/v1/public/auth/otp/verify' => 'the code, for a token; five wrong tries locks the number, throttle:10,1',
        'api/v1/public/telegram/session' => 'signed initData for a token; the signature IS the credential, throttle:10,1',
        /*
         * Three writes a stranger may make, and each is powerless.
         *
         * A review sets no status, cannot mark itself urgent and cannot claim
         * another guest's id. A promo check writes nothing at all — it is a
         * question shaped like a POST. A lead creates a row a person has to
         * ring, one per number per day.
         */
        'api/v1/public/feedback' => 'a guest at a table has no account and their complaint still counts; throttle:10,1',
        'api/v1/public/promo-codes/check' => 'a question, not a write; throttle:30,1',
        'api/v1/public/leads' => 'how a restaurant with no account asks for one; throttle:5,1',
        /*
         * The marketplace's shop window and its front door — four routes, and
         * only four. Everything else under `api/v1/mp/` carries `auth:sanctum`
         * and is deliberately not on this list.
         *
         * The window is published on purpose: a marketplace whose directory
         * needed a login would have nothing to show anybody, and what it answers
         * is a name, a cuisine, a delivery window and a price list. The door
         * cannot ask for a credential, because working out who is holding the
         * phone is the entire purpose of the code it sends — and the belts are
         * the ones every other phone door here uses: one send a minute per
         * NUMBER, five wrong codes locks it, and the per-address throttle
         * catches a script working through a list.
         */
        'api/v1/mp/stores' => 'the directory a guest browses before choosing anything; throttle:60,1',
        'api/v1/mp/stores/{store}' => 'one shop window and its prices; throttle:60,1',
        'api/v1/mp/auth/otp' => 'no account yet, by definition; per-number limits in OtpCredentials, throttle:5,1',
        'api/v1/mp/auth/otp/verify' => 'the code, for a token; five wrong guesses locks the number, throttle:10,1',
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
                    || str_starts_with($entry, 'pos.')
                    /*
                     * The guest's own token. `customer.token` rather than
                     * `auth:sanctum` because the framework sorts `Authenticate`
                     * above `ResolveTenant`, and `crm.customers` sits behind
                     * row-level security — see RequireCustomerToken. A door,
                     * not an exemption.
                     */
                    || str_starts_with($entry, 'customer.')) {
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
