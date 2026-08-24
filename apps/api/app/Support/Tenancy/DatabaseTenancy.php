<?php

declare(strict_types=1);

namespace App\Support\Tenancy;

use Illuminate\Support\Facades\DB;

/**
 * The database's copy of "which restaurant is this request".
 *
 * `BelongsToTenant` is an Eloquent scope, which means it protects exactly the
 * queries that go through Eloquent. One `DB::table()` in a report, one raw
 * join in an export, one forgotten scope in a new module — and the query reads
 * every restaurant on the platform. Row-level security is the second belt:
 * the same rule, enforced by PostgreSQL, on queries this codebase has not
 * written yet.
 *
 * The rule rides in two GUCs. `app.tenant_id` scopes every policy-guarded
 * table to one tenant; `app.bypass_tenancy = 'on'` opens them all, and is for
 * the callers whose job is cross-tenant: console commands (migrations,
 * seeders, the outbox relay, queue workers) and the platform operator. With
 * neither set the policies answer NO ROWS — fail closed, so the forgotten
 * case is the safe case.
 *
 * This class is the only writer of those GUCs. It keeps what it last applied
 * so a mid-request reconnect can be given the same answer (see the
 * ConnectionEstablished listener in AppServiceProvider) — a session variable
 * dies with its connection, and a pool that reconnects silently would
 * otherwise downgrade a scoped request to no-rows.
 *
 * Deliberately separate from TenantContext: that class is pure state and is
 * constructed in unit tests that have no database at all.
 */
final class DatabaseTenancy
{
    /** Nothing has claimed this connection yet — the resting state. */
    private const UNSET = 'unset';

    /**
     * Claimed and deliberately shut.
     *
     * Distinct from UNSET because a reconnect must not reopen it. `reapply()`
     * treats an unclaimed console connection as "open it" — which is what lets
     * migrations and seeders work — and that would silently undo a close if the
     * two states were the same value.
     */
    private const CLOSED = 'closed';

    private const TENANT = 'tenant';

    private const BYPASS = 'bypass';

    private string $mode = self::UNSET;

    private ?int $tenantId = null;

    /**
     * What the connection was last actually told, or null if nothing yet.
     *
     * The GUCs are session-scoped and this class is their only writer, so
     * re-sending a value the session already holds is a wasted round trip.
     * With the request now opening on close() and closing on reset(), an
     * unguarded apply() spent three round trips per request on bookkeeping —
     * the public menu's query budget caught it at five queries for a cached
     * page. A reconnect makes this stale, which is exactly what reapply()
     * exists for, and it forces.
     *
     * @var array{string, int|null}|null
     */
    private ?array $applied = null;

    public function __construct(private readonly bool $runningInConsole) {}

    /** Scope every policy-guarded table to one restaurant. */
    public function focus(?int $tenantId): void
    {
        if ($tenantId === null) {
            // "No tenant" is not a wider view — it is no view.
            $this->close();

            return;
        }

        $this->mode = self::TENANT;
        $this->tenantId = $tenantId;
        $this->apply();
    }

    /**
     * No tenant, no rows — whatever the process's resting state is.
     *
     * Distinct from reset(): that one returns to the resting state, which in a
     * console process is bypass. This one CLOSES, and is what a request with no
     * resolvable tenant needs regardless of where it is running.
     */
    public function close(): void
    {
        $this->mode = self::CLOSED;
        $this->tenantId = null;
        $this->apply();
    }

    /** Open every table: migrations, seeders, relays, the platform operator. */
    public function bypass(): void
    {
        $this->mode = self::BYPASS;
        $this->tenantId = null;
        $this->apply();
    }

    /**
     * Back to the resting state — which depends on where we are running.
     *
     * Over HTTP that is fail-closed, so a request that never resolves a tenant
     * reads nothing. In a console process it is bypass, because the process
     * between requests IS the console: PHPUnit asserting on rows after a
     * simulated request, a seeder between two model events. Fail-closed there
     * would make every such read silently empty.
     */
    public function reset(): void
    {
        if ($this->runningInConsole) {
            $this->bypass();

            return;
        }

        $this->mode = self::UNSET;
        $this->tenantId = null;
        $this->apply();
    }

    /**
     * Run one piece of work with every tenant visible, then put it back.
     *
     * For the reads that genuinely cannot know their tenant yet. There is
     * exactly one today — pairing a terminal looks a code up across the whole
     * platform, because the device has no credentials and the code is the only
     * thing it can offer. `TerminalPairing` already drops the Eloquent tenant
     * scope for that reason; this is the same exception at the database level.
     *
     * Narrow on purpose: it takes a closure rather than being a pair of
     * open/close calls, so an early return or a thrown exception cannot leave a
     * request running with the whole platform visible.
     *
     * @template TReturn
     *
     * @param \Closure(): TReturn $work
     *
     * @return TReturn
     */
    public function withoutTenancy(\Closure $work): mixed
    {
        $mode = $this->mode;
        $tenantId = $this->tenantId;

        $this->bypass();

        try {
            return $work();
        } finally {
            $this->mode = $mode;
            $this->tenantId = $tenantId;
            $this->apply();
        }
    }

    /**
     * Run something as one restaurant, then put the connection back.
     *
     * The mirror of `withoutTenancy()`, and it exists for the same shape of
     * caller: a queue worker or a relay, which has no request behind it and
     * therefore no `app.tenant_id`. Row-level security fails CLOSED in that
     * state — every query reads zero rows — so a background job that forgot
     * this does not crash, it quietly does nothing, for every restaurant, until
     * somebody notices the notifications stopped.
     *
     * A closure rather than an open/close pair, so an early return or a thrown
     * exception cannot leave a worker pinned to the last restaurant it happened
     * to serve.
     *
     * @template TReturn
     *
     * @param \Closure(): TReturn $work
     *
     * @return TReturn
     */
    public function focusDuring(int $tenantId, \Closure $work): mixed
    {
        $mode = $this->mode;
        $previous = $this->tenantId;

        $this->focus($tenantId);

        try {
            return $work();
        } finally {
            $this->mode = $mode;
            $this->tenantId = $previous;
            $this->apply();
        }
    }

    /**
     * Re-issue the current state, for a connection that was just (re)made.
     */
    public function reapply(): void
    {
        // A new connection holds none of the old session's settings, so this is
        // the one caller that must write even when nothing changed.
        $this->applied = null;

        if ($this->mode === self::UNSET && $this->runningInConsole) {
            // A console process starts open — this is what lets migrate,
            // db:seed and the queue see the whole platform without every
            // command remembering to ask.
            $this->bypass();

            return;
        }

        $this->apply();
    }

    private function apply(bool $force = false): void
    {
        if (! $force && $this->applied === [$this->mode, $this->tenantId]) {
            return;
        }

        $this->applied = [$this->mode, $this->tenantId];

        // One round trip for both settings. Session-scoped (is_local = false):
        // request lifecycles are longer than any one transaction, and the
        // reset()/reapply() pair owns the boundaries.
        DB::select(
            'select set_config(?, ?, false), set_config(?, ?, false)',
            [
                'app.tenant_id', $this->mode === self::TENANT ? (string) $this->tenantId : '',
                'app.bypass_tenancy', $this->mode === self::BYPASS ? 'on' : '',
            ],
        );
    }
}
