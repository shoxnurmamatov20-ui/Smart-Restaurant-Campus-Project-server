<?php

declare(strict_types=1);

namespace Modules\Finance\Models;

use App\Models\Activity;
use App\Models\Concerns\BelongsToTenant;
use App\Models\Concerns\HasTranslations;
use App\Models\Tenant;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Collection;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Carbon;
use Spatie\Activitylog\LogOptions;
use Spatie\Activitylog\Traits\LogsActivity;

/**
 * One way this restaurant takes money, as it decided to offer it.
 *
 * The row is a DECISION about a tender that already exists — see the migration
 * for why `method` is checked against `Payment::METHODS` rather than being free
 * text, and for why no card requisite will ever live on this table.
 *
 * @property int $id
 * @property int|null $tenant_id
 * @property string $method One of Payment::METHODS
 * @property array<string, string> $name
 * @property string $kind One of self::KINDS
 * @property bool $is_fiscal
 * @property int|null $fee_bps Basis points; null = the platform default
 * @property string|null $gateway The driver that settles it, when one does
 * @property bool $is_enabled
 * @property int $position
 * @property Carbon|null $created_at
 * @property Carbon|null $updated_at
 * @property-read Collection<int, Activity> $activities
 * @property-read int|null $activities_count
 * @property-read Tenant|null $tenant
 *
 * @method static Builder<static>|PaymentMethod enabled()
 * @method static Builder<static>|PaymentMethod newModelQuery()
 * @method static Builder<static>|PaymentMethod newQuery()
 * @method static Builder<static>|PaymentMethod ordered()
 * @method static Builder<static>|PaymentMethod query()
 *
 * @mixin \Eloquent
 */
final class PaymentMethod extends Model
{
    use BelongsToTenant;
    use HasTranslations;
    use LogsActivity;

    protected $table = 'finance.payment_methods';

    /**
     * The four shapes a tender can have.
     *
     * `cash` opens the drawer and is reconciled against a count; `card` settles
     * through an acquirer and appears on a statement days later; `online` sends
     * the guest to a bank's own page; `credit` books a debt and moves no money
     * tonight at all. A Z-report reconciles the first against notes and the rest
     * against paper, which is why the distinction is stored rather than inferred
     * from the method name.
     */
    public const KINDS = ['cash', 'card', 'online', 'credit'];

    protected $fillable = [
        'tenant_id',
        'method',
        'name',
        'kind',
        'is_fiscal',
        'fee_bps',
        'gateway',
        'is_enabled',
        'position',
    ];

    /** @var array<int, string> */
    protected array $translatable = ['name'];

    protected function casts(): array
    {
        return [
            'name' => 'array',
            'is_fiscal' => 'boolean',
            'is_enabled' => 'boolean',
            'fee_bps' => 'integer',
            'position' => 'integer',
        ];
    }

    // ============ Scopes ============

    /**
     * @param Builder<PaymentMethod> $query
     *
     * @return Builder<PaymentMethod>
     */
    public function scopeEnabled(Builder $query): Builder
    {
        return $query->where('is_enabled', true);
    }

    /**
     * The order the till draws its tender sheet in.
     *
     * `position` then `id`, because a restaurant that never reorders anything
     * has every row at zero, and a list whose order changed between two renders
     * of the same screen is a cashier pressing where the button used to be.
     *
     * @param Builder<PaymentMethod> $query
     *
     * @return Builder<PaymentMethod>
     */
    public function scopeOrdered(Builder $query): Builder
    {
        return $query->orderBy('position')->orderBy('id');
    }

    // ============ Spatie ActivityLog ============

    public function getActivitylogOptions(): LogOptions
    {
        return LogOptions::defaults()
            // `fee_bps` is on the list because it is money: a rate quietly
            // changed is a margin report that stops matching the bank, and the
            // question six months later is who changed it and when.
            ->logOnly(['tenant_id', 'method', 'kind', 'is_fiscal', 'fee_bps', 'gateway', 'is_enabled'])
            ->logOnlyDirty()
            ->dontSubmitEmptyLogs()
            ->useLogName('finance.payment_method');
    }
}
