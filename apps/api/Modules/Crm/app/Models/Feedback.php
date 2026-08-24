<?php

declare(strict_types=1);

namespace Modules\Crm\Models;

use App\Models\Activity;
use App\Models\Concerns\BelongsToTenant;
use App\Models\Tenant;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Collection;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\SoftDeletes;
use Illuminate\Support\Carbon;
use Modules\Crm\Database\Factories\FeedbackFactory;
use Spatie\Activitylog\LogOptions;
use Spatie\Activitylog\Traits\LogsActivity;

/**
 * What a guest thought. One-star reviews are cheap to read; the pattern in the three-star ones is not.
 *
 * @property int $id
 * @property int|null $tenant_id
 * @property int|null $customer_id
 * @property int|null $order_id
 * @property int|null $table_id
 * @property string|null $order_number
 * @property string|null $guest_name
 * @property string|null $guest_phone
 * @property int $score 1..5
 * @property string|null $comment
 * @property string|null $aspect food
 * @property string $source bot
 * @property bool $is_urgent Food safety, injury or abuse — a manager must see it now
 * @property string $status new
 * @property Carbon|null $resolved_at
 * @property Carbon|null $created_at
 * @property Carbon|null $updated_at
 * @property Carbon|null $deleted_at
 * @property-read Collection<int, Activity> $activities
 * @property-read int|null $activities_count
 * @property-read Customer|null $customer
 * @property-read Tenant|null $tenant
 *
 * @method static \Modules\Crm\Database\Factories\FeedbackFactory factory($count = null, $state = [])
 * @method static Builder<static>|Feedback negative()
 * @method static Builder<static>|Feedback newModelQuery()
 * @method static Builder<static>|Feedback newQuery()
 * @method static Builder<static>|Feedback onlyTrashed()
 * @method static Builder<static>|Feedback query()
 * @method static Builder<static>|Feedback unresolved()
 * @method static Builder<static>|Feedback whereAspect($value)
 * @method static Builder<static>|Feedback whereComment($value)
 * @method static Builder<static>|Feedback whereCreatedAt($value)
 * @method static Builder<static>|Feedback whereCustomerId($value)
 * @method static Builder<static>|Feedback whereDeletedAt($value)
 * @method static Builder<static>|Feedback whereId($value)
 * @method static Builder<static>|Feedback whereIsUrgent($value)
 * @method static Builder<static>|Feedback whereOrderId($value)
 * @method static Builder<static>|Feedback whereResolvedAt($value)
 * @method static Builder<static>|Feedback whereScore($value)
 * @method static Builder<static>|Feedback whereSource($value)
 * @method static Builder<static>|Feedback whereStatus($value)
 * @method static Builder<static>|Feedback whereTenantId($value)
 * @method static Builder<static>|Feedback whereUpdatedAt($value)
 * @method static Builder<static>|Feedback withTrashed(bool $withTrashed = true)
 * @method static Builder<static>|Feedback withoutTrashed()
 *
 * @mixin \Eloquent
 */
final class Feedback extends Model
{
    use BelongsToTenant;

    /** @use HasFactory<FeedbackFactory> */
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
        /*
         * The three a review left at a table brings instead of an account.
         *
         * `table_id` says where it happened, `order_number` is what the guest
         * can actually read off their receipt, and the two guest fields are so
         * a manager can ring back about a one-star. None is required: a form
         * that demands a phone number collects fewer complaints, which reads on
         * a dashboard as a better week.
         */
        'table_id',
        'order_number',
        'guest_name',
        'guest_phone',
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
