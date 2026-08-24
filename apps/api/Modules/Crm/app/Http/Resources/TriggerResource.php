<?php

declare(strict_types=1);

namespace Modules\Crm\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;
use Modules\Crm\Models\Trigger;

/**
 * An automation, as the card draws it.
 *
 * The three figures beside each switch — audience, this month, converted — are
 * counted rather than stored, and the controller supplies them because two of
 * the three are queries this resource must not run per row: a list of four
 * cards would otherwise be twelve round trips.
 *
 * `null` for all three when the controller did not ask for them, which is what
 * a write's response looks like. Zero would claim an audience of nobody.
 *
 * @mixin Trigger
 */
final class TriggerResource extends JsonResource
{
    /**
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'key' => $this->key,
            'kind' => $this->kind,
            'name' => $this->name,
            'rule_text' => $this->rule_text,
            'body' => $this->body,
            'offset_days' => $this->offset_days,
            'offset_hours' => $this->offset_hours,
            'cooldown_days' => $this->cooldown_days,
            'min_tiyin' => $this->min_tiyin,
            'is_active' => $this->is_active,
            'last_run_at' => $this->last_run_at?->toIso8601String(),

            /*
             * `getAttribute` rather than a property, because these three are not
             * columns: the controller stamps them onto the model after counting
             * them once for the whole page. Reading them as properties would
             * make static analysis believe in columns that do not exist.
             */
            'audience' => $this->resource->getAttribute('audience'),
            'sent_this_month' => $this->resource->getAttribute('sent_this_month'),
            'converted_this_month' => $this->resource->getAttribute('converted_this_month'),

            'created_at' => $this->created_at?->toIso8601String(),
        ];
    }
}
