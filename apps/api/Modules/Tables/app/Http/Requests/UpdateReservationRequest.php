<?php

declare(strict_types=1);

namespace Modules\Tables\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;
use Modules\Tables\Models\Reservation;

final class UpdateReservationRequest extends FormRequest
{
    /**
     * Route middleware (`permission:tables.update`) enforces authorisation.
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
            'restaurant_table_id' => ['nullable', 'integer', 'exists:restaurant_tables,id'],
            'guest_name' => ['sometimes', 'string', 'max:120'],
            'guest_phone' => ['sometimes', 'string', 'max:32'],
            'guests_count' => ['sometimes', 'integer', 'min:1', 'max:200'],
            'starts_at' => ['sometimes', 'date'],
            'ends_at' => ['nullable', 'date', 'after:starts_at'],
            'status' => ['nullable', Rule::in(Reservation::STATUSES)],
            'source' => ['nullable', Rule::in(Reservation::SOURCES)],
            'note' => ['nullable', 'string', 'max:2000'],
        ];
    }
}
