<?php

declare(strict_types=1);

namespace Modules\Marketplace\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;
use Modules\Marketplace\Models\Dispute;

/**
 * A complaint, and the clock on it.
 *
 * `hours_left` is computed rather than stored for the one reason a countdown
 * always is: a stored one is wrong the moment nobody writes to it. Null once
 * the thing is resolved, so the panel stops drawing a deadline beside a closed
 * case.
 *
 * @mixin Dispute
 */
final class DisputeResource extends JsonResource
{
    /**
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'order_number' => $this->order?->number,

            'kind' => $this->kind,
            'amount_tiyin' => $this->amount_tiyin,
            'body' => $this->body,

            /*
             * Whether the platform settled it without asking. It changes what
             * the merchant is being shown — a decision to appeal, rather than a
             * question to answer — so the panel needs it to pick the screen.
             */
            'automatic' => $this->automatic,

            'state' => $this->state,
            'resolution' => $this->resolution,

            'hours_left' => $this->deadline_at === null || $this->resolved_at !== null
                ? null
                : max(0, (int) now()->diffInHours($this->deadline_at, false)),

            'deadline_at' => $this->deadline_at?->toIso8601String(),
            'resolved_at' => $this->resolved_at?->toIso8601String(),
            'created_at' => $this->created_at?->toIso8601String(),
        ];
    }
}
