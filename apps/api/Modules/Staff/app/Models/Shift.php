<?php

declare(strict_types=1);

namespace Modules\Staff\Models;

use App\Models\Concerns\BelongsToBranch;
use App\Models\Concerns\BelongsToTenant;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Casts\Attribute;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\SoftDeletes;
use Modules\Staff\Database\Factories\ShiftFactory;
use Spatie\Activitylog\LogOptions;
use Spatie\Activitylog\Traits\LogsActivity;

/**
 * A planned working slot on the rota.
 *
 * @method static ShiftFactory factory(int $count = null, array $state = [])
 */
final class Shift extends Model
{
    use BelongsToBranch;
    use BelongsToTenant;

    /** @use HasFactory<ShiftFactory> */
    use HasFactory;

    use LogsActivity;
    use SoftDeletes;

    protected $table = 'staff.shifts';

    public const STATUSES = ['planned', 'confirmed', 'swapped', 'cancelled'];

    protected $fillable = [
        'tenant_id',
        'staff_member_id',
        'starts_at',
        'ends_at',
        'role',
        'status',
        'note',
    ];

    protected function casts(): array
    {
        return [
            'starts_at' => 'datetime',
            'ends_at' => 'datetime',
        ];
    }

    protected static function newFactory(): ShiftFactory
    {
        return ShiftFactory::new();
    }

    // ============ Relationships ============

    public function member(): BelongsTo
    {
        return $this->belongsTo(StaffMember::class, 'staff_member_id');
    }

    // ============ Accessors ============

    protected function plannedHours(): Attribute
    {
        return Attribute::get(fn (): float => $this->starts_at && $this->ends_at
            ? round($this->starts_at->diffInMinutes($this->ends_at) / 60, 2)
            : 0.0);
    }

    // ============ Scopes ============

    public function scopeUpcoming(Builder $query): Builder
    {
        return $query->where('starts_at', '>=', now())->whereIn('status', ['planned', 'confirmed']);
    }

    // ============ Spatie ActivityLog ============

    public function getActivitylogOptions(): LogOptions
    {
        return LogOptions::defaults()
            ->logOnly(['tenant_id', 'staff_member_id', 'starts_at', 'ends_at', 'status'])
            ->logOnlyDirty()
            ->dontSubmitEmptyLogs()
            ->useLogName('staff.shift');
    }
}
