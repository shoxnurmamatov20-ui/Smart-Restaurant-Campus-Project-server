<?php

declare(strict_types=1);

namespace Modules\Finance\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;
use Modules\Finance\Models\Expense;

/**
 * @mixin Expense
 */
final class ExpenseResource extends JsonResource
{
    /**
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'cash_shift_id' => $this->cash_shift_id,
            'category' => $this->category,
            'description' => $this->description,
            'amount' => $this->amount,
            'paid_in_cash' => $this->paid_in_cash,
            'spent_at' => $this->spent_at?->toIso8601String(),
            'paid_at' => $this->paid_at?->toIso8601String(),
            // Stated rather than left to the client to infer from a null. The
            // console draws a paid/unpaid chip and a boolean is what a chip is;
            // three readers each writing `paid_at !== null` is three places the
            // meaning of null can drift.
            'is_paid' => $this->paid_at !== null,
            'created_at' => $this->created_at?->toIso8601String(),
            'updated_at' => $this->updated_at?->toIso8601String(),
        ];
    }
}
