<?php

declare(strict_types=1);

namespace Modules\Tables\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

/**
 * A guest sitting at a table, adding food to the bill from their own phone.
 *
 * The shortest write on this platform, and deliberately: the table is proved by
 * the token in the URL, the prices come from the catalogue, and the bill is
 * whichever one is already open. What is left is what only the guest knows —
 * which dishes, how many, and which chair they are for.
 *
 * ---------------------------------------------------------------------------
 * What a guest at a table may NOT say
 *
 * **Which bill.** `bill_no` exists on a line and splits a table four ways, and
 * it is a waiter's decision made with the table in front of them. A phone that
 * could choose would put its owner's food on somebody else's cheque.
 *
 * **The channel.** A guest at a table is dining in. There is no honest reading
 * of a QR order that arrives claiming to be a delivery.
 *
 * **Anything that is money.** Same rule as everywhere: the catalogue is asked.
 *
 * `seat_no` IS a guest's to set, and is the one field here that is not obvious.
 * It is what makes splitting a bill at the end of the meal arithmetic rather
 * than memory — Q4 put the seat on the line for exactly this — and a phone
 * ordering for itself knows which chair it is sitting in when nobody else does.
 */
final class PublicTableOrderRequest extends FormRequest
{
    /** How many distinct lines one QR order may carry. */
    public const MAX_LINES = 30;

    /** Anonymous by design — the QR token is the credential. See the route. */
    public function authorize(): bool
    {
        return true;
    }

    /**
     * @return array<string, array<int, mixed>>
     */
    public function rules(): array
    {
        return [
            'items' => ['required', 'array', 'min:1', 'max:'.self::MAX_LINES],
            /*
             * Existence goes through App\Contracts\Menu\MenuCatalog, never an
             * `exists:` rule: Tables must not name Menu's table, and the
             * contract already answers per restaurant.
             */
            'items.*.menu_item_id' => ['required', 'integer', 'min:1'],
            'items.*.quantity' => ['required', 'integer', 'min:1', 'max:99'],
            'items.*.modifier_choice_ids' => ['sometimes', 'array', 'max:12'],
            'items.*.modifier_choice_ids.*' => ['integer', 'min:1'],
            'items.*.note' => ['nullable', 'string', 'max:200'],
            // Twenty chairs is a banqueting table; past that somebody has put a
            // party number in the seat field.
            'items.*.seat_no' => ['nullable', 'integer', 'min:1', 'max:20'],

            /*
             * The chair this whole basket is for, when the lines do not say.
             * A phone ordering for itself knows which seat it is sitting in;
             * a tablet passed round the table sets it per line.
             */
            'seat_no' => ['nullable', 'integer', 'min:1', 'max:20'],
        ];
    }

    /**
     * @return array<string, string>
     */
    public function messages(): array
    {
        return [
            'items.required' => "Savat bo'sh — avval taom tanlang.",
            'items.max' => 'Bitta yuborishda :max tagacha qator bo\'lishi mumkin.',
        ];
    }
}
