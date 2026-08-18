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
    private const UNSET = 'unset';

    private const TENANT = 'tenant';

    private const BYPASS = 'bypass';

    private string $mode = self::UNSET;

    private ?int $tenantId = null;

    public function __construct(private readonly bool $runningInConsole) {}

    /** Scope every policy-guarded table to one restaurant. */
    public function focus(?int $tenantId): void
    {
        if ($tenantId === null) {
            // "No tenant" is not a wider view — it is no view.
            $this->mode = self::UNSET;
            $this->tenantId = null;
        } else {
            $this->mode = self::TENANT;
            $this->tenantId = $tenantId;
        }

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
     * Re-issue the current state, for a connection that was just (re)made.
     */
    public function reapply(): void
    {
        if ($this->mode === self::UNSET && $this->runningInConsole) {
            // A console process starts open — this is what lets migrate,
            // db:seed and the queue see the whole platform without every
            // command remembering to ask.
            $this->bypass();

            return;
        }

        $this->apply();
    }

    private function apply(): void
    {
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
