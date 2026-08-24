<?php

declare(strict_types=1);

namespace Modules\Finance\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;
use Modules\Finance\Models\FixedAsset;

/**
 * Correcting a register entry, or disposing of one.
 *
 * A disposal is an update rather than a delete, and that is the whole shape of
 * this class: `disposed_on` stops the clock, the row stays, and every statement
 * that already carried its charge still adds up.
 */
final class UpdateFixedAssetRequest extends FormRequest
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
            'branch_id' => ['sometimes', 'nullable', 'integer', 'exists:branches,id'],
            'name' => ['sometimes', 'string', 'max:160'],
            'category' => ['sometimes', Rule::in(FixedAsset::CATEGORIES)],
            'acquired_on' => ['sometimes', 'date'],
            'cost' => ['sometimes', 'integer', 'min:1'],
            'residual' => ['sometimes', 'integer', 'min:0'],
            'useful_life_months' => ['sometimes', 'integer', 'min:1', 'max:600'],
            'disposed_on' => ['sometimes', 'nullable', 'date'],
            'note' => ['sometimes', 'nullable', 'string', 'max:255'],
        ];
    }
}
