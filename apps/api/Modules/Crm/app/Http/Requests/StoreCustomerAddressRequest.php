<?php

declare(strict_types=1);

namespace Modules\Crm\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

final class StoreCustomerAddressRequest extends FormRequest
{
    /** The customer token is the authorisation; see RequireCustomerToken. */
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
            // "Uy", "Ish", "Onamning uyi" — the guest's own word, so no
            // enumeration and no translation.
            'label' => ['required', 'string', 'max:40'],
            'line' => ['required', 'string', 'min:5', 'max:255'],

            // Strings, not integers: a podyezd is "3" and it is also "3A", a
            // floor is "1" and in one building it is "tsokol".
            'entrance' => ['nullable', 'string', 'max:16'],
            'floor' => ['nullable', 'string', 'max:16'],
            'flat' => ['nullable', 'string', 'max:16'],
            'note' => ['nullable', 'string', 'max:255'],

            /*
             * Bounded to the planet, and to each other.
             *
             * `required_with` in both directions because half a coordinate is
             * worse than none: a courier's map sent a latitude and no longitude
             * draws a point on the Greenwich meridian, in the sea, and calls it
             * the guest's flat.
             */
            'lat' => ['nullable', 'numeric', 'between:-90,90', 'required_with:lng'],
            'lng' => ['nullable', 'numeric', 'between:-180,180', 'required_with:lat'],

            'is_default' => ['nullable', 'boolean'],
        ];
    }
}
