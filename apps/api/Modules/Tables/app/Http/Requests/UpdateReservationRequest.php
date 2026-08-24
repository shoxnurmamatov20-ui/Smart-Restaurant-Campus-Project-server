<?php

declare(strict_types=1);

namespace Modules\Tables\Http\Requests;

use App\Support\Tenancy\TenantContext;
use Illuminate\Database\Query\Builder;
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
            /*
             * Which venue. `BelongsToBranch` fills it from `X-Branch` when the
             * caller is standing in one; an owner reading the whole business
             * sends no such header and has to say. Scoped to this restaurant's
             * own branches, or a booking could be filed at a competitor's venue.
             */
            'branch_id' => ['nullable', 'integer', Rule::exists('branches', 'id')
                ->where(fn (Builder $query) => $query->where('tenant_id', app(TenantContext::class)->id()))],
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
