<?php

declare(strict_types=1);

namespace Modules\Crm\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;
use Modules\Crm\Models\Lead;

/**
 * @mixin Lead
 */
final class LeadResource extends JsonResource
{
    /**
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'name' => $this->name,
            'phone' => $this->phone,
            'email' => $this->email,
            'restaurant' => $this->restaurant,
            'city' => $this->city,
            'message' => $this->message,
            'source' => $this->source,
            'status' => $this->status,
            'assigned_to_user_id' => $this->assigned_to_user_id,
            'contacted_at' => $this->contacted_at?->toIso8601String(),
            'note' => $this->note,
            'captured_on' => $this->captured_on->toDateString(),
            'created_at' => $this->created_at?->toIso8601String(),
        ];
    }
}
