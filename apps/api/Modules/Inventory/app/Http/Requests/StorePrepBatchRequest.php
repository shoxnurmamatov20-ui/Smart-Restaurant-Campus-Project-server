<?php

declare(strict_types=1);

namespace Modules\Inventory\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

/**
 * The kitchen made some zirvak.
 *
 * `batches`, not "how much zirvak" — a cook works in whole batches, and a card
 * that yields 880 usable grams cannot be asked for 500 without either scaling
 * every component to a fraction of a gram or lying about the yield. Whole
 * batches keep the arithmetic integer, which is the module's rule for the same
 * reason money's is.
 *
 * Capped at 50 because the number is typed. A slipped keypress that reads 220
 * instead of 2 would take two hundred and twenty batches of beef off the shelf,
 * and the write-off that follows is a shift's work to unpick.
 */
final class StorePrepBatchRequest extends FormRequest
{
    /** Route middleware (`permission:inventory.update`) enforces authorisation. */
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
            'prep_item_id' => ['required', 'integer'],
            'batches' => ['required', 'integer', 'min:1', 'max:50'],
            'reference' => ['nullable', 'string', 'max:64'],
        ];
    }
}
