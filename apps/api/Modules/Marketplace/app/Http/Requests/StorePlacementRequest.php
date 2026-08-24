<?php

declare(strict_types=1);

namespace Modules\Marketplace\Http\Requests;

use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;
use Illuminate\Validation\Rules\In;
use Modules\Marketplace\Models\Placement;

/**
 * Booking a banner: which slot, from when, for how many days.
 *
 * The price is NOT here, for the same reason a basket carries no prices: a
 * merchant panel is a web page, and a field naming its own day rate is a banner
 * bought for nothing. `Placement::DAY_RATE_TIYIN` is the list and the controller
 * snapshots it onto the row.
 *
 * Neither is the queue position. Whether this booking is first or fourth in line
 * is a fact about the dates other merchants already hold, and a client that sent
 * it would be a client that could jump the queue.
 */
final class StorePlacementRequest extends FormRequest
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
            'slot' => ['required', Rule::in(Placement::SLOTS)],

            /*
             * Today at the earliest. A banner cannot be bought for last
             * Tuesday, and `after_or_equal:today` refuses that without needing
             * the controller to compare dates a second time.
             */
            'starts_on' => ['required', 'date', 'after_or_equal:today'],

            // Two weeks. Longer is a contract somebody negotiates, and a
            // merchant able to book a year would take a slot off the market.
            'days' => ['required', 'integer', 'min:1', 'max:'.Placement::MAX_DAYS],
        ];
    }
}
