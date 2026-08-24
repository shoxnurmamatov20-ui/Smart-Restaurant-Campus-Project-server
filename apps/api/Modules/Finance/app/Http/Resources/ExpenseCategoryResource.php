<?php

declare(strict_types=1);

namespace Modules\Finance\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;
use Modules\Finance\Models\ExpenseCategory;

/**
 * @mixin ExpenseCategory
 */
final class ExpenseCategoryResource extends JsonResource
{
    /**
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'code' => $this->code,
            'name' => $this->name,
            'title' => $this->translate('name'),
            'direction' => $this->direction,
            'is_system' => $this->is_system,
            'position' => $this->position,
            'archived_at' => $this->archived_at?->toIso8601String(),
            /*
             * How many entries are filed under this heading, and what they come
             * to — but only when the caller asked for the count.
             *
             * `whenHas` rather than always, because the figures are two
             * aggregates over the expenses table per row and the settings screen
             * is the only caller that needs them. The delete guard is measured
             * against `entries_count`: a heading with rows behind it is archived
             * rather than removed.
             */
            'entries_count' => $this->whenHas('entries_count', fn (): int => (int) $this->getAttribute('entries_count')),
            'entries_total' => $this->whenHas('entries_total', fn (): int => (int) $this->getAttribute('entries_total')),
            'created_at' => $this->created_at?->toIso8601String(),
            'updated_at' => $this->updated_at?->toIso8601String(),
        ];
    }
}
