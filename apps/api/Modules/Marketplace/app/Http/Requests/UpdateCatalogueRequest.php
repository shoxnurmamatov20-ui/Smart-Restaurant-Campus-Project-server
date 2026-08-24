<?php

declare(strict_types=1);

namespace Modules\Marketplace\Http\Requests;

use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Foundation\Http\FormRequest;

/**
 * A batch of catalogue rows, as the screen saves them.
 *
 * Either `markup_tiyin` or `market_price_tiyin` may be sent — the second is
 * converted against today's house price by the controller. Both are offered
 * because a merchant thinks in the price on the card while the column stores
 * the difference, for the reason on the migration.
 *
 * `markup_tiyin` is signed: a restaurant running an introductory offer sells
 * cheaper on the market than in the room, and forcing that through a promotion
 * would be making them use the wrong feature.
 */
final class UpdateCatalogueRequest extends FormRequest
{
    /** Route middleware (`permission:marketplace.update`) enforces authorisation. */
    public function authorize(): bool
    {
        return true;
    }

    /**
     * @return array<string, list<ValidationRule|string>>
     */
    public function rules(): array
    {
        return [
            'items' => ['required', 'array', 'min:1', 'max:300'],
            'items.*.menu_item_id' => ['required', 'integer', 'min:1'],
            'items.*.markup_tiyin' => ['sometimes', 'integer', 'between:-1000000000,1000000000'],
            'items.*.market_price_tiyin' => ['sometimes', 'integer', 'min:0', 'max:1000000000'],
            'items.*.is_listed' => ['sometimes', 'boolean'],
            'items.*.sort_order' => ['sometimes', 'integer', 'min:0', 'max:65535'],
        ];
    }
}
