<?php

declare(strict_types=1);

namespace Modules\Menu\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;
use Modules\Menu\Models\ModifierGroup;
use Modules\Menu\Models\ModifierOption;

/**
 * One question a guest is asked about a dish — "size?", "how spicy?".
 *
 * The shape is `App\Contracts\Menu\ModifierQuestion::toArray()` field for
 * field, and that is not a coincidence to be tidied away later. The till reads
 * the questions through the contract (`GET /v1/pos/menu/{item}/questions`) and
 * the guest reads them here, off the public menu; two shapes for one sheet is
 * how a phone ends up letting somebody pick two sizes because it read
 * `max_choices` out of a key the till calls something else.
 *
 * Prices are tiyin, like every amount in this system, and `price_delta_tiyin`
 * says so in its name because this one is signed — "no onion" is worth nothing
 * and a small cup is worth less than nothing.
 *
 * @mixin ModifierGroup
 */
final class ModifierGroupResource extends JsonResource
{
    /**
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            // Already resolved for the request's X-Locale by HasTranslations.
            'title' => $this->title,
            'is_multi' => $this->is_multi,
            'min_choices' => $this->min_choices,
            'max_choices' => $this->max_choices,
            'choices' => $this->whenLoaded('options', fn (): array => $this->options
                ->map(static fn (ModifierOption $option): array => [
                    'id' => $option->id,
                    'title' => $option->title,
                    'price_delta_tiyin' => $option->price_delta,
                ])
                ->values()
                ->all()),
        ];
    }
}
