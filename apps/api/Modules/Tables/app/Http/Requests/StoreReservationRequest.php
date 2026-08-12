<?php

declare(strict_types=1);

namespace Modules\Tables\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;
use Modules\Tables\Models\Reservation;

final class StoreReservationRequest extends FormRequest
{
    /**
     * Route middleware (`permission:tables.create`) enforces authorisation.
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
            'guest_name' => ['required', 'string', 'max:120'],
            'guest_phone' => ['required', 'string', 'max:32'],
            'guests_count' => ['required', 'integer', 'min:1', 'max:200'],
            'starts_at' => ['required', 'date', 'after:now'],
            'ends_at' => ['nullable', 'date', 'after:starts_at'],
            'status' => ['nullable', Rule::in(Reservation::STATUSES)],
            'source' => ['nullable', Rule::in(Reservation::SOURCES)],
            'note' => ['nullable', 'string', 'max:2000'],
        ];
    }

    /**
     * @return array<string, string>
     */
    public function messages(): array
    {
        return [
            'starts_at.after' => "Bron vaqti o'tmishda bo'lishi mumkin emas.",
            'guest_phone.required' => 'Telefon raqami majburiy — bronni tasdiqlash uchun kerak.',
        ];
    }
}
