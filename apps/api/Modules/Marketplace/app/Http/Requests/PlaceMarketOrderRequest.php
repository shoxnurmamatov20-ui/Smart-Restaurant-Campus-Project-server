<?php

declare(strict_types=1);

namespace Modules\Marketplace\Http\Requests;

use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;
use Illuminate\Validation\Rules\In;

/**
 * A basket, on its way to a kitchen.
 *
 * Read the list of rules for what is NOT here: no price, no subtotal, no
 * total, no delivery fee, no commission, no `plus` flag. Every one of those is
 * the server's, and a rule that accepted them would be a marketplace where a
 * page a stranger can edit decides what dinner costs. `MarketOrders::place()`
 * reads all of them from the catalogue, the storefront and the account.
 *
 * `exists:` is deliberately absent from `menu_item_id` too, and for a second
 * reason: `menu.menu_items` belongs to another module, and
 * `ModuleBoundaryTest` refuses an `exists:` rule against another module's table
 * by name. The dish is resolved through `MenuCatalog` where it can be priced
 * and its availability checked at the same time — one lookup rather than a
 * validation pass that proves nothing about whether it can be cooked.
 */
final class PlaceMarketOrderRequest extends FormRequest
{
    /** The route carries the consumer token; there is no permission to check. */
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
            'store' => ['required', 'string', 'max:80'],

            // Forty lines is a party order and still renders on a receipt; a
            // basket longer than that is a script rather than a dinner.
            'lines' => ['required', 'array', 'min:1', 'max:40'],
            'lines.*.menu_item_id' => ['required', 'integer', 'min:1'],
            'lines.*.quantity' => ['required', 'integer', 'min:1', 'max:99'],
            'lines.*.note' => ['nullable', 'string', 'max:255'],

            'address' => ['required', 'string', 'max:255'],
            'address_note' => ['nullable', 'string', 'max:255'],
            'latitude' => ['nullable', 'numeric', 'between:-90,90'],
            'longitude' => ['nullable', 'numeric', 'between:-180,180'],

            'pay_rail' => ['nullable', Rule::in(['click', 'payme', 'uzum', 'cash'])],
            'promo_code' => ['nullable', 'string', 'max:32'],

            /*
             * The basket id the app minted, and what makes a replayed POST one
             * order rather than two meals. It stands in for `Idempotency-Key`,
             * which cannot work on a tenant-less route — see the migration and
             * `IdempotencyCoverageTest`.
             *
             * Optional, because a client that does not send one still gets to
             * eat; it simply forfeits the guarantee. Refusing the request would
             * make every old build of the app stop working on the day this
             * shipped.
             */
            'client_reference' => ['nullable', 'string', 'max:64', 'regex:/^[A-Za-z0-9._:-]+$/'],
        ];
    }
}
