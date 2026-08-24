<?php

declare(strict_types=1);

namespace Modules\Crm\Models;

use App\Models\Concerns\BelongsToTenant;
use App\Models\Tenant;
use App\Models\User;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Carbon;
use Modules\Crm\Database\Factories\CaseEventFactory;

/**
 * One line of a complaint's history. Append-only: written once, never updated.
 *
 * `UPDATED_AT = null` rather than a `$timestamps = false` on the whole model,
 * because `created_at` is the column the history is read in order by and it
 * must be filled. A history row that can be edited is not a history.
 *
 * @property int $id
 * @property int|null $tenant_id
 * @property int $case_id
 * @property int|null $user_id
 * @property string $kind opened|assigned|note|status|decided
 * @property string|null $from_value
 * @property string|null $to_value
 * @property string|null $note
 * @property Carbon|null $created_at
 * @property-read ComplaintCase $complaintCase
 * @property-read Tenant|null $tenant
 * @property-read User|null $user
 *
 * @method static \Modules\Crm\Database\Factories\CaseEventFactory factory($count = null, $state = [])
 * @method static Builder<static>|CaseEvent newModelQuery()
 * @method static Builder<static>|CaseEvent newQuery()
 * @method static Builder<static>|CaseEvent query()
 *
 * @mixin \Eloquent
 */
final class CaseEvent extends Model
{
    use BelongsToTenant;

    /** @use HasFactory<CaseEventFactory> */
    use HasFactory;

    public const UPDATED_AT = null;

    protected $table = 'crm.case_events';

    public const KINDS = ['opened', 'assigned', 'note', 'status', 'decided'];

    protected $fillable = [
        'tenant_id',
        'case_id',
        'user_id',
        'kind',
        'from_value',
        'to_value',
        'note',
    ];

    protected static function newFactory(): CaseEventFactory
    {
        return CaseEventFactory::new();
    }

    public function complaintCase(): BelongsTo
    {
        return $this->belongsTo(ComplaintCase::class, 'case_id');
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
