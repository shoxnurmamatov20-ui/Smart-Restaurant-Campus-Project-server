<?php

declare(strict_types=1);

namespace Modules\Marketplace\Http\Requests;

use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Foundation\Http\FormRequest;

/**
 * What a restaurant may change about its own shop window.
 *
 * Two things are absent rather than filtered, so that no path reaches them.
 * `status` is the platform's word on whether this shop is on the market at all —
 * a merchant who could set it to `live` would review themselves. And
 * `commission_percent` is a commercial term: a field a merchant can type into is
 * a commission of zero.
 *
 * `slug` is absent too, and that one is about links: it is a public URL that
 * lives in guests' history and in search results, and renaming it silently
 * breaks every one of them.
 */
final class UpdateStoreSettingsRequest extends FormRequest
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
            'name' => ['sometimes', 'string', 'max:120'],
            'kind' => ['sometimes', 'array'],
            'kind.uz' => ['nullable', 'string', 'max:160'],
            'kind.ru' => ['nullable', 'string', 'max:160'],
            'kind.en' => ['nullable', 'string', 'max:160'],

            // The switch on the header: taking orders, or not.
            'is_open' => ['sometimes', 'boolean'],

            // Money is integer tiyin, always. 12 000 so'm = 1 200 000.
            'delivery_fee_tiyin' => ['sometimes', 'integer', 'min:0', 'max:1000000000'],
            'min_order_tiyin' => ['sometimes', 'integer', 'min:0', 'max:1000000000'],

            /*
             * The window the card prints. Bounded at both ends and ordered:
             * a shop promising "5–10 daq" is promising something no kitchen can
             * do, and one whose window runs backwards renders as "40–20 daq".
             */
            'minutes_from' => ['sometimes', 'integer', 'min:5', 'max:180'],
            'minutes_to' => ['sometimes', 'integer', 'min:5', 'max:240', 'gte:minutes_from'],

            'logo_url' => ['sometimes', 'nullable', 'url', 'max:500'],
            'cover_url' => ['sometimes', 'nullable', 'url', 'max:500'],

            'latitude_e6' => ['sometimes', 'nullable', 'integer', 'between:-90000000,90000000'],
            'longitude_e6' => ['sometimes', 'nullable', 'integer', 'between:-180000000,180000000'],

            /*
             * Which of the platform's messages this shop wants. Five keys, each
             * `sometimes`, so a client that knows about four of them does not
             * silently switch the fifth off — and a shop that turned off
             * `new_order` would simply stop hearing that food had been sold.
             */
            'notification_prefs' => ['sometimes', 'array'],
            'notification_prefs.new_order' => ['sometimes', 'boolean'],
            'notification_prefs.dispute' => ['sometimes', 'boolean'],
            'notification_prefs.settlement' => ['sometimes', 'boolean'],
            'notification_prefs.placement' => ['sometimes', 'boolean'],
            'notification_prefs.marketing' => ['sometimes', 'boolean'],
        ];
    }
}
