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
use Modules\Crm\Database\Factories\CampaignDeliveryFactory;

/**
 * One message to one phone, and what it cost.
 *
 * The row is written `queued` before the gateway is called and updated after,
 * never created afterwards. That order is the whole idempotency story: the
 * unique index on `(campaign_id, customer_id)` is what makes a second press of
 * "send" — or a redelivered job — write nothing, and it can only do that if the
 * row exists before the message goes out.
 *
 * @property int $id
 * @property int|null $tenant_id
 * @property int $campaign_id
 * @property int|null $customer_id
 * @property string $phone
 * @property string $status queued|sent|failed
 * @property string|null $reference
 * @property string|null $reason
 * @property int $parts
 * @property int $cost_tiyin
 * @property Carbon|null $sent_at
 * @property Carbon|null $created_at
 * @property Carbon|null $updated_at
 * @property-read Campaign $campaign
 * @property-read Customer|null $customer
 * @property-read Tenant|null $tenant
 *
 * @method static \Modules\Crm\Database\Factories\CampaignDeliveryFactory factory($count = null, $state = [])
 * @method static Builder<static>|CampaignDelivery newModelQuery()
 * @method static Builder<static>|CampaignDelivery newQuery()
 * @method static Builder<static>|CampaignDelivery query()
 *
 * @mixin \Eloquent
 */
final class CampaignDelivery extends Model
{
    use BelongsToTenant;

    /** @use HasFactory<CampaignDeliveryFactory> */
    use HasFactory;

    protected $table = 'crm.campaign_deliveries';

    public const STATUSES = ['queued', 'sent', 'failed'];

    protected $fillable = [
        'tenant_id',
        'campaign_id',
        'customer_id',
        'phone',
        'status',
        'reference',
        'reason',
        'parts',
        'cost_tiyin',
        'sent_at',
    ];

    protected function casts(): array
    {
        return [
            'parts' => 'integer',
            'cost_tiyin' => 'integer',
            'sent_at' => 'datetime',
        ];
    }

    protected static function newFactory(): CampaignDeliveryFactory
    {
        return CampaignDeliveryFactory::new();
    }

    public function campaign(): BelongsTo
    {
        return $this->belongsTo(Campaign::class);
    }

    public function customer(): BelongsTo
    {
        return $this->belongsTo(Customer::class);
    }
}
