<?php

declare(strict_types=1);

namespace App\Models;

use App\Models\Concerns\BelongsToTenant;
use Database\Factories\BranchFactory;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;
use Illuminate\Support\Carbon;

/**
 * One venue of one restaurant business.
 *
 * A tenant is the business; a branch is the address you can walk into. Almost
 * everything a restaurant does happens at a branch rather than at the business:
 * a table, an order, a kitchen ticket, a till shift and a stock count all
 * belong to one venue, and rolling them up across venues is what the owner's
 * dashboard is for.
 *
 * Modules must NOT be referenced from this class — the core never depends on a
 * module. A module's model reaches the other way, through
 * App\Models\Concerns\BelongsToBranch.
 *
 * @property int $id
 * @property int $tenant_id
 * @property string $name
 * @property string $slug
 * @property string|null $code Short human code used on receipts and in exports, e.g. CHZ
 * @property string|null $city
 * @property string|null $address
 * @property string|null $phone
 * @property string $timezone
 * @property string $status active | suspended | archived
 * @property Carbon|null $opened_at
 * @property array<array-key, mixed>|null $settings
 * @property Carbon|null $created_at
 * @property Carbon|null $updated_at
 * @property Carbon|null $deleted_at
 * @property-read Tenant $tenant
 *
 * @method static \Database\Factories\BranchFactory factory($count = null, $state = [])
 * @method static \Illuminate\Database\Eloquent\Builder<static>|Branch newModelQuery()
 * @method static \Illuminate\Database\Eloquent\Builder<static>|Branch newQuery()
 * @method static \Illuminate\Database\Eloquent\Builder<static>|Branch onlyTrashed()
 * @method static \Illuminate\Database\Eloquent\Builder<static>|Branch query()
 * @method static \Illuminate\Database\Eloquent\Builder<static>|Branch whereAddress($value)
 * @method static \Illuminate\Database\Eloquent\Builder<static>|Branch whereCity($value)
 * @method static \Illuminate\Database\Eloquent\Builder<static>|Branch whereCode($value)
 * @method static \Illuminate\Database\Eloquent\Builder<static>|Branch whereCreatedAt($value)
 * @method static \Illuminate\Database\Eloquent\Builder<static>|Branch whereDeletedAt($value)
 * @method static \Illuminate\Database\Eloquent\Builder<static>|Branch whereId($value)
 * @method static \Illuminate\Database\Eloquent\Builder<static>|Branch whereName($value)
 * @method static \Illuminate\Database\Eloquent\Builder<static>|Branch whereOpenedAt($value)
 * @method static \Illuminate\Database\Eloquent\Builder<static>|Branch wherePhone($value)
 * @method static \Illuminate\Database\Eloquent\Builder<static>|Branch whereSettings($value)
 * @method static \Illuminate\Database\Eloquent\Builder<static>|Branch whereSlug($value)
 * @method static \Illuminate\Database\Eloquent\Builder<static>|Branch whereStatus($value)
 * @method static \Illuminate\Database\Eloquent\Builder<static>|Branch whereTenantId($value)
 * @method static \Illuminate\Database\Eloquent\Builder<static>|Branch whereTimezone($value)
 * @method static \Illuminate\Database\Eloquent\Builder<static>|Branch whereUpdatedAt($value)
 * @method static \Illuminate\Database\Eloquent\Builder<static>|Branch withTrashed(bool $withTrashed = true)
 * @method static \Illuminate\Database\Eloquent\Builder<static>|Branch withoutTrashed()
 *
 * @mixin \Eloquent
 */
#[Fillable([
    'tenant_id', 'name', 'slug', 'code', 'city', 'address',
    'phone', 'timezone', 'status', 'opened_at', 'settings',
])]
final class Branch extends Model
{
    use BelongsToTenant;

    /** @use HasFactory<BranchFactory> */
    use HasFactory;

    use SoftDeletes;

    protected $table = 'public.branches';

    protected function casts(): array
    {
        return [
            'settings' => 'array',
            'opened_at' => 'date',
        ];
    }

    protected static function newFactory(): BranchFactory
    {
        return BranchFactory::new();
    }

    /**
     * A per-venue setting, falling back to the business, then to a default.
     *
     * Service charge and the business-day boundary are the ones that actually
     * differ: a branch inside a mall closes when the mall does, and a 10%
     * service charge on the terrace is not always the same as in the hall.
     */
    public function setting(string $key, mixed $default = null): mixed
    {
        $own = data_get($this->settings, $key);

        if ($own !== null) {
            return $own;
        }

        return $this->tenant?->setting($key, $default) ?? $default;
    }

    public function isActive(): bool
    {
        return $this->status === 'active';
    }
}
