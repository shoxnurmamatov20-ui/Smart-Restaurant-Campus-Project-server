<?php

declare(strict_types=1);

namespace Modules\Inventory\Http\Requests;

use App\Support\Tenancy\TenantContext;
use Illuminate\Database\Query\Builder;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;
use Modules\Inventory\Models\PrepItem;

/**
 * A new prep card: what the kitchen makes, out of what, and how much survives.
 *
 * The counterpart to `StorePrepBatchRequest`, which produces a batch of a card
 * that already exists. This one creates the card, and the stakes are different
 * enough to be worth saying: producing a batch moves stock and can be corrected
 * with a write-off, while a wrong card silently changes what every dish
 * containing it costs, on every report, until somebody notices the margin.
 *
 * Hence the rules below being narrow rather than permissive:
 *
 *  - **`components` is required and non-empty.** A card with no recipe cannot
 *    be produced — `PrepController::produce()` refuses it with
 *    `stock.prep_card_empty` — so accepting one would be accepting a row whose
 *    only possible future is an error message.
 *  - **`loss_percent` stops at 90.** Not 100: `usable_yield` divides by the
 *    yield, and a card entered at 100% loss is a typo that would make every
 *    dish costed against it infinitely expensive. The model clamps at 99 as
 *    well; refusing here is what lets somebody see they mistyped.
 *  - **`unit` is `g` or `ml` and never a purchase unit.** A balance is held in
 *    base units everywhere in this module, and "2 trays of dough" is a sentence
 *    no stock-take can reconcile.
 */
final class StorePrepItemRequest extends FormRequest
{
    /** Route middleware (`permission:inventory.create`) enforces authorisation. */
    public function authorize(): bool
    {
        return true;
    }

    /**
     * @return array<string, array<int, mixed>>
     */
    public function rules(): array
    {
        $tenantId = app(TenantContext::class)->id();

        return [
            /*
             * The short name a recipe card refers to — `zirvak`, `dough`.
             * Unique per restaurant rather than globally: two restaurants both
             * making zirvak is the normal case, and a uniqueness rule that
             * spanned them would make the second one invent a word.
             */
            'code' => [
                'required', 'string', 'max:32', 'regex:/^[a-z0-9][a-z0-9_-]*$/',
                Rule::unique('prep_items', 'code')
                    ->where(fn (Builder $query) => $query->where('tenant_id', $tenantId)),
            ],
            // Trilingual like every staff- and guest-visible name here; uz is
            // the one that must be there, because it is the fallback.
            'name' => ['required', 'array'],
            'name.uz' => ['required', 'string', 'max:120'],
            'name.ru' => ['nullable', 'string', 'max:120'],
            'name.en' => ['nullable', 'string', 'max:120'],

            'unit' => ['required', Rule::in(PrepItem::UNITS)],
            'batch_quantity' => ['required', 'integer', 'min:1', 'max:1000000'],
            'loss_percent' => ['nullable', 'integer', 'min:0', 'max:90'],
            'shelf_life_days' => ['nullable', 'integer', 'min:0', 'max:365'],

            'components' => ['required', 'array', 'min:1', 'max:40'],
            'components.*.ingredient_id' => ['required', 'integer', 'exists:ingredients,id'],
            // Base units of the ingredient in ONE batch. Integer for the same
            // reason money is: a float gram accumulates error over a month of
            // production and the stock-take never balances.
            'components.*.quantity' => ['required', 'integer', 'min:1', 'max:10000000'],
        ];
    }
}
