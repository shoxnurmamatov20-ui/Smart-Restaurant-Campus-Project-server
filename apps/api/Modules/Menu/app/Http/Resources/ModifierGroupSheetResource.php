<?php

declare(strict_types=1);

namespace Modules\Menu\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;
use Modules\Menu\Models\ModifierGroup;
use Modules\Menu\Models\ModifierOption;

/**
 * A modifier group as the people who maintain it need to see it.
 *
 * Its own resource rather than a field or two bolted onto
 * `ModifierGroupResource`, and the reason is who reads that one: the till and
 * the QR menu, through `App\Contracts\Menu\ModifierQuestion`, where the shape
 * is a contract two clients parse. Growing it a `used_by` a guest's phone has
 * no use for is how a payload becomes a place things are added to rather than a
 * sheet somebody decided on.
 *
 * The two cuts genuinely differ. Ordering asks *"what may I choose for THIS
 * dish"* and never sees a group that is switched off; maintaining asks *"which
 * of my sheets is still doing work"*, and a group attached to nothing — or
 * switched off in March — is precisely the row that answers it.
 *
 * @mixin ModifierGroup
 */
final class ModifierGroupSheetResource extends JsonResource
{
    /**
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            // Resolved for the request's X-Locale by HasTranslations, like every
            // other name the console reads.
            'title' => $this->title,
            'is_multi' => $this->is_multi,
            'min_choices' => $this->min_choices,
            'max_choices' => $this->max_choices,
            'sort' => $this->sort,
            'is_active' => $this->is_active,
            /*
             * How many dishes ask this question.
             *
             * `whenCounted` rather than a plain read: a caller that forgot the
             * `withCount` would otherwise get a silent zero, and "used by 0
             * dishes" is exactly the sentence a manager would act on by
             * deleting the group.
             */
            'used_by' => $this->whenCounted('items'),
            'choices' => $this->whenLoaded('options', fn (): array => $this->options
                ->map(static fn (ModifierOption $option): array => [
                    'id' => $option->id,
                    'title' => $option->title,
                    'price_delta_tiyin' => $option->price_delta,
                    'is_active' => $option->is_active,
                ])
                ->values()
                ->all()),
        ];
    }
}
