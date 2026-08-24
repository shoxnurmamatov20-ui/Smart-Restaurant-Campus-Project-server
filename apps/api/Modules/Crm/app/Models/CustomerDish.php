<?php

declare(strict_types=1);

namespace Modules\Crm\Models;

use App\Models\Concerns\BelongsToTenant;
use App\Models\Tenant;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Carbon;
use Modules\Crm\Database\Factories\CustomerDishFactory;

/**
 * How many bills of theirs had this dish on it — the working behind "usually
 * orders".
 *
 * Counted per BILL rather than per portion, deliberately. A family ordering six
 * plov once is not a plov regular, and counting portions would make them one;
 * counting bills answers the question the operator actually asks, which is
 * "what do they order when they come in".
 *
 * @property int $id
 * @property int|null $tenant_id
 * @property int $customer_id
 * @property int $menu_item_id
 * @property string $title
 * @property int $times
 * @property Carbon|null $last_at
 * @property Carbon|null $created_at
 * @property Carbon|null $updated_at
 * @property-read Customer $customer
 * @property-read Tenant|null $tenant
 *
 * @method static \Modules\Crm\Database\Factories\CustomerDishFactory factory($count = null, $state = [])
 * @method static Builder<static>|CustomerDish newModelQuery()
 * @method static Builder<static>|CustomerDish newQuery()
 * @method static Builder<static>|CustomerDish query()
 *
 * @mixin \Eloquent
 */
final class CustomerDish extends Model
{
    use BelongsToTenant;

    /** @use HasFactory<CustomerDishFactory> */
    use HasFactory;

    protected $table = 'crm.customer_dishes';

    protected $fillable = [
        'tenant_id',
        'customer_id',
        'menu_item_id',
        'title',
        'times',
        'last_at',
    ];

    protected function casts(): array
    {
        return [
            'times' => 'integer',
            'last_at' => 'datetime',
        ];
    }

    protected static function newFactory(): CustomerDishFactory
    {
        return CustomerDishFactory::new();
    }

    public function customer(): BelongsTo
    {
        return $this->belongsTo(Customer::class);
    }
}
