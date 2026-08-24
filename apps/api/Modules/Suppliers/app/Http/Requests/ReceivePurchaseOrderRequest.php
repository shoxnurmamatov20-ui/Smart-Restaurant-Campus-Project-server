<?php

declare(strict_types=1);

namespace Modules\Suppliers\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

/**
 * Signing for a van, line by line — or signing for it whole.
 *
 * `lines` is optional and that is the compatibility rule rather than laziness:
 * the storekeeper's phone confirms a whole document at the service entrance
 * (`POST /v1/staff/actions`, `receive_confirm`) and has no counts to send, and
 * the purchasing screen's own button did the same until the receiving table
 * grew a "received" column. A body with no `lines` means what it has always
 * meant — everything ordered arrived — and every line keeps a null
 * `received_quantity`, which the screen draws as "nobody counted".
 *
 * `received_quantity` may be zero. A line that did not come at all is exactly
 * the case the variance column exists for, and refusing zero would force the
 * person counting to either lie or leave the line out.
 *
 * There is no upper bound relative to the order. Over-delivery happens — a
 * supplier rounds a 4.5 kg order up to a 5 kg box — and the shelf should carry
 * what is on it. What the restaurant OWES is untouched either way: the order's
 * total is what was invoiced, and correcting an invoice is a credit note
 * between two businesses rather than something a tablet decides.
 */
final class ReceivePurchaseOrderRequest extends FormRequest
{
    /** Route middleware (`permission:suppliers.update`) enforces authorisation. */
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
            'lines' => ['sometimes', 'array', 'max:200'],
            'lines.*.id' => ['required', 'integer'],
            'lines.*.received_quantity' => ['required', 'integer', 'min:0', 'max:100000000'],
        ];
    }

    /**
     * The counts keyed by line id, ready for `EloquentReceiving::post()`.
     *
     * Lines belonging to another order are dropped by the controller rather
     * than here: this request has no order in hand, and a rule that guessed
     * would be a rule that could be wrong about which document it was reading.
     *
     * @return array<int, int>
     */
    public function counts(): array
    {
        $counts = [];

        /** @var array<int, array{id: int, received_quantity: int}> $lines */
        $lines = $this->validated()['lines'] ?? [];

        foreach ($lines as $line) {
            $counts[(int) $line['id']] = (int) $line['received_quantity'];
        }

        return $counts;
    }
}
