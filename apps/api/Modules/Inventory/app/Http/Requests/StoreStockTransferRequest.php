<?php

declare(strict_types=1);

namespace Modules\Inventory\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

/**
 * Stock moving from one venue to another.
 *
 * `different:from_branch_id` is the only rule here that is about the product
 * rather than the shape. A transfer to yourself posts `-25` and `+25` against
 * the same shelf, leaves a pair of movement rows that cancel, and looks on
 * every screen exactly like a transfer that worked — which is why the console's
 * own form disables the button for it and why the server refuses it too. A
 * validation both ends agree on is one a person cannot reach by pressing Enter
 * before the select has updated.
 *
 * `send` decides whether the van leaves now. Defaulted to true because that is
 * what the operations screen's single button does; a draft is for the manager
 * who is building a list across a morning and does not want the origin's shelf
 * emptied while they think.
 */
final class StoreStockTransferRequest extends FormRequest
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
            'from_branch_id' => ['required', 'integer', Rule::exists('branches', 'id')],
            'to_branch_id' => [
                'required', 'integer', 'different:from_branch_id', Rule::exists('branches', 'id'),
            ],
            'note' => ['nullable', 'string', 'max:255'],
            'send' => ['sometimes', 'boolean'],

            'lines' => ['required', 'array', 'min:1', 'max:200'],
            'lines.*.ingredient_id' => ['required', 'integer'],
            // Unsigned, because direction is the transfer's rather than the
            // line's. A negative quantity here would be a transfer that ran
            // backwards while still saying it went the other way.
            'lines.*.quantity' => ['required', 'integer', 'min:1'],
        ];
    }
}
