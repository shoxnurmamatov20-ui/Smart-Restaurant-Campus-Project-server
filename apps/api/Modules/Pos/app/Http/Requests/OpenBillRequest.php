<?php

declare(strict_types=1);

namespace Modules\Pos\Http\Requests;

use App\Support\Orders\OrderChannel;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

final class OpenBillRequest extends FormRequest
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
            // From the enum, not a fourth copy of the list.
            'channel' => ['required', 'string', Rule::in(OrderChannel::values())],
            'table_id' => ['nullable', 'integer', 'min:1'],
            'table_label' => ['nullable', 'string', 'max:32'],
            'customer_id' => ['nullable', 'integer', 'min:1'],
            'guests' => ['sometimes', 'integer', 'min:1', 'max:200'],
            // The waiter is taken from the session, never from the body: a
            // client that could name the waiter could attribute its sales to
            // somebody else.
        ];
    }
}
