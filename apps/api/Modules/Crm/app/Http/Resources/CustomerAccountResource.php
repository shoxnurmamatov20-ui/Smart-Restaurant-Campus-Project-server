<?php

declare(strict_types=1);

namespace Modules\Crm\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;
use Modules\Crm\Models\Customer;

/**
 * A guest's tab: the two numbers, and what each one means for the next sale.
 *
 * `available` is sent rather than left to the client to subtract. It is not a
 * subtraction the till can do safely — it is floored at zero, and a guest over
 * their limit would otherwise produce a negative figure that a screen would
 * happily draw as credit. One place computes it, the same place the charge is
 * checked against.
 *
 * @mixin Customer
 */
final class CustomerAccountResource extends JsonResource
{
    /**
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        return [
            'customer_id' => $this->id,
            'name' => $this->name,
            'phone' => $this->phone,
            'is_active' => $this->is_active,
            'credit_limit' => $this->credit_limit,
            'balance' => $this->account_balance,
            'available' => $this->credit_available,
            'runs_a_tab' => $this->runs_a_tab,
            /*
             * When the money still owed began, ISO 8601 — or null.
             *
             * Only the list read fills it (see `CustomerAccountController::index`),
             * because it costs a query and only one screen asks: the books
             * screen's receivables tab, which draws an age column and four
             * ageing buckets. The key is ABSENT rather than null when the read
             * did not compute it, which is how a client tells "we did not ask"
             * apart from "this guest owes nothing" — and neither may be drawn
             * as an age of zero, because zero days is a debt incurred today.
             */
            'oldest_unsettled_at' => $this->whenNotNull(
                $this->resource->getAttribute('oldest_unsettled_at'),
            ),
            // Stated, so a till does not have to infer it from three fields and
            // get the inference wrong — an inactive guest with headroom is still
            // not somebody who may sign for lunch.
            'can_charge' => $this->is_active && $this->runs_a_tab,
            'entries' => AccountEntryResource::collection(
                $this->whenLoaded('accountEntries'),
            ),
        ];
    }
}
