<?php

declare(strict_types=1);

namespace App\Models;

use App\Models\Concerns\BelongsToTenant;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Carbon;

/**
 * Something the operator has to answer for.
 *
 * The support screen's queue and the overview's "open problems" count read the
 * same rows, so the number on the dashboard is the length of the list behind
 * it rather than a second calculation that can disagree with it.
 *
 * @property int $id
 * @property int|null $tenant_id
 * @property string $title
 * @property string|null $body
 * @property string $severity
 * @property string $status
 * @property string $source
 * @property int|null $assigned_to_user_id
 * @property Carbon|null $closed_at
 * @property Carbon|null $created_at
 * @property Carbon|null $updated_at
 * @property-read Tenant|null $tenant
 *
 * @method static Builder<static>|PlatformIssue newModelQuery()
 * @method static Builder<static>|PlatformIssue newQuery()
 * @method static Builder<static>|PlatformIssue query()
 *
 * @mixin \Eloquent
 */
#[Fillable([
    'tenant_id', 'title', 'body', 'severity', 'status', 'source',
    'assigned_to_user_id', 'closed_at',
])]
final class PlatformIssue extends Model
{
    use BelongsToTenant;

    public const STATUSES = ['open', 'acknowledged', 'closed'];

    public const SEVERITIES = ['info', 'warning', 'error'];

    protected $table = 'public.platform_issues';

    protected function casts(): array
    {
        return [
            'closed_at' => 'datetime',
        ];
    }
}
