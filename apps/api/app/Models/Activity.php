<?php

declare(strict_types=1);

namespace App\Models;

use App\Models\Concerns\BelongsToTenant;
use App\Support\Tenancy\TenantContext;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Carbon;
use Illuminate\Support\Collection;
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
 * @property int $id
 * @property string|null $log_name
 * @property string $description
 * @property string|null $subject_type
 * @property int|null $subject_id
 * @property string|null $causer_type
 * @property int|null $causer_id
 * @property Collection<array-key, mixed>|null $properties
 * @property Carbon|null $created_at
 * @property Carbon|null $updated_at
 * @property string|null $event
 * @property string|null $batch_uuid
 * @property int|null $tenant_id
 * @property-read Model|null $causer
 * @property-read Collection $changes
 * @property-read Model|null $subject
 * @property-read Tenant|null $tenant
 *
 * @method static Builder<static>|Activity causedBy(\Illuminate\Database\Eloquent\Model $causer)
 * @method static Builder<static>|Activity forBatch(string $batchUuid)
 * @method static Builder<static>|Activity forEvent(string $event)
 * @method static Builder<static>|Activity forSubject(\Illuminate\Database\Eloquent\Model $subject)
 * @method static Builder<static>|Activity hasBatch()
 * @method static Builder<static>|Activity inLog(...$logNames)
 * @method static Builder<static>|Activity newModelQuery()
 * @method static Builder<static>|Activity newQuery()
 * @method static Builder<static>|Activity platformLevel()
 * @method static Builder<static>|Activity query()
 * @method static Builder<static>|Activity whereBatchUuid($value)
 * @method static Builder<static>|Activity whereCauserId($value)
 * @method static Builder<static>|Activity whereCauserType($value)
 * @method static Builder<static>|Activity whereCreatedAt($value)
 * @method static Builder<static>|Activity whereDescription($value)
 * @method static Builder<static>|Activity whereEvent($value)
 * @method static Builder<static>|Activity whereId($value)
 * @method static Builder<static>|Activity whereLogName($value)
 * @method static Builder<static>|Activity whereProperties($value)
 * @method static Builder<static>|Activity whereSubjectId($value)
 * @method static Builder<static>|Activity whereSubjectType($value)
 * @method static Builder<static>|Activity whereTenantId($value)
 * @method static Builder<static>|Activity whereUpdatedAt($value)
 *
 * @mixin \Eloquent
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
