<?php

declare(strict_types=1);

namespace Modules\Pos\Models;

use App\Models\Concerns\BelongsToTenant;
use App\Models\Tenant;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Carbon;
use Modules\Pos\Database\Factories\PosSyncEntryFactory;

/**
 * One write a terminal made, and what came of it.
 *
 * Deliberately not an activity log: this table is read on the hot path, on
 * every single write, to answer "have I already done this one?". The row is the
 * receipt the till gets back when it replays.
 *
 * @property int $id
 * @property int|null $tenant_id
 * @property int $terminal_id
 * @property string $local_id Generated on the device, before it knew whether it was online
 * @property int $local_seq Device-local order, so a replay applies in the sequence it happened
 * @property string $action bill.open, bill.line.add, bill.tender, …
 * @property array<array-key, mixed>|null $payload
 * @property string $status pending|accepted|failed
 * @property array<array-key, mixed>|null $result What the first attempt returned — replayed verbatim
 * @property string|null $error
 * @property Carbon|null $received_at
 * @property Carbon|null $created_at
 * @property Carbon|null $updated_at
 * @property-read Tenant|null $tenant
 * @property-read Terminal|null $terminal
 *
 * @method static Builder<static>|PosSyncEntry accepted()
 * @method static \Modules\Pos\Database\Factories\PosSyncEntryFactory factory($count = null, $state = [])
 * @method static Builder<static>|PosSyncEntry newModelQuery()
 * @method static Builder<static>|PosSyncEntry newQuery()
 * @method static Builder<static>|PosSyncEntry query()
 * @method static Builder<static>|PosSyncEntry whereAction($value)
 * @method static Builder<static>|PosSyncEntry whereCreatedAt($value)
 * @method static Builder<static>|PosSyncEntry whereError($value)
 * @method static Builder<static>|PosSyncEntry whereId($value)
 * @method static Builder<static>|PosSyncEntry whereLocalId($value)
 * @method static Builder<static>|PosSyncEntry whereLocalSeq($value)
 * @method static Builder<static>|PosSyncEntry wherePayload($value)
 * @method static Builder<static>|PosSyncEntry whereReceivedAt($value)
 * @method static Builder<static>|PosSyncEntry whereResult($value)
 * @method static Builder<static>|PosSyncEntry whereStatus($value)
 * @method static Builder<static>|PosSyncEntry whereTenantId($value)
 * @method static Builder<static>|PosSyncEntry whereTerminalId($value)
 * @method static Builder<static>|PosSyncEntry whereUpdatedAt($value)
 *
 * @mixin \Eloquent
 */
final class PosSyncEntry extends Model
{
    use BelongsToTenant;

    /** @use HasFactory<PosSyncEntryFactory> */
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
