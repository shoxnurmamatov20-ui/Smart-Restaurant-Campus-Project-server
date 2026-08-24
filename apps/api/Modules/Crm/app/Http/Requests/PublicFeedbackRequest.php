<?php

declare(strict_types=1);

namespace Modules\Crm\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

/**
 * What a guest may say, and what they may not claim.
 *
 * The four fields a stranger can never set are the four this endpoint would be
 * worth attacking for: `status` and `resolved_at` would let a complaint mark
 * itself dealt with, `customer_id` would let one guest file a review against
 * another's record, and `is_urgent` would let anybody push their review to the
 * top of a manager's screen. All four are decided on the server —
 * see PublicFeedbackController.
 */
final class PublicFeedbackRequest extends FormRequest
{
    /** Anonymous by design: the QR rating screen has no account behind it. */
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
            'score' => ['required', 'integer', 'min:1', 'max:5'],
            'comment' => ['nullable', 'string', 'max:2000'],

            /*
             * What the review is about — food, service, speed, cleanliness,
             * price. Free text rather than an enum because the list is a
             * product decision that changes without a migration, and a value
             * the console does not recognise is drawn as "other" rather than
             * refused. Capped so it cannot become a second comment field.
             */
            'aspect' => ['nullable', 'string', 'max:32'],

            // The number printed on the receipt, not an internal id. A guest
            // has the first and has never seen the second.
            'order_number' => ['nullable', 'string', 'max:32'],
            /*
             * Which table, said two ways, and only one of them is a guest's to
             * say.
             *
             * `table_id` is the console's — a manager typing a review in on
             * somebody's behalf. A guest never has it and must not: an id in a
             * URL is a small integer, and the next small integer is somebody
             * else's table.
             *
             * `table_token` is what is actually printed on the sticker: 22
             * random characters, minted once and laminated onto furniture. The
             * QR rating screen posts what it was handed, and the controller
             * resolves it through `App\Contracts\Tables\FloorBoard` — the
             * review form may not import the floor plan.
             */
            'table_id' => ['nullable', 'integer', 'min:1'],
            'table_token' => ['nullable', 'string', 'size:22'],

            'guest_name' => ['nullable', 'string', 'max:120'],
            'guest_phone' => ['nullable', 'string', 'max:24'],
        ];
    }

    /**
     * @return array<string, string>
     */
    public function messages(): array
    {
        return [
            'score.min' => 'Baho 1 dan 5 gacha bo\'lishi kerak.',
            'score.max' => 'Baho 1 dan 5 gacha bo\'lishi kerak.',
        ];
    }
}
