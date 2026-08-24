<?php

declare(strict_types=1);

namespace Modules\Pos\Http\Requests;

use App\Contracts\Orders\BillRegistry;
use Illuminate\Foundation\Http\FormRequest;

final class AddLineRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    /**
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        return [
            'menu_item_id' => ['required', 'integer', 'min:1'],
            'quantity' => ['sometimes', 'integer', 'min:1', 'max:999'],
            'note' => ['nullable', 'string', 'max:255'],
            // No unit price. The catalogue decides what a dish costs; a manager
            // who genuinely needs to override it goes through an approval, and
            // happy hour goes through a price rule.

            /*
             * Which guest, and which bill.
             *
             * `sometimes` rather than required, and the default of 1 is the
             * truth for a counter sale: one guest, one bill. A table of four
             * splitting two ways says so per line as the order is taken, which
             * is the whole reason Q4 put the seat on the line.
             *
             * 24 seats is a long table, not a limit anybody will meet; the
             * ceiling exists so a typo cannot create seat 9 999 and make the
             * cart's guest segments unusable.
             */
            'seat_no' => ['sometimes', 'integer', 'min:1', 'max:24'],
            'bill_no' => ['sometimes', 'integer', 'min:1', 'max:'.BillRegistry::BILLS_PER_TABLE],

            // Option ids from GET /pos/menu. Priced and checked against this
            // dish by the catalogue — never trusted from here.
            'modifiers' => ['sometimes', 'array', 'max:20'],
            'modifiers.*' => ['integer', 'min:1'],
        ];
    }
}
