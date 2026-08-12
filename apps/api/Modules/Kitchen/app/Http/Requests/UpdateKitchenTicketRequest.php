<?php

declare(strict_types=1);

namespace Modules\Kitchen\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;
use Modules\Kitchen\Models\KitchenTicket;

final class UpdateKitchenTicketRequest extends FormRequest
{
    /**
     * Route middleware (`permission:kitchen.update`) enforces authorisation.
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
            'order_id' => ['sometimes', 'integer', 'min:1'],
            'order_number' => ['sometimes', 'string', 'max:24'],
            'station' => ['sometimes', 'string', 'max:32'],
            'table_label' => ['nullable', 'string', 'max:32'],
            'channel' => ['nullable', 'string', 'max:16'],
            'status' => ['nullable', Rule::in(KitchenTicket::STATUSES)],
            'lines' => ['nullable', 'array'],
            'sla_minutes' => ['nullable', 'integer', 'min:1', 'max:240'],
        ];
    }
}
