<?php

declare(strict_types=1);

namespace Modules\Tables\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

/**
 * "Ofitsiantni chaqirish" — a raised hand, sent from the phone in the guest's
 * own hand rather than by catching somebody's eye.
 *
 * Three fields, two of them optional, and that is the whole point: a guest who
 * needs a waiter needs a waiter now, and a form is the opposite of that. The
 * table is proved by the token in the URL and the time is when the request
 * arrives, so there is nothing left to ask.
 *
 * `kind` is deliberately not a field. Asking for a waiter and asking for the
 * bill are two endpoints, because the second one also moves a bill, and an
 * endpoint that did either depending on a string in the body would be one
 * `if` between "somebody is coming" and "we are being charged".
 */
final class PublicTableCallRequest extends FormRequest
{
    /** Anonymous by design — the QR token is the credential. See the route. */
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
            // Which chair, when the screen knows. It is what turns "table 7
            // wants something" into a waiter walking to the right side of it.
            'seat_no' => ['nullable', 'integer', 'min:1', 'max:20'],

            /*
             * Short on purpose. This lands on a handset in an apron pocket and
             * is read at a glance while somebody is carrying plates — "yana non"
             * fits, and a paragraph does not get read at all.
             */
            'note' => ['nullable', 'string', 'max:200'],
        ];
    }
}
