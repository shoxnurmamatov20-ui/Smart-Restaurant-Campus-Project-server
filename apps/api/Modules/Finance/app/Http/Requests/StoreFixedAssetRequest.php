<?php

declare(strict_types=1);

namespace Modules\Finance\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;
use Modules\Finance\Models\FixedAsset;

/**
 * Putting something on the register.
 *
 * `cost` is in tiyin like every other amount on this platform, and `residual`
 * has to be under it — an asset expected to be worth more at the end of its life
 * than it cost is not depreciating, and the arithmetic would run backwards.
 */
final class StoreFixedAssetRequest extends FormRequest
{
    /** Route middleware (`permission:finance.manage`) enforces authorisation. */
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
            'branch_id' => ['nullable', 'integer', 'exists:branches,id'],
            'name' => ['required', 'string', 'max:160'],
            'category' => ['required', Rule::in(FixedAsset::CATEGORIES)],
            'acquired_on' => ['required', 'date'],
            'cost' => ['required', 'integer', 'min:1'],
            'residual' => ['nullable', 'integer', 'min:0', 'lt:cost'],
            /*
             * One month to fifty years.
             *
             * The ceiling is the building's own life and the floor is a month,
             * because a life of zero divides by zero and a life of one is a
             * purchase that should have been an expense. Neither bound is a
             * guess about restaurants — they are the two values the arithmetic
             * cannot survive.
             */
            'useful_life_months' => ['required', 'integer', 'min:1', 'max:600'],
            'disposed_on' => ['nullable', 'date', 'after_or_equal:acquired_on'],
            'note' => ['nullable', 'string', 'max:255'],
        ];
    }
}
