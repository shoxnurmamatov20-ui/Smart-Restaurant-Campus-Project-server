<?php

declare(strict_types=1);

namespace Modules\Marketplace\Http\Requests;

use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;
use Illuminate\Validation\Rules\In;
use Modules\Marketplace\Models\Promotion;

/**
 * A new offer, with the budget it may spend.
 *
 * The code is unique across the whole marketplace rather than per restaurant,
 * because a guest types it into a box that does not yet know which shop they are
 * buying from. `unique:` against this module's own table is allowed —
 * `ModuleBoundaryTest` only refuses one aimed at another module's.
 *
 * ---------------------------------------------------------------------------
 * The table is schema-qualified, and that is not decoration
 *
 * An unqualified table name in this rule resolved through the connection's
 * `search_path`, and CRM has a table of the same name — a restaurant's own
 * campaigns, which are a different thing entirely. Whichever schema the path
 * happened to list first decided which rows a marketplace promo code was
 * checked against, and `ModuleBoundaryTest` reads the bare name as this module
 * reaching into CRM's. Naming `marketplace.promotions` removes both at once.
 */
final class StorePromotionRequest extends FormRequest
{
    /** Route middleware (`permission:marketplace.create`) enforces authorisation. */
    public function authorize(): bool
    {
        return true;
    }

    /**
     * @return array<string, list<ValidationRule|In|string>>
     */
    public function rules(): array
    {
        return [
            'code' => ['nullable', 'string', 'max:32', 'regex:/^[A-Za-z0-9-]+$/', 'unique:marketplace.promotions,code'],

            'title' => ['required', 'array'],
            'title.uz' => ['required', 'string', 'max:160'],
            'title.ru' => ['nullable', 'string', 'max:160'],
            'title.en' => ['nullable', 'string', 'max:160'],

            'body' => ['nullable', 'array'],
            'body.uz' => ['nullable', 'string', 'max:500'],
            'body.ru' => ['nullable', 'string', 'max:500'],
            'body.en' => ['nullable', 'string', 'max:500'],

            'kind' => ['required', Rule::in(Promotion::KINDS)],
            'state' => ['nullable', Rule::in(Promotion::STATES)],

            'discount_tiyin' => ['nullable', 'integer', 'min:0', 'max:1000000000'],

            /*
             * The budget is required and the discount is not, because an offer
             * with no ceiling is the one way a merchant can lose an unbounded
             * amount of money on this platform. `spendable()` is what enforces
             * it; this is what makes sure there is something to enforce.
             */
            'budget_tiyin' => ['required', 'integer', 'min:0', 'max:100000000000'],

            'starts_on' => ['nullable', 'date'],
            'ends_on' => ['nullable', 'date', 'after_or_equal:starts_on'],
        ];
    }

    /**
     * @return array<string, string>
     */
    public function messages(): array
    {
        return [
            'code.unique' => 'Bu promo-kod bozorda allaqachon band.',
        ];
    }
}
