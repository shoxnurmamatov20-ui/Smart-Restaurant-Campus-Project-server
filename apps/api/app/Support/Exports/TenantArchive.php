<?php

declare(strict_types=1);

namespace App\Support\Exports;

use App\Jobs\ExportTenantData;
use App\Models\Tenant;
use App\Models\TenantExport;
use App\Models\User;
use App\Support\Errors\ApiException;
use Carbon\CarbonImmutable;
use Illuminate\Support\Facades\URL;

/**
 * Asking for — and describing — a restaurant's full data export.
 *
 * Two doors lead here and they must not diverge: the platform operator acting
 * on a customer's behalf (`platform/tenants/{tenant}/export`) and the owner
 * asking for their own copy (`settings/export`). Same job, same row, same
 * shape on the wire; the only difference is which restaurant the caller is
 * allowed to name, and the routes settle that before this class is reached.
 *
 * A second definition of "queue an export" is how the two ends up producing
 * different archives — or, worse, how one of them quietly stops checking
 * whether a walk is already running.
 */
final class TenantArchive
{
    /** How many past requests a console screen is shown. Nobody scrolls further. */
    private const HISTORY = 50;

    /** The route the signed download link points at. */
    public const DOWNLOAD_ROUTE = 'api.v1.exports.download';

    /**
     * Put one restaurant's archive in the queue.
     *
     * @throws ApiException when a walk is already under way for this restaurant
     */
    public function queue(Tenant $tenant, ?User $requestedBy): TenantExport
    {
        $tenantId = (int) $tenant->getKey();

        /*
         * One walk at a time per restaurant.
         *
         * Not politeness — arithmetic. A full walk reads every table the
         * restaurant owns and writes a zip of all of it, so a double-click on
         * the console button is two full table scans and two copies of the same
         * archive on disk. The second one also finishes second and wins the
         * "latest" slot with data read a minute later, which is the kind of
         * difference nobody can explain afterwards.
         */
        $alreadyRunning = TenantExport::query()
            ->where('tenant_id', $tenantId)
            ->whereIn('state', [TenantExport::QUEUED, TenantExport::RUNNING])
            ->exists();

        if ($alreadyRunning) {
            throw ApiException::of('export.already_running');
        }

        $export = new TenantExport;

        /*
         * `tenant_id` set by hand rather than left to BelongsToTenant.
         *
         * The trait fills it from the request's tenant, and the platform
         * operator has none — they belong to no restaurant, which is the whole
         * point of the role. On that path the row would go in with a null
         * tenant and be refused by the policy on the way back out.
         */
        $export->forceFill([
            'tenant_id' => $tenantId,
            'requested_by' => $requestedBy?->getKey(),
            'state' => TenantExport::QUEUED,
            'requested_at' => CarbonImmutable::now(),
        ])->save();

        // Who asked for a copy of an entire restaurant's history, and when.
        // The archive expires in a day; this line does not.
        activity('tenant.export')
            ->performedOn($tenant)
            ->causedBy($requestedBy)
            ->withProperties(['export_id' => $export->getKey(), 'restaurant' => $tenant->slug])
            ->log('tenant.export.requested');

        ExportTenantData::dispatch((int) $export->getKey());

        /*
         * Re-read rather than return what was just written.
         *
         * On a real queue this comes back `queued`, which is what the console
         * expects. On the sync driver — tests, and `queue:work --once` — the
         * job has already run by the time dispatch() returns, and the honest
         * answer is `ready` with a link in it. Reporting the state the row
         * actually holds is right in both cases; reporting a hard-coded
         * `queued` would be a lie in one of them.
         */
        return $export->refresh();
    }

    /**
     * One restaurant's export history, newest first.
     *
     * @return list<array<string, mixed>>
     */
    public function listFor(Tenant $tenant): array
    {
        return TenantExport::query()
            // Explicit, even though the global scope and the policy both narrow
            // this already: on the platform operator's connection neither does
            // — they are cross-tenant by definition — and this endpoint answers
            // for exactly one restaurant.
            ->where('tenant_id', (int) $tenant->getKey())
            ->orderByDesc('requested_at')
            ->orderByDesc('id')
            ->limit(self::HISTORY)
            ->get()
            ->map(fn (TenantExport $export): array => $this->row($export))
            ->all();
    }

    /**
     * One export, as both consoles draw it.
     *
     * @return array<string, mixed>
     */
    public function row(TenantExport $export): array
    {
        $downloadable = $export->isDownloadable();

        return [
            'id' => (int) $export->getKey(),
            'state' => $export->state,
            'requested_at' => $export->requested_at->toIso8601String(),
            'completed_at' => $export->completed_at?->toIso8601String(),
            'size_bytes' => $export->size_bytes,
            'tables' => $export->tables,
            'rows' => $export->rows_count,
            'error' => $export->error,
            'url' => $downloadable ? $this->link($export) : null,
            // Null unless there is something to expire. A queued export has no
            // deadline yet, and an expired one has no future to report.
            'expires_at' => $downloadable ? $export->expires_at?->toIso8601String() : null,
        ];
    }

    /**
     * The signed link, valid exactly as long as the file behind it.
     *
     * The signature's expiry is the row's `expires_at` and NOT "now plus
     * twenty-four hours". Minting a fresh day of validity every time the list
     * is refreshed would let a link handed out in hour 23 keep working long
     * after the retention sweep removed the archive — a URL that outlives its
     * file answers 404, and a page that keeps re-issuing it never stops
     * offering the download.
     */
    private function link(TenantExport $export): ?string
    {
        if ($export->expires_at === null) {
            return null;
        }

        return URL::temporarySignedRoute(
            self::DOWNLOAD_ROUTE,
            $export->expires_at,
            ['export' => (int) $export->getKey()],
        );
    }
}
