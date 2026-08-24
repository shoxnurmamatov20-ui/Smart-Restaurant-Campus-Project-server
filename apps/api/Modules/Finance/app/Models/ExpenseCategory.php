<?php

declare(strict_types=1);

namespace Modules\Finance\Models;

use App\Models\Concerns\BelongsToTenant;
use App\Models\Concerns\HasTranslations;
use App\Models\Tenant;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Carbon;

/**
 * A heading in the restaurant's own ledger.
 *
 * See the migration for the two decisions that shape this table: the eight
 * built-in codes stay a PHP constant AND get a row here, and money received that
 * is not a sale lives on the same table behind `direction`.
 *
 * @property int $id
 * @property int|null $tenant_id
 * @property string $code The value that lands in `expenses.category`
 * @property array<string, string> $name
 * @property string $direction `out` (an expense) or `in` (income that is not a sale)
 * @property bool $is_system One of Expense::CATEGORIES — renameable, not removable
 * @property int $position
 * @property Carbon|null $archived_at
 * @property Carbon|null $created_at
 * @property Carbon|null $updated_at
 * @property-read Tenant|null $tenant
 *
 * @method static Builder<static>|ExpenseCategory live()
 * @method static Builder<static>|ExpenseCategory newModelQuery()
 * @method static Builder<static>|ExpenseCategory newQuery()
 * @method static Builder<static>|ExpenseCategory ofDirection(string $direction)
 * @method static Builder<static>|ExpenseCategory ordered()
 * @method static Builder<static>|ExpenseCategory query()
 *
 * @mixin \Eloquent
 */
final class ExpenseCategory extends Model
{
    use BelongsToTenant;
    use HasTranslations;

    protected $table = 'finance.expense_categories';

    public const DIRECTIONS = ['in', 'out'];

    /**
     * What the platform calls the eight built-in headings, in three languages.
     *
     * Here rather than in a seeder, because two callers need them and only one
     * of them is seeding: `POST /finance/expense-categories` refuses to create a
     * second row for a built-in code, and a restaurant with no rows at all still
     * has to see the eight on its settings screen. A seeder-only list would show
     * that restaurant an empty ledger and invite it to invent `rent` again.
     *
     * @var array<string, array<string, string>>
     */
    public const SYSTEM_NAMES = [
        'rent' => ['uz' => 'Ijara', 'ru' => 'Аренда', 'en' => 'Rent'],
        'utilities' => ['uz' => 'Kommunal', 'ru' => 'Коммунальные', 'en' => 'Utilities'],
        'payroll' => ['uz' => 'Ish haqi', 'ru' => 'Зарплата', 'en' => 'Payroll'],
        'purchase' => ['uz' => 'Xarid', 'ru' => 'Закупка', 'en' => 'Purchase'],
        'marketing' => ['uz' => 'Reklama', 'ru' => 'Реклама', 'en' => 'Marketing'],
        'repair' => ['uz' => "Ta'mir", 'ru' => 'Ремонт', 'en' => 'Repair'],
        'refund' => ['uz' => 'Qaytarish', 'ru' => 'Возврат', 'en' => 'Refund'],
        'other' => ['uz' => 'Boshqa', 'ru' => 'Прочее', 'en' => 'Other'],
    ];

    protected $fillable = [
        'tenant_id',
        'code',
        'name',
        'direction',
        'is_system',
        'position',
        'archived_at',
    ];

    /** @var array<int, string> */
    protected array $translatable = ['name'];

    protected function casts(): array
    {
        return [
            'name' => 'array',
            'is_system' => 'boolean',
            'position' => 'integer',
            'archived_at' => 'datetime',
        ];
    }

    // ============ Scopes ============

    /**
     * Categories a new entry may still be filed under.
     *
     * @param Builder<ExpenseCategory> $query
     *
     * @return Builder<ExpenseCategory>
     */
    public function scopeLive(Builder $query): Builder
    {
        return $query->whereNull('archived_at');
    }

    /**
     * @param Builder<ExpenseCategory> $query
     *
     * @return Builder<ExpenseCategory>
     */
    public function scopeOfDirection(Builder $query, string $direction): Builder
    {
        return $query->where('direction', $direction);
    }

    /**
     * @param Builder<ExpenseCategory> $query
     *
     * @return Builder<ExpenseCategory>
     */
    public function scopeOrdered(Builder $query): Builder
    {
        return $query->orderBy('position')->orderBy('id');
    }
}
