<?php

declare(strict_types=1);

namespace Modules\Marketplace\Http\Requests;

use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;
use Illuminate\Validation\Rules\In;

/**
 * The fields a marketplace customer owns.
 *
 * The phone is not here: it is the identity, and changing it is a sign-in
 * rather than an edit. Neither are `points` nor `plus_until` — those are the
 * platform's to write, and a request body that could set them would be a
 * subscription anybody could grant themselves.
 *
 * `notification_prefs` is the third, and it is the guest's alone. Each key is
 * `sometimes` rather than `required`, so a client that only knows about three
 * of the four switches does not turn the fourth off by omission — which is what
 * a whole-object PUT would do the first time an old build of the app saved
 * anything.
 */
final class UpdateConsumerRequest extends FormRequest
{
    /** The route carries the consumer token; there is no permission to check. */
    public function authorize(): bool
    {
        return true;
    }

    /**
     * @return array<string, list<ValidationRule|In|string>>
     */
    public function rules(): array
    {
        return [
            'name' => ['sometimes', 'string', 'max:120'],
            'locale' => ['sometimes', Rule::in(['uz', 'ru', 'en'])],

            'notification_prefs' => ['sometimes', 'array'],
            'notification_prefs.orders' => ['sometimes', 'boolean'],
            'notification_prefs.delivery' => ['sometimes', 'boolean'],
            'notification_prefs.promos' => ['sometimes', 'boolean'],
            'notification_prefs.newsletter' => ['sometimes', 'boolean'],
        ];
    }
}
