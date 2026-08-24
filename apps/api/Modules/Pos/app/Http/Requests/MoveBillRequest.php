<?php

declare(strict_types=1);

namespace Modules\Pos\Http\Requests;

use App\Support\Orders\BillSplit;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Validator;

/**
 * Splitting, merging and moving a bill around the room.
 *
 * Three shapes for `split` and they are mutually exclusive: `line_ids` (by
 * dish), `ways` (equal shares) or `amount_tiyin` (a named figure). Sending two
 * is refused rather than resolved by precedence — a till that meant one of them
 * and sent two has a bug, and guessing which would produce a bill nobody asked
 * for at the moment a table is dividing money in front of a guest.
 */
final class MoveBillRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    /**
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        return [
            // split, by dish
            'line_ids' => ['sometimes', 'array', 'min:1'],
            'line_ids.*' => ['integer', 'min:1'],

            /*
             * split, by money — the design's other two buttons.
             *
             * `ways` divides the total into equal shares; `amount_tiyin` takes
             * one named figure off onto a bill of its own. Neither carries
             * `line_ids`, because there are no lines to hand over: the division
             * is by money rather than by dish, and the server mints the sibling
             * bills itself.
             *
             * Where the rounding lands is deliberately NOT a field here. It is
             * `App\Support\Orders\BillSplit`'s rule, server-side, because the
             * shares have to add back up to the bill and only one place can
             * decide who takes the remainder.
             *
             * The bounds mirror the guest app's own stepper (2..12) — the two
             * surfaces settle the same bill, so they cannot disagree about how
             * many people may settle it.
             */
            'ways' => ['sometimes', 'integer', 'min:'.BillSplit::WAYS_MIN, 'max:'.BillSplit::WAYS_MAX],
            'amount_tiyin' => ['sometimes', 'integer', 'min:1'],
            // merge
            'target_bill_id' => ['sometimes', 'integer', 'min:1'],
            // transfer
            'table_id' => ['sometimes', 'nullable', 'integer', 'min:1'],
            'table_label' => ['sometimes', 'nullable', 'string', 'max:32'],
            'waiter_user_id' => ['sometimes', 'nullable', 'integer', 'min:1'],
        ];
    }

    /**
     * @return array<string, string>
     */
    public function messages(): array
    {
        return [
            'ways.min' => 'Bitta mehmon — bu bo\'lish emas.',
            'ways.max' => 'Hisob :max qismgacha bo\'linadi.',
        ];
    }

    public function withValidator(Validator $validator): void
    {
        $validator->after(function (Validator $check): void {
            $asked = array_filter(
                ['line_ids', 'ways', 'amount_tiyin'],
                fn (string $field): bool => $this->has($field),
            );

            if (count($asked) > 1) {
                // Named on the second field rather than the first, so the
                // message points at what to remove.
                $check->errors()->add(
                    (string) array_values($asked)[1],
                    'Hisobni bir vaqtda bir necha usulda bo\'lib bo\'lmaydi.',
                );
            }
        });
    }
}
