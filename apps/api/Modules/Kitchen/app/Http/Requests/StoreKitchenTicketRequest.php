<?php

declare(strict_types=1);

namespace Modules\Kitchen\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;
use Modules\Kitchen\Models\KitchenTicket;

final class StoreKitchenTicketRequest extends FormRequest
{
    /**
     * Route middleware (`permission:kitchen.create`) enforces authorisation.
     */
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
            'order_id' => ['required', 'integer', 'min:1'],
            'order_number' => ['required', 'string', 'max:24'],
            'station' => ['required', 'string', 'max:32'],
            'table_label' => ['nullable', 'string', 'max:32'],
            'channel' => ['nullable', 'string', 'max:16'],
            'status' => ['nullable', Rule::in(KitchenTicket::STATUSES)],
            'lines' => ['nullable', 'array'],
            'sla_minutes' => ['nullable', 'integer', 'min:1', 'max:240'],
        ];
    }
}
