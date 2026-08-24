<?php

declare(strict_types=1);

namespace Modules\Crm\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;
use Modules\Crm\Models\Customer;

/**
 * A guest, as the console's list and the operator's caller card read them.
 *
 * The last three fields are the ones two screens were blocked on. `crm-server.ts`
 * had to leave the guest list on fixtures because "at risk" and "last seen five
 * weeks ago" are the two things a marketer opens that screen for and neither had
 * a column; `calls-panels.tsx` drew a caller card with two of its four lines
 * blank for a real person, because nothing anywhere answered "what do they
 * usually order".
 *
 * `segment` is a stored value rather than something computed here on purpose —
 * see the migration for why a campaign has to be able to filter and index by it.
 *
 * @mixin Customer
 */
final class CustomerResource extends JsonResource
{
    /**
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'phone' => $this->phone,
            'name' => $this->name,
            'birthday' => $this->birthday?->toDateString(),
            'birthday_is_today' => $this->birthday_is_today,
            'points' => $this->points,
            'tier' => $this->tier,
            'cashback' => $this->cashback,
            'visits_count' => $this->visits_count,
            'total_spent' => $this->total_spent,
            'average_cheque' => $this->average_cheque,

            'segment' => $this->segment,
            'last_visit_at' => $this->last_visit_at?->toIso8601String(),
            /*
             * The dish, and the id behind it.
             *
             * Both, because the console prints the title and a client that
             * wanted to put it in a basket needs the id — and because a dish
             * renamed since is still the same dish, which only the id can say.
             */
            'usual_order' => $this->usual_order,
            'usual_order_item_id' => $this->usual_order_item_id,
            'allergens' => $this->allergens ?? [],
            'note' => $this->note,
            'is_active' => $this->is_active,
            'created_at' => $this->created_at?->toIso8601String(),
            'updated_at' => $this->updated_at?->toIso8601String(),
        ];
    }
}
