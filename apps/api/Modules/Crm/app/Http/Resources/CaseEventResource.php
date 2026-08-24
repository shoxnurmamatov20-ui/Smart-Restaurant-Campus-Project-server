<?php

declare(strict_types=1);

namespace Modules\Crm\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;
use Modules\Crm\Models\CaseEvent;

/**
 * One line of a complaint's history.
 *
 * The person's name comes down rather than only their id: this list is read by
 * somebody deciding whether an answer was reasonable, and "user 41 refunded
 * 88 000" is not something anybody can act on.
 *
 * @mixin CaseEvent
 */
final class CaseEventResource extends JsonResource
{
    /**
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'kind' => $this->kind,
            'from' => $this->from_value,
            'to' => $this->to_value,
            'note' => $this->note,
            'by' => $this->user?->name,
            'at' => $this->created_at?->toIso8601String(),
        ];
    }
}
