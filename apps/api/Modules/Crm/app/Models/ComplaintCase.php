<?php

declare(strict_types=1);

namespace Modules\Crm\Models;

use App\Models\Activity;
use App\Models\Branch;
use App\Models\Concerns\BelongsToBranch;
use App\Models\Concerns\BelongsToTenant;
use App\Models\Tenant;
use App\Models\User;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Collection;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;
use Illuminate\Support\Carbon;
use Modules\Crm\Database\Factories\ComplaintCaseFactory;
use Spatie\Activitylog\LogOptions;
use Spatie\Activitylog\Traits\LogsActivity;

/**
 * An unhappy guest, and the four answers.
 *
 * `ComplaintCase` rather than `Case`, because `case` is a reserved word in PHP
 * and a class cannot be called it. The table is `crm.cases`, which is what the
 * design's module is named and what every screen says.
 *
 * @property int $id
 * @property int|null $tenant_id
 * @property int|null $branch_id
 * @property string $number
 * @property string $channel
 * @property string $kind late|missing|wrong|quality|courier
 * @property int|null $customer_id
 * @property string|null $guest_name
 * @property string|null $guest_phone
 * @property int|null $order_id
 * @property string|null $order_number
 * @property int $amount_tiyin
 * @property string|null $amount_note
 * @property string|null $quote
 * @property array<array-key, mixed>|null $photos
 * @property string $status open|in_progress|resolved|closed
 * @property int|null $assigned_to_user_id
 * @property Carbon|null $due_at
 * @property string|null $outcome refunded|partly|points|declined
 * @property int $outcome_tiyin
 * @property int|null $decided_by_user_id
 * @property Carbon|null $decided_at
 * @property int|null $feedback_id
 * @property Carbon|null $created_at
 * @property Carbon|null $updated_at
 * @property Carbon|null $deleted_at
 * @property-read Collection<int, Activity> $activities
 * @property-read int|null $activities_count
 * @property-read User|null $assignee
 * @property-read Branch|null $branch
 * @property-read Customer|null $customer
 * @property-read User|null $decidedBy
 * @property-read Collection<int, CaseEvent> $events
 * @property-read int|null $events_count
 * @property-read Feedback|null $feedback
 * @property-read Tenant|null $tenant
 * @property-read bool $is_overdue
 * @property-read bool $settles_itself
 *
 * @method static \Modules\Crm\Database\Factories\ComplaintCaseFactory factory($count = null, $state = [])
 * @method static Builder<static>|ComplaintCase newModelQuery()
 * @method static Builder<static>|ComplaintCase newQuery()
 * @method static Builder<static>|ComplaintCase onlyTrashed()
 * @method static Builder<static>|ComplaintCase open()
 * @method static Builder<static>|ComplaintCase query()
 * @method static Builder<static>|ComplaintCase withTrashed(bool $withTrashed = true)
 * @method static Builder<static>|ComplaintCase withoutTrashed()
 *
 * @mixin \Eloquent
 */
final class ComplaintCase extends Model
{
    use BelongsToBranch;
    use BelongsToTenant;

    /** @use HasFactory<ComplaintCaseFactory> */
    use HasFactory;

    use LogsActivity;
    use SoftDeletes;

    protected $table = 'crm.cases';

    public const STATUSES = ['open', 'in_progress', 'resolved', 'closed'];

    public const KINDS = ['late', 'missing', 'wrong', 'quality', 'courier'];

    public const CHANNELS = ['phone', 'web', 'bot', 'table', 'aggregator', 'courier'];

    /**
     * The four answers, most generous first.
     *
     * The order is the design's and it is not decorative: it is the order the
     * buttons are drawn in, so the cheapest answer is never the first thing
     * under somebody's thumb.
     */
    public const OUTCOMES = ['refunded', 'partly', 'points', 'declined'];

    protected $fillable = [
        'tenant_id',
        'branch_id',
        'number',
        'channel',
        'kind',
        'customer_id',
        'guest_name',
        'guest_phone',
        'order_id',
        'order_number',
        'amount_tiyin',
        'amount_note',
        'quote',
        'photos',
        'status',
        'assigned_to_user_id',
        'due_at',
        'feedback_id',
    ];

    protected function casts(): array
    {
        return [
            'photos' => 'array',
            'amount_tiyin' => 'integer',
            'outcome_tiyin' => 'integer',
            'due_at' => 'datetime',
            'decided_at' => 'datetime',
        ];
    }

    protected static function newFactory(): ComplaintCaseFactory
    {
        return ComplaintCaseFactory::new();
    }

    // ============ Relationships ============

    public function events(): HasMany
    {
        return $this->hasMany(CaseEvent::class, 'case_id')->orderBy('id');
    }

    public function customer(): BelongsTo
    {
        return $this->belongsTo(Customer::class);
    }

    public function feedback(): BelongsTo
    {
        return $this->belongsTo(Feedback::class);
    }

    public function assignee(): BelongsTo
    {
        return $this->belongsTo(User::class, 'assigned_to_user_id');
    }

    public function decidedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'decided_by_user_id');
    }

    // ============ Accessors ============

    /** Past its deadline and still unanswered. Answered late is not overdue — it is done. */
    public function isOverdue(): bool
    {
        return $this->decided_at === null
            && $this->due_at !== null
            && $this->due_at->isPast();
    }

    /**
     * Below the ceiling, so nobody has to be asked.
     *
     * `cases-data.ts` states the reasoning and it is arithmetic rather than
     * generosity: a guest who waits twenty minutes for a manager to approve a
     * 24 000 so'm refund tells a different story afterwards than one refunded in
     * ninety seconds, and the difference in what that story costs is far more
     * than 24 000 so'm.
     */
    public function settlesItself(): bool
    {
        return $this->outcome === null
            && $this->amount_tiyin <= (int) config('crm.cases.auto_refund_ceiling_tiyin');
    }

    /**
     * Half, rounded to the nearest thousand so'm.
     *
     * The console offers "refund half" as a button with the number already on
     * it, and the two have to agree to the tiyin: an answerer told 44 000 and a
     * ledger showing 44 500 is a complaint about a complaint.
     */
    public function halfOfAmount(): int
    {
        return (int) round($this->amount_tiyin / 2 / 100000) * 100000;
    }

    // ============ Scopes ============

    /** Still somebody's problem. The queue's whole query. */
    public function scopeOpen(Builder $query): Builder
    {
        return $query->whereIn('status', ['open', 'in_progress']);
    }

    // ============ Spatie ActivityLog ============

    public function getActivitylogOptions(): LogOptions
    {
        return LogOptions::defaults()
            // Money and the decision behind it. The console has its own `/audit`
            // screen and this is the log it reads.
            ->logOnly(['number', 'status', 'outcome', 'outcome_tiyin', 'assigned_to_user_id', 'decided_by_user_id'])
            ->logOnlyDirty()
            ->dontSubmitEmptyLogs()
            ->useLogName('crm.case');
    }
}
