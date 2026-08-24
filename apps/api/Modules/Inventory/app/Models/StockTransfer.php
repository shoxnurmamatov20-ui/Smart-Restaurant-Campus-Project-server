<?php

declare(strict_types=1);

namespace Modules\Inventory\Models;

use App\Models\Activity;
use App\Models\Branch;
use App\Models\Concerns\BelongsToTenant;
use App\Models\Tenant;
use App\Models\User;
use App\Support\Counters\BranchCounters;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Casts\Attribute;
use Illuminate\Database\Eloquent\Collection;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Spatie\Activitylog\LogOptions;
use Spatie\Activitylog\Traits\LogsActivity;

/**
 * Stock leaving one venue for another.
 *
 * Deliberately NOT `BelongsToBranch`, and this is the model where that matters
 * most: a transfer belongs to TWO venues, and a global scope keyed on one
 * `branch_id` column would hide from Termiz the twenty-five kilos Chilonzor
 * sent it. Both ends are foreign keys and both ends can query — see
 * `scopeTouching()`, which is what the operations screen actually asks.
 *
 * @property int $id
 * @property int|null $tenant_id
 * @property string $number
 * @property int $from_branch_id
 * @property int $to_branch_id
 * @property string $status draft | sent | received
 * @property string|null $note
 * @property int|null $created_by
 * @property Carbon|null $sent_at
 * @property Carbon|null $received_at
 * @property Carbon|null $created_at
 * @property Carbon|null $updated_at
 * @property-read Collection<int, Activity> $activities
 * @property-read int|null $activities_count
 * @property-read Branch|null $fromBranch
 * @property-read Branch|null $toBranch
 * @property-read User|null $author
 * @property-read Collection<int, StockTransferLine> $lines
 * @property-read int|null $lines_count
 * @property-read int $value_tiyin
 * @property-read Tenant|null $tenant
 *
 * @method static Builder<static>|StockTransfer newModelQuery()
 * @method static Builder<static>|StockTransfer newQuery()
 * @method static Builder<static>|StockTransfer query()
 * @method static Builder<static>|StockTransfer touching(int $branchId)
 *
 * @mixin \Eloquent
 */
final class StockTransfer extends Model
{
    use BelongsToTenant;
    use LogsActivity;

    protected $table = 'inventory.stock_transfers';

    /**
     * Three, and all three are reachable.
     *
     * `draft` is written and nothing moves; `sent` posts the out-leg at the
     * origin; `received` posts the in-leg at the destination. The gap between
     * the last two is the van, and stock inside it belongs to neither shelf.
     */
    public const STATUSES = ['draft', 'sent', 'received'];

    protected $fillable = [
        'tenant_id',
        'number',
        'from_branch_id',
        'to_branch_id',
        'status',
        'note',
        'created_by',
        'sent_at',
        'received_at',
    ];

    protected function casts(): array
    {
        return [
            'sent_at' => 'datetime',
            'received_at' => 'datetime',
        ];
    }

    // ============ Relationships ============

    public function lines(): HasMany
    {
        return $this->hasMany(StockTransferLine::class);
    }

    public function fromBranch(): BelongsTo
    {
        return $this->belongsTo(Branch::class, 'from_branch_id');
    }

    public function toBranch(): BelongsTo
    {
        return $this->belongsTo(Branch::class, 'to_branch_id');
    }

    public function author(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    // ============ Domain behaviour ============

    /**
     * The next transfer number for this restaurant.
     *
     * One sequence for the business rather than one per venue: a transfer has
     * two venues and numbering it from either end would give Chilonzor's
     * TRF-0012 and Termiz's TRF-0012 to two different vans. See BranchCounters.
     */
    public static function nextNumber(): string
    {
        return sprintf('TRF-%04d', app(BranchCounters::class)->next('stock_transfer.number'));
    }

    /**
     * Stock leaves the origin. Nothing arrives anywhere yet.
     *
     * The out-leg is posted here rather than on receipt because the shelf it
     * left is empty from the moment the van pulls away — a Chilonzor cook
     * planning tonight's service must not still see the rice that is halfway to
     * Termiz. What is deliberately NOT posted is the in-leg: until somebody at
     * the far end counts the boxes, the stock is in the van and belongs to
     * neither shelf.
     */
    public function send(): void
    {
        DB::transaction(function (): void {
            foreach ($this->lines as $line) {
                $line->ingredient?->move(
                    'transfer',
                    -$line->quantity,
                    null,
                    $this->number,
                    $this->from_branch_id,
                );
            }

            $this->forceFill(['status' => 'sent', 'sent_at' => now()])->save();
        });
    }

    /** The boxes were counted at the far end. */
    public function receive(): void
    {
        DB::transaction(function (): void {
            foreach ($this->lines as $line) {
                $line->ingredient?->move(
                    'transfer',
                    $line->quantity,
                    null,
                    $this->number,
                    $this->to_branch_id,
                );
            }

            $this->forceFill(['status' => 'received', 'received_at' => now()])->save();
        });
    }

    // ============ Accessors ============

    /** What the whole van is worth, in tiyin. */
    protected function valueTiyin(): Attribute
    {
        return Attribute::get(fn (): int => (int) $this->lines->sum(
            static fn (StockTransferLine $line): int => $line->quantity * $line->unit_cost_tiyin,
        ));
    }

    // ============ Scopes ============

    /**
     * Transfers this venue is either end of.
     *
     * @param  Builder<StockTransfer>  $query
     * @return Builder<StockTransfer>
     */
    public function scopeTouching(Builder $query, int $branchId): Builder
    {
        return $query->where(static function (Builder $inner) use ($branchId): void {
            $inner->where('from_branch_id', $branchId)->orWhere('to_branch_id', $branchId);
        });
    }

    // ============ Spatie ActivityLog ============

    public function getActivitylogOptions(): LogOptions
    {
        return LogOptions::defaults()
            ->logOnly(['tenant_id', 'number', 'from_branch_id', 'to_branch_id', 'status'])
            ->logOnlyDirty()
            ->dontSubmitEmptyLogs()
            ->useLogName('inventory.stock_transfer');
    }
}
