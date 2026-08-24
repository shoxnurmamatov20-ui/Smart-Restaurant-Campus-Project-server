<?php

declare(strict_types=1);

namespace Modules\Crm\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;
use Modules\Crm\Models\Campaign;
use Modules\Crm\Services\SmsCost;

/**
 * A campaign, as the marketing screen's table reads it.
 *
 * Both cost figures come down, and that pair is the point of the resource. The
 * composer promised `estimated_cost_tiyin` before the send; `cost_tiyin` is
 * what the gateway was actually asked for. A screen that only showed one of
 * them would be a screen nobody could use to check the other.
 *
 * `parts` is derived rather than stored on the campaign, because it is a
 * property of the body and the body can still change while the campaign is a
 * draft — a stored count would go stale on the first edit.
 *
 * @mixin Campaign
 */
final class CampaignResource extends JsonResource
{
    /**
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'name' => $this->name,
            'body' => $this->body,
            'segment' => $this->segment,
            'status' => $this->status,
            'scheduled_for' => $this->scheduled_for?->toIso8601String(),
            'started_at' => $this->started_at?->toIso8601String(),
            'finished_at' => $this->finished_at?->toIso8601String(),

            'recipients' => $this->recipients,
            'delivered' => $this->delivered,
            'failed' => $this->failed,

            'parts' => SmsCost::parts($this->body),
            'cyrillic' => SmsCost::isCyrillic($this->body),
            'estimated_cost_tiyin' => $this->estimated_cost_tiyin,
            'cost_tiyin' => $this->cost_tiyin,

            'promo_code_id' => $this->promo_code_id,
            'redeemed' => $this->redeemed,
            'revenue_tiyin' => $this->revenue_tiyin,

            'is_editable' => $this->isEditable(),
            'created_at' => $this->created_at?->toIso8601String(),
        ];
    }
}
