<?php

declare(strict_types=1);

namespace Tests\Architecture;

use App\Http\Middleware\EnsureIdempotency;
use Illuminate\Routing\Route;
use Illuminate\Support\Facades\Route as RouteFacade;
use PHPUnit\Framework\Attributes\Test;
use Tests\TestCase;

/**
 * API.md §1: "Never let a mutating endpoint succeed without an idempotency
 * key." A rule that lives only in a document is a rule that a new module
 * forgets, so it lives here instead — the same shape as ModuleRouteGuardTest,
 * which is how this codebase already keeps route rules from rotting.
 *
 * The exemptions below are the whole point. Each one is a decision someone
 * made on purpose, written down with its reason, rather than a route that
 * quietly slipped through.
 */
final class IdempotencyCoverageTest extends TestCase
{
    /**
     * Mutating routes that deliberately do not require a key.
     *
     * @var array<string, string>
     */
    private const EXEMPT = [
        // Signing in is not a mutation of business data, and the client has no
        // session yet to generate a key against. A replayed sign-in mints a
        // second token, which is what a second sign-in should do.
        'api/v1/auth/register' => 'no session yet; a replay should mint a new token',
        'api/v1/auth/login' => 'no session yet; a replay should mint a new token',
        'api/v1/auth/forgot-password' => 'no session yet; a replay sends the same mail again, which is what a person who pressed twice wants',
        'api/v1/auth/reset-password' => 'no session yet; the broker token is one-use, so a replay is refused by the token itself',
        'api/v1/auth/logout' => 'idempotent by nature — the token is already gone',
        'api/v1/admin/login' => 'no session yet; TOTP already blocks replay within its window',

        // Pairing happens before the terminal has any identity to key against,
        // and the ten-minute code is single-use, which is the same guarantee.
        'api/v1/pos/terminals/pair' => 'single-use pairing code is already the one-time key',

        // The same door for a personal phone, and the same guarantee: a handset
        // that has never been enrolled has no identity to key a request against,
        // and the eight-character code is destroyed inside the transaction that
        // redeems it — so a replay finds nothing rather than enrolling twice.
        'api/v1/staff/devices/pair' => 'single-use enrolment code is already the one-time key',

        /*
         * A payment provider's callback. It is not our client — it is a bank
         * retrying until it gets a clean answer — and it will never send a
         * header we invented.
         *
         * The guarantee it needs is stronger than the header anyway and comes
         * from the data: `OnlinePaymentLedger::settle()` takes the invoice row
         * FOR UPDATE, returns the payment it already wrote, and never writes a
         * second tender. Six PerformTransaction retries produce one payment
         * row; the header could not have promised that, because Payme would
         * have sent six different keys.
         */
        'api/v1/payments/{provider}/callback' => 'a bank, not a client; settle() is idempotent under a row lock',

        // The till carries X-Pos-Local-Id, which is scoped to the terminal and
        // ordered by local_seq — a stronger guarantee than the header, and the
        // one that drains an offline queue in the order it was worked.
        'api/v1/pos/*' => 'pos.sync_entries provides terminal-scoped, ordered idempotency',

        /*
         * The bot gateway. These sit behind an internal token rather than the
         * tenant group, and the aiogram client does not send the header yet.
         *
         * Exempt rather than pretended-safe, and each for its own reason:
         * linking a Telegram id to a person is naturally idempotent (the same
         * link twice is one link), and a command log is append-only telemetry
         * where a duplicate costs a row and nothing else. `feedback` is the
         * one that genuinely needs the key — a guest rating submitted twice on
         * a flaky connection is two ratings — and it gets one as soon as the
         * bot client is taught to send it. Until then this list says so rather
         * than the route quietly slipping through.
         */
        'api/v1/bots/{botKey}/users/link' => 'linking twice is one link; naturally idempotent',
        'api/v1/bots/{botKey}/commands/log' => 'append-only telemetry; a duplicate costs one row',
        'api/v1/bots/{botKey}/feedback' => 'NEEDS A KEY — waiting on the aiogram client to send one',

        /*
         * The marketplace's consumer surface, and this one is a database fact
         * rather than a preference.
         *
         * `EnsureIdempotency` claims the key against a tenant.
         * `public.idempotency_keys` carries `tenant_id` and is behind
         * row-level security like everything else that does. A marketplace
         * customer HAS no tenant — they order from forty restaurants and belong
         * to none — so the claim would go in with `tenant_id = null` on a
         * fail-closed connection, and the policy refuses it: the write never
         * happens and a hungry person is told the platform is broken.
         *
         * So the guarantee moved into the data, exactly where the payment
         * callbacks keep theirs for the same shape of reason:
         *
         *   POST /mp/orders            unique (consumer_id, client_reference).
         *                              The app mints the reference when the
         *                              basket is created, so a replay returns
         *                              the first order rather than cooking a
         *                              second meal — and it survives the app
         *                              being killed and reopened, which a
         *                              per-request header does not.
         *   PUT  /mp/me/addresses      a PUT of the whole list. Sending it twice
         *                              leaves the same three addresses; that is
         *                              why it is not four CRUD endpoints.
         *   PATCH /mp/me               sets two fields to given values.
         *   .../cancel .../rate        refused the second time by the order's own
         *   .../dispute                state and by a unique index on the dispute.
         *   auth/otp{,/verify}         no account yet, by definition — the same
         *                              exemption /auth/login carries, with the
         *                              per-number limits in OtpCredentials doing
         *                              the work a key could not.
         */
        'api/v1/mp/*' => 'a marketplace customer has no tenant to key against; every write is idempotent in the data',
    ];

    #[Test]
    public function every_mutating_api_route_requires_an_idempotency_key(): void
    {
        $unguarded = [];

        foreach ($this->mutatingApiRoutes() as $route) {
            $uri = $route->uri();

            if ($this->isExempt($uri)) {
                continue;
            }

            if (! $this->carriesIdempotency($route)) {
                $unguarded[] = strtoupper(implode('|', $route->methods())).' /'.$uri;
            }
        }

        $this->assertSame(
            [],
            $unguarded,
            "These routes change data without requiring an idempotency key:\n  "
            .implode("\n  ", $unguarded)
            ."\n\nEither put them behind the `tenant` middleware group, or add an"
            .' entry to self::EXEMPT saying why they are safe without one.',
        );
    }

    #[Test]
    public function the_exemption_list_has_no_entries_for_routes_that_are_gone(): void
    {
        $live = array_map(static fn (Route $r): string => $r->uri(), $this->mutatingApiRoutes());
        $stale = [];

        foreach (array_keys(self::EXEMPT) as $pattern) {
            $matches = array_filter($live, fn (string $uri): bool => $this->uriMatches($pattern, $uri));

            if ($matches === []) {
                $stale[] = $pattern;
            }
        }

        $this->assertSame(
            [],
            $stale,
            'These exemptions name routes that no longer exist. Delete them, so the '
            .'list keeps meaning what it says: '.implode(', ', $stale),
        );
    }

    /** @return list<Route> */
    private function mutatingApiRoutes(): array
    {
        $safe = ['GET', 'HEAD', 'OPTIONS'];

        return array_values(array_filter(
            RouteFacade::getRoutes()->getRoutes(),
            static function (Route $route) use ($safe): bool {
                if (! str_starts_with($route->uri(), 'api/')) {
                    return false;
                }

                return array_diff($route->methods(), $safe) !== [];
            },
        ));
    }

    private function carriesIdempotency(Route $route): bool
    {
        foreach ($route->gatherMiddleware() as $middleware) {
            if ($middleware === EnsureIdempotency::class || $middleware === 'tenant') {
                return true;
            }
        }

        return false;
    }

    private function isExempt(string $uri): bool
    {
        foreach (array_keys(self::EXEMPT) as $pattern) {
            if ($this->uriMatches($pattern, $uri)) {
                return true;
            }
        }

        return false;
    }

    private function uriMatches(string $pattern, string $uri): bool
    {
        return str_ends_with($pattern, '*')
            ? str_starts_with($uri, rtrim($pattern, '*'))
            : $pattern === $uri;
    }
}
