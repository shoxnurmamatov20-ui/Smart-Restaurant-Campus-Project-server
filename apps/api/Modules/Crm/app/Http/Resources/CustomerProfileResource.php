<?php

declare(strict_types=1);

namespace Modules\Crm\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;
use Modules\Crm\Models\Customer;

/**
 * A guest reading their own account.
 *
 * Deliberately not `CustomerResource`, which is the console's view of a guest
 * and carries the note a manager wrote about them, their allergen list, their
 * credit limit and their tab. That is a staff document; this is the profile
 * screen, and the difference is not cosmetic — one of those fields says what
 * the restaurant privately thinks of this person.
 *
 * What is here is what the design's profile and loyalty screens draw, and
 * nothing else.
 *
 * @mixin Customer
 */
final class CustomerProfileResource extends JsonResource
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
            'locale' => $this->locale,

            // The loyalty screen's three numbers. `points` is the balance;
            // `tier` follows lifetime spend rather than the balance, which is
            // why both are sent and neither is derivable from the other.
            'points' => $this->points,
            'tier' => $this->tier,

            /*
             * How many times this guest has been in — the "38 buyurtma" line
             * on the profile screen. `visits_count` rather than a count of
             * `orders`: Orders is another module, and a public endpoint that
             * joined across it would be a boundary crossing on the busiest
             * screen the customer app has.
             */
            'orders_count' => $this->visits_count,
            'total_spent' => $this->total_spent,

            'addresses' => CustomerAddressResource::collection($this->whenLoaded('addresses')),
        ];
    }
}
