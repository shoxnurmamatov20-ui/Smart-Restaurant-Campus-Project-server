<?php

declare(strict_types=1);

namespace App\Models;

use App\Models\Concerns\BelongsToTenant;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Carbon;

/**
 * One operator, inside one restaurant's account, for fifteen minutes.
 *
 * A row rather than a log line, because this is the most powerful thing the
 * product can do and it has to be answerable years later: who, whose, when,
 * and — the field that makes the rest worth having — why.
 *
 * `reason` has no default and cannot be empty. That is the design, not a
 * validation preference: a column that may be blank is a column that always is.
 *
 * @property int $id
 * @property int $tenant_id
 * @property int $operator_user_id
 * @property int $target_user_id
 * @property string $reason
 * @property int|null $token_id
 * @property Carbon $expires_at
 * @property Carbon|null $ended_at
 * @property string|null $ip
 * @property Carbon|null $created_at
 * @property Carbon|null $updated_at
 * @property-read Tenant|null $tenant
 *
 * @method static Builder<static>|Impersonation newModelQuery()
 * @method static Builder<static>|Impersonation newQuery()
 * @method static Builder<static>|Impersonation query()
 *
 * @mixin \Eloquent
 */
#[Fillable([
    'tenant_id', 'operator_user_id', 'target_user_id', 'reason',
    'token_id', 'expires_at', 'ended_at', 'ip',
])]
final class Impersonation extends Model
{
    use BelongsToTenant;

    /**
     * Fifteen minutes.
     *
     * Long enough to reproduce what a restaurant reported, short enough that a
     * laptop left open in a coffee shop is not a standing key to somebody's
     * business. The platform's own session is thirty minutes; this is half of
     * it, because it is somebody else's data.
     */
    public const MINUTES = 15;

    protected $table = 'public.impersonations';

    protected function casts(): array
    {
        return [
            'expires_at' => 'datetime',
            'ended_at' => 'datetime',
        ];
    }
}
