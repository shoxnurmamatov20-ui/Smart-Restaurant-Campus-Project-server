<?php

declare(strict_types=1);

namespace Modules\Marketplace\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;
use Modules\Marketplace\Models\Placement;

/**
 * A banner a merchant bought, and where it is in the queue.
 *
 * `queue_position` is computed rather than stored — it is a fact about the
 * bookings other restaurants hold on the same dates, and it changes when one of
 * them cancels. Storing it would freeze somebody else's answer onto this row.
 * The controller works it out and sets it through `withQueue()`.
 *
 * @mixin Placement
 */
final class PlacementResource extends JsonResource
{
    public function __construct(Placement $placement, private readonly ?int $queuePosition = null)
    {
        parent::__construct($placement);
    }

    /**
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'slot' => $this->slot,

            'starts_on' => $this->starts_on->toDateString(),
            'ends_on' => $this->ends_on->toDateString(),
            'days' => $this->days,

            'day_rate_tiyin' => $this->day_rate_tiyin,
            'total_tiyin' => $this->total_tiyin,
            'billed_tiyin' => $this->billed_tiyin,

            'state' => $this->state,

            /*
             * How many merchants are ahead. Zero means it goes up tomorrow,
             * which is what the merchant card prints — a banner bought for
             * Friday when three others already hold Friday has to say so
             * BEFORE Friday, not after it.
             */
            'queue_position' => $this->queuePosition,
        ];
    }
}
