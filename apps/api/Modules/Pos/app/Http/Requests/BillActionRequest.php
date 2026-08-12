<?php

declare(strict_types=1);

namespace Modules\Pos\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

/**
 * Anything that takes money off a bill or puts it back on the floor.
 *
 * The reason is required, always. A void with no reason is exactly the record
 * an investigation cannot use, and "the field was optional" is how it ends up
 * empty on the ones that matter.
 */
final class BillActionRequest extends FormRequest
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
            'reason' => ['required', 'string', 'min:3', 'max:255'],
            'amount' => ['sometimes', 'integer', 'min:0'],
            'approval_id' => ['sometimes', 'integer', 'min:1'],
        ];
    }

    /**
     * @return array<string, string>
     */
    public function messages(): array
    {
        return [
            'reason.required' => 'Sabab ko\'rsatilishi shart.',
            'reason.min' => 'Sabab kamida 3 ta belgidan iborat bo\'lsin.',
        ];
    }
}
