<?php

declare(strict_types=1);

namespace Modules\Inventory\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

/**
 * A count sheet, closed.
 *
 * One shape for two screens, and deliberately: the store screen's correction
 * drawer is a count of exactly one row, and the operations tab's count sheet is
 * a count of forty. Two endpoints would be two ways to write the same movement,
 * and the second one written would be the one that forgot the variance.
 *
 * Quantities are **absolute and in base units** — what the person actually
 * counted, not the gap. A client that sent the gap would be doing the
 * subtraction against a balance that may have moved since the sheet was
 * printed, which is the one arithmetic a count exists to avoid.
 */
final class StoreStockCountRequest extends FormRequest
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
            // The sheet or the document a correction was made against — it is
            // what a manager asks for first when the variance is large.
            'reference' => ['nullable', 'string', 'max:64'],
            'reason' => ['nullable', 'string', 'max:255'],

            'lines' => ['required', 'array', 'min:1', 'max:500'],
            'lines.*.ingredient_id' => ['required', 'integer'],
            // Never negative: a shelf holds nothing or something. A negative
            // count is a typed minus sign, and accepting it would post a
            // variance twice the size of the real one.
            'lines.*.counted' => ['required', 'integer', 'min:0'],
        ];
    }
}
