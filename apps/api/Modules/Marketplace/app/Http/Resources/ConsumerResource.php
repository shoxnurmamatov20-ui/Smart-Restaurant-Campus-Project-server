<?php

declare(strict_types=1);

namespace Modules\Marketplace\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;
use Modules\Marketplace\Models\Consumer;
use Modules\Marketplace\Models\ConsumerAddress;

/**
 * A marketplace customer's own profile.
 *
 * Only ever returned to the account it describes — every route behind
 * `mp.consumer` reads `$consumer->id` from the token rather than from a URL.
 * The phone is included here and nowhere else: it is the one field the guest
 * needs to see to know which account they are signed into, and the model hides
 * it by default so it cannot leak through a relation somebody eager-loads.
 *
 * @mixin Consumer
 */
final class ConsumerResource extends JsonResource
{
    /**
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        return [
            'name' => $this->name,
            'phone' => $this->phone,
            'locale' => $this->locale,

            'points' => $this->points,

            /*
             * Both, and they are not the same question. `plus` is about right
             * now and is what the checkout reads to zero the delivery fee;
             * `plus_until` is the date the profile screen prints so a guest can
             * see when to renew.
             */
            'plus' => $this->hasPlus(),
            'plus_until' => $this->plus_until?->toIso8601String(),

            /*
             * Always the full four, with the ones nobody has touched filled in
             * from the defaults. A client that received only the stored keys
             * would have to know the defaults too, and two copies of a default
             * is a switch that renders on differently in the app and on the web.
             */
            'notification_prefs' => $this->notificationPrefs(),

            'addresses' => $this->whenLoaded('addresses', fn (): array => array_map(
                static fn (ConsumerAddress $address): array => [
                    'id' => $address->id,
                    'label' => $address->label,
                    'address' => $address->address,
                    'note' => $address->note,
                    'latitude' => $address->latitude(),
                    'longitude' => $address->longitude(),
                    'is_default' => $address->is_default,
                ],
                $this->addresses->all(),
            )),
        ];
    }
}
