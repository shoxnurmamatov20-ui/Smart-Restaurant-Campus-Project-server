<?php

declare(strict_types=1);

namespace Modules\Crm\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;
use Modules\Crm\Models\CustomerAddress;

/**
 * @mixin CustomerAddress
 */
final class CustomerAddressResource extends JsonResource
{
    /**
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'label' => $this->label,
            'line' => $this->line,
            'entrance' => $this->entrance,
            'floor' => $this->floor,
            'flat' => $this->flat,
            'note' => $this->note,
            /*
             * Assembled on the server, beside the parts it was assembled from.
             *
             * Four surfaces draw this line — the customer app on web and on a
             * phone, the courier's screen, the console's order detail — and the
             * order of the three door details is not obvious enough for four
             * separate guesses to agree.
             */
            'full_line' => $this->fullLine(),
            'lat' => $this->lat,
            'lng' => $this->lng,
            'is_default' => $this->is_default,
        ];
    }
}
