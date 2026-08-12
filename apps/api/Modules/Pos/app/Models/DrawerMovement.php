<?php

declare(strict_types=1);

namespace Modules\Pos\Models;

use App\Models\Concerns\BelongsToTenant;
use App\Models\User;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Casts\Attribute;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Modules\Pos\Database\Factories\DrawerMovementFactory;
use Spatie\Activitylog\LogOptions;
use Spatie\Activitylog\Traits\LogsActivity;

/**
 * Cash physically entering or leaving a drawer.
 *
 * @method static DrawerMovementFactory factory(int $count = null, array $state = [])
 */
final class DrawerMovement extends Model
{
    /** @use HasFactory<DrawerMovementFactory> */
    use BelongsToTenant;

    use HasFactory;
    use LogsActivity;

    protected $table = 'pos.drawer_movements';

    public const KINDS = ['opening_float', 'cash_in', 'cash_out', 'collection', 'tip_out', 'correction'];

    /** Which way the money goes, per kind. Not a caller's choice. */
    public const DIRECTIONS = [
        'opening_float' => 'in',
        'cash_in' => 'in',
        'cash_out' => 'out',
        'collection' => 'out',
        'tip_out' => 'out',
        'correction' => 'in',
    ];

    protected $fillable = [
        'tenant_id',
        'terminal_id',
        'session_id',
        'user_id',
        'cash_shift_id',
        'finance_expense_id',
        'kind',
        'amount',
        'direction',
        'reason',
        'approval_id',
        'occurred_at',
    ];

    protected function casts(): array
    {
        return [
            'amount' => 'integer',
            'terminal_id' => 'integer',
            'session_id' => 'integer',
            'user_id' => 'integer',
            'cash_shift_id' => 'integer',
            'finance_expense_id' => 'integer',
            'approval_id' => 'integer',
            'occurred_at' => 'datetime',
        ];
    }

    protected static function newFactory(): DrawerMovementFactory
    {
        return DrawerMovementFactory::new();
    }

    // ============ Relationships ============

    public function terminal(): BelongsTo
    {
        return $this->belongsTo(Terminal::class);
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function approval(): BelongsTo
    {
        return $this->belongsTo(PosApproval::class, 'approval_id');
    }

    // ============ Accessors ============

    /** Positive into the drawer, negative out of it — for summing, not storing. */
    protected function signedAmount(): Attribute
    {
        return Attribute::get(fn (): int => $this->direction === 'out' ? -$this->amount : $this->amount);
    }

    // ============ Scopes ============

    public function scopeForShift(Builder $query, int $cashShiftId): Builder
    {
        return $query->where('cash_shift_id', $cashShiftId);
    }

    public function scopeOutgoing(Builder $query): Builder
    {
        return $query->where('direction', 'out');
    }

    // ============ Spatie ActivityLog ============

    public function getActivitylogOptions(): LogOptions
    {
        return LogOptions::defaults()
            ->logOnly(['tenant_id', 'terminal_id', 'cash_shift_id', 'kind', 'amount', 'direction', 'reason', 'user_id'])
            ->logOnlyDirty()
            ->dontSubmitEmptyLogs()
            ->useLogName('pos.drawer');
    }
}
