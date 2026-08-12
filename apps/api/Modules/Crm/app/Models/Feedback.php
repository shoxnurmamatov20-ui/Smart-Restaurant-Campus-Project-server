<?php

declare(strict_types=1);

namespace Modules\Crm\Models;

use App\Models\Concerns\BelongsToTenant;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\SoftDeletes;
use Modules\Crm\Database\Factories\FeedbackFactory;
use Spatie\Activitylog\LogOptions;
use Spatie\Activitylog\Traits\LogsActivity;

/**
 * What a guest thought. One-star reviews are cheap to read; the pattern in the three-star ones is not.
 *
 * @method static FeedbackFactory factory(int $count = null, array $state = [])
 */
final class Feedback extends Model
{
    /** @use HasFactory<FeedbackFactory> */
    use BelongsToTenant;

    use HasFactory;
    use LogsActivity;
    use SoftDeletes;

    protected $table = 'crm.feedbacks';

    public const STATUSES = ['new', 'in_review', 'resolved', 'dismissed'];

    public const SOURCES = ['bot', 'web', 'qr', 'aggregator'];

    protected $fillable = [
        'tenant_id',
        'customer_id',
        'order_id',
        'score',
        'comment',
        'aspect',
        'source',
        'is_urgent',
        'status',
        'resolved_at',
    ];

    protected function casts(): array
    {
        return [
            'is_urgent' => 'boolean',
            'score' => 'integer',
            'resolved_at' => 'datetime',
        ];
    }

    protected static function newFactory(): FeedbackFactory
    {
        return FeedbackFactory::new();
    }

    // ============ Relationships ============

    public function customer(): BelongsTo
    {
        return $this->belongsTo(Customer::class);
    }

    // ============ Domain behaviour ============

    public function resolve(): bool
    {
        return $this->update(['status' => 'resolved', 'resolved_at' => now()]);
    }

    // ============ Scopes ============

    public function scopeUnresolved(Builder $query): Builder
    {
        return $query->whereIn('status', ['new', 'in_review']);
    }

    public function scopeNegative(Builder $query): Builder
    {
        return $query->where('score', '<=', 2);
    }

    // ============ Spatie ActivityLog ============

    public function getActivitylogOptions(): LogOptions
    {
        return LogOptions::defaults()
            ->logOnly(['tenant_id', 'customer_id', 'score', 'aspect', 'is_urgent', 'status'])
            ->logOnlyDirty()
            ->dontSubmitEmptyLogs()
            ->useLogName('crm.feedback');
    }
}
