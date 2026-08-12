<?php

declare(strict_types=1);

namespace App\Models;

use App\Models\Concerns\BelongsToTenant;
use App\Support\Tenancy\TenantContext;
use Illuminate\Database\Eloquent\Builder;
use Spatie\Activitylog\Models\Activity as SpatieActivity;

/**
 * One line of the audit trail.
 *
 * Spatie's model with a restaurant attached, so the log obeys the same
 * isolation rule as the data it describes. Registered through
 * `config/activitylog.php`, which means every `->logOnly()` model across all
 * eleven modules writes tenant-stamped rows without knowing this class exists.
 *
 * Audit entries are append-only by intent: nothing in the application updates
 * or deletes them, and the API exposes reads only.
 *
 * @property int|null $tenant_id
 * @property string|null $log_name
 * @property string $description
 * @property string|null $event
 * @property array<string, mixed>|null $properties
 */
final class Activity extends SpatieActivity
{
    use BelongsToTenant;

    /**
     * Stamp the restaurant before the row is written.
     *
     * The request's tenant context is the normal source. A queued job or a
     * console command has none, so the subject is asked instead — an order
     * knows which restaurant it belongs to even when nothing else does.
     */
    protected static function booted(): void
    {
        self::creating(static function (self $activity): void {
            if ($activity->tenant_id !== null) {
                return;
            }

            $activity->tenant_id = app(TenantContext::class)->id()
                ?? self::tenantOf($activity, 'subject')
                ?? self::tenantOf($activity, 'causer');
        });
    }

    private static function tenantOf(self $activity, string $relation): ?int
    {
        $related = $activity->getRelationValue($relation);
        $tenantId = $related?->getAttribute('tenant_id');

        return is_int($tenantId) ? $tenantId : null;
    }

    /** Entries the platform recorded outside any single restaurant. */
    public function scopePlatformLevel(Builder $query): void
    {
        $query->whereNull('tenant_id');
    }
}
