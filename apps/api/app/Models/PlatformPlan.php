<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Carbon;

/**
 * One tier the platform sells.
 *
 * Belongs to no restaurant — a price list is the same for everybody, which is
 * what makes it the platform's rather than a tenant's. The ceilings are
 * nullable: "no limit" written as a large number is a limit somebody hits.
 *
 * @property int $id
 * @property string $key
 * @property int $price_tiyin
 * @property int|null $branch_limit
 * @property int|null $user_limit
 * @property int|null $terminal_limit
 * @property int|null $order_limit
 * @property array<array-key, mixed>|null $features
 * @property int $position
 * @property bool $is_active
 * @property Carbon|null $created_at
 * @property Carbon|null $updated_at
 *
 * @method static Builder<static>|PlatformPlan newModelQuery()
 * @method static Builder<static>|PlatformPlan newQuery()
 * @method static Builder<static>|PlatformPlan query()
 *
 * @mixin \Eloquent
 */
#[Fillable([
    'key', 'price_tiyin', 'branch_limit', 'user_limit', 'terminal_limit',
    'order_limit', 'features', 'position', 'is_active',
])]
final class PlatformPlan extends Model
{
    protected $table = 'public.platform_plans';

    protected function casts(): array
    {
        return [
            'features' => 'array',
            'is_active' => 'boolean',
        ];
    }
}
