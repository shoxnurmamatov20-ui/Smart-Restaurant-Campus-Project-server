<?php

declare(strict_types=1);

namespace Modules\Pos\Models;

use App\Models\Concerns\BelongsToTenant;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Modules\Pos\Database\Factories\PosSyncEntryFactory;

/**
 * One write a terminal made, and what came of it.
 *
 * Deliberately not an activity log: this table is read on the hot path, on
 * every single write, to answer "have I already done this one?". The row is the
 * receipt the till gets back when it replays.
 *
 * @method static PosSyncEntryFactory factory(int $count = null, array $state = [])
 */
final class PosSyncEntry extends Model
{
    /** @use HasFactory<PosSyncEntryFactory> */
    use BelongsToTenant;

    use HasFactory;

    protected $table = 'pos.sync_entries';

    public const STATUSES = ['pending', 'accepted', 'failed'];

    protected $fillable = [
        'tenant_id',
        'terminal_id',
        'local_id',
        'local_seq',
        'action',
        'payload',
        'status',
        'result',
        'error',
        'received_at',
    ];

    protected function casts(): array
    {
        return [
            'payload' => 'array',
            'result' => 'array',
            'local_seq' => 'integer',
            'terminal_id' => 'integer',
            'received_at' => 'datetime',
        ];
    }

    protected static function newFactory(): PosSyncEntryFactory
    {
        return PosSyncEntryFactory::new();
    }

    // ============ Relationships ============

    public function terminal(): BelongsTo
    {
        return $this->belongsTo(Terminal::class);
    }

    // ============ Scopes ============

    public function scopeAccepted(Builder $query): Builder
    {
        return $query->where('status', 'accepted');
    }
}
