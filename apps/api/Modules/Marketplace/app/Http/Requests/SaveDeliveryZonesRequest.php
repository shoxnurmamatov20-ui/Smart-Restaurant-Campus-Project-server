<?php

declare(strict_types=1);

namespace Modules\Marketplace\Http\Requests;

use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Foundation\Http\FormRequest;

/**
 * The whole boundary, as it should be.
 *
 * A PUT of the list rather than four endpoints that add, edit, reorder and
 * delete — the same choice `ConsumerProfileController::saveAddresses()` made and
 * for a stronger reason here: a merchant editing a boundary is thinking about
 * the shape as a whole, and a sequence of four calls leaves the shop reachable
 * from a ring it no longer serves for however long the third one takes.
 *
 * ---------------------------------------------------------------------------
 * Kilometres in, metres stored
 *
 * A person types 3.5, the column keeps 3500, and no float is ever written. The
 * rule accepts a decimal because refusing one would make a merchant express
 * three and a half kilometres as either three or four, and the difference is a
 * district.
 *
 * Fifty kilometres is the ceiling — beyond that a hot meal is not a delivery,
 * and a zone that big is somebody having typed metres into a kilometre field.
 */
final class SaveDeliveryZonesRequest extends FormRequest
{
    /** Route middleware (`permission:marketplace.manage`) enforces authorisation. */
    public function authorize(): bool
    {
        return true;
    }

    /**
     * @return array<string, list<ValidationRule|string>>
     */
    public function rules(): array
    {
        return [
            // An empty array is legal and means "no boundary" — which reads as
            // everywhere, not nowhere. See `DeliveryReach`.
            'zones' => ['present', 'array', 'max:12'],

            'zones.*.label' => ['required', 'string', 'max:60'],
            'zones.*.radius_km' => ['required', 'numeric', 'min:0.2', 'max:50'],
            'zones.*.latitude' => ['required', 'numeric', 'between:-90,90'],
            'zones.*.longitude' => ['required', 'numeric', 'between:-180,180'],

            // Money is integer tiyin. Null falls back to the storefront's own.
            'zones.*.fee_tiyin' => ['nullable', 'integer', 'min:0', 'max:1000000000'],
            'zones.*.min_order_tiyin' => ['nullable', 'integer', 'min:0', 'max:1000000000'],
        ];
    }
}
