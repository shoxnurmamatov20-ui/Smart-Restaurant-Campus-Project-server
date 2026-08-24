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
use Modules\Crm\Database\Factories\TriggerSendFactory;

/**
 * One person, one automation, one firing — and whether they came in afterwards.
 *
 * The cooldown reads the newest of these, so the row is written when the
 * campaign is CREATED rather than when the gateway answers. A guard that only
 * closed after a successful send would let a gateway outage put the same
 * win-back on the same phone every night until the outage ended.
 *
 * @property int $id
 * @property int|null $tenant_id
 * @property int $trigger_id
 * @property int $customer_id
 * @property int|null $campaign_id
 * @property bool $converted
 * @property Carbon|null $converted_at
 * @property Carbon|null $created_at
 * @property Carbon|null $updated_at
 * @property-read Campaign|null $campaign
 * @property-read Customer $customer
 * @property-read Tenant|null $tenant
 * @property-read Trigger $trigger
 *
 * @method static \Modules\Crm\Database\Factories\TriggerSendFactory factory($count = null, $state = [])
 * @method static Builder<static>|TriggerSend newModelQuery()
 * @method static Builder<static>|TriggerSend newQuery()
 * @method static Builder<static>|TriggerSend query()
 *
 * @mixin \Eloquent
 */
final class TriggerSend extends Model
{
    use BelongsToTenant;

    /** @use HasFactory<TriggerSendFactory> */
    use HasFactory;

    protected $table = 'crm.trigger_sends';

    protected $fillable = [
        'tenant_id',
        'trigger_id',
        'customer_id',
        'campaign_id',
        'converted',
        'converted_at',
    ];

    protected function casts(): array
    {
        return [
            'converted' => 'boolean',
            'converted_at' => 'datetime',
        ];
    }

    protected static function newFactory(): TriggerSendFactory
    {
        return TriggerSendFactory::new();
    }

    public function trigger(): BelongsTo
    {
        return $this->belongsTo(Trigger::class);
    }

    public function customer(): BelongsTo
    {
        return $this->belongsTo(Customer::class);
    }

    public function campaign(): BelongsTo
    {
        return $this->belongsTo(Campaign::class);
    }
}
