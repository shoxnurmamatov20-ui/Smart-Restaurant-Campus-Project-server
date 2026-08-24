<?php

declare(strict_types=1);

namespace App\Models;

use App\Models\Concerns\BelongsToTenant;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Carbon;

/**
 * What one restaurant owes the platform for one month.
 *
 * Money in tiyin like everywhere else. Settlement is manual on purpose — see
 * the migration: nobody's card is on file, and a product that showed "failing"
 * for a restaurant that paid last week would be worse than one that says
 * plainly that a person marks it.
 *
 * @property int $id
 * @property int $tenant_id
 * @property string $number
 * @property Carbon $period
 * @property int $amount_tiyin
 * @property string $status
 * @property Carbon $issued_on
 * @property Carbon $due_on
 * @property Carbon|null $paid_at
 * @property int $attempts
 * @property string|null $plan_key
 * @property int $branches
 * @property string|null $note
 * @property Carbon|null $created_at
 * @property Carbon|null $updated_at
 * @property-read Tenant|null $tenant
 *
 * @method static Builder<static>|PlatformInvoice newModelQuery()
 * @method static Builder<static>|PlatformInvoice newQuery()
 * @method static Builder<static>|PlatformInvoice query()
 *
 * @mixin \Eloquent
 */
#[Fillable([
    'tenant_id', 'number', 'period', 'amount_tiyin', 'status', 'issued_on',
    'due_on', 'paid_at', 'attempts', 'plan_key', 'branches', 'note',
])]
final class PlatformInvoice extends Model
{
    use BelongsToTenant;

    public const STATUSES = ['due', 'paid', 'overdue'];

    protected $table = 'public.platform_invoices';

    protected function casts(): array
    {
        return [
            'period' => 'date',
            'issued_on' => 'date',
            'due_on' => 'date',
            'paid_at' => 'datetime',
        ];
    }
}
