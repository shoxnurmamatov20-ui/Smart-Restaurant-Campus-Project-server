<?php

declare(strict_types=1);

namespace Modules\Finance\Models;

use App\Models\Branch;
use App\Models\Concerns\BelongsToBranch;
use App\Models\Concerns\BelongsToTenant;
use App\Models\Concerns\HasTranslations;
use App\Models\Tenant;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Carbon;

/**
 * Somewhere money sits when it is not in a drawer.
 *
 * The safe, the bank, the office float. A TILL is deliberately not one of these
 * — see the migration: a drawer is a shift, it opens and closes with a count,
 * and giving it an account as well would give the same banknotes two balances
 * that could disagree.
 *
 * @property int $id
 * @property int|null $tenant_id
 * @property int|null $branch_id
 * @property string $code
 * @property array<string, string> $name
 * @property string $kind One of self::KINDS
 * @property int $opening_balance In tiyin, what was there before the platform counted
 * @property bool $is_active
 * @property Carbon|null $created_at
 * @property Carbon|null $updated_at
 * @property-read Branch|null $branch
 * @property-read Tenant|null $tenant
 *
 * @method static Builder<static>|CashAccount active()
 * @method static Builder<static>|CashAccount newModelQuery()
 * @method static Builder<static>|CashAccount newQuery()
 * @method static Builder<static>|CashAccount query()
 *
 * @mixin \Eloquent
 */
final class CashAccount extends Model
{
    use BelongsToBranch;
    use BelongsToTenant;
    use HasTranslations;

    protected $table = 'finance.cash_accounts';

    public const KINDS = ['safe', 'bank', 'petty'];

    protected $fillable = [
        'tenant_id',
        'branch_id',
        'code',
        'name',
        'kind',
        'opening_balance',
        'is_active',
    ];

    /** @var array<int, string> */
    protected array $translatable = ['name'];

    protected function casts(): array
    {
        return [
            'name' => 'array',
            'opening_balance' => 'integer',
            'is_active' => 'boolean',
        ];
    }

    /**
     * @param  Builder<CashAccount>  $query
     * @return Builder<CashAccount>
     */
    public function scopeActive(Builder $query): Builder
    {
        return $query->where('is_active', true);
    }
}
