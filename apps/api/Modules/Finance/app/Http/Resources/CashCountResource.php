<?php

declare(strict_types=1);

namespace Modules\Finance\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;
use Modules\Finance\Models\CashCount;

/**
 * @mixin CashCount
 */
final class CashCountResource extends JsonResource
{
    /**
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'cash_shift_id' => $this->cash_shift_id,
            'kind' => $this->kind,
            'breakdown' => $this->breakdown,
            'total' => $this->total,
            // How many notes were handled. Printed beside the total because it is
            // what says whether a count was plausible: 900 000 so'm in four notes
            // is a different evening from 900 000 in three hundred.
            'note_count' => $this->note_count,
            'counted_by' => $this->whenLoaded('countedBy', fn () => $this->countedBy?->name),
            'witnessed_by' => $this->whenLoaded('witnessedBy', fn () => $this->witnessedBy?->name),
            'note' => $this->note,
            'counted_at' => $this->counted_at->toIso8601String(),
        ];
    }
}
