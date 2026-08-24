<?php

declare(strict_types=1);

namespace Modules\Kitchen\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;
use Modules\Kitchen\Models\PrintJob;

/**
 * A spool row as a person reads it.
 *
 * The bytes are deliberately absent. This answers the console's "what is stuck
 * in the queue" screen, and a base64 ESC/POS blob per row would be several
 * kilobytes of noise nobody can read — the agent's own protocol carries them,
 * and it is not a REST resource.
 *
 * @mixin PrintJob
 */
final class PrintJobResource extends JsonResource
{
    /**
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'branch_id' => $this->branch_id,
            'printer_id' => $this->printer_id,
            'kind' => $this->kind,
            'reference' => $this->reference,
            'title' => $this->title,
            'copies' => $this->copies,
            'status' => $this->status,
            'attempts' => $this->attempts,
            'available_at' => $this->available_at->toIso8601String(),
            'claimed_at' => $this->claimed_at?->toIso8601String(),
            'claimed_by' => $this->claimed_by,
            'printed_at' => $this->printed_at?->toIso8601String(),
            'last_error' => $this->last_error,
            'created_at' => $this->created_at?->toIso8601String(),
        ];
    }
}
