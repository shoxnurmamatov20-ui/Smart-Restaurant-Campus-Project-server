<?php

declare(strict_types=1);

namespace Modules\Crm\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;
use Modules\Crm\Models\CampaignDelivery;

/**
 * One message, for the report behind a campaign row.
 *
 * The phone is published in full and deliberately: the person reading this
 * screen holds `crm.view`, which is already the permission to open the guest
 * list and read every number on it. Masking it here would protect nothing and
 * would make the one useful thing this screen does — "which number did the
 * gateway refuse" — impossible.
 *
 * @mixin CampaignDelivery
 */
final class CampaignDeliveryResource extends JsonResource
{
    /**
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'campaign_id' => $this->campaign_id,
            'customer_id' => $this->customer_id,
            'phone' => $this->phone,
            'status' => $this->status,
            'reference' => $this->reference,
            'reason' => $this->reason,
            'parts' => $this->parts,
            'cost_tiyin' => $this->cost_tiyin,
            'sent_at' => $this->sent_at?->toIso8601String(),
        ];
    }
}
