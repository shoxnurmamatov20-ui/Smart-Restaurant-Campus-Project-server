<?php

declare(strict_types=1);

namespace Modules\Pos\Http\Requests;

use App\Contracts\Finance\TillLedger;
use App\Contracts\Orders\BillRegistry;
use App\Support\Errors\ApiException;
use App\Support\Orders\BillSplit;
use App\Support\Orders\OrderChannel;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Support\Arr;
use Illuminate\Validation\Rule;
use Modules\Pos\Sync\SyncDispatcher;

/**
 * A stranded shift, handed back.
 *
 * Every field here is generated on the device, before it knew whether it was
 * online, and none of it may be inferred on this side. `local_id` is what tells
 * a replay from a second sale; `local_seq` is what tells the server which order
 * the cashier actually worked in, because the device was the only thing awake
 * for all of it.
 */
final class SyncBatchRequest extends FormRequest
{
    /**
     * Keys a device may never set, whatever it puts in the JSON.
     *
     * Both of these are written by `ConflictResolution` after a person has been
     * shown a question and answered it, and both are a way past a guard if a
     * client can set them itself:
     *
     *   `served_before_stop` lets a line carry a dish that is on the stop list.
     *   A till that could send it would sell a stopped dish all evening by
     *   claiming every plate was cooked before the stop.
     *
     *   `merged_into_bill_id` is the answer to a table conflict, not an input.
     *
     * Stripped rather than refused. A queue that 422s because of a key the
     * device should not have sent is a queue that never drains, and the entry
     * behind it is real money — dropping the key applies the write on the terms
     * the till was actually entitled to.
     *
     * @var list<string>
     */
    public const DEVICE_MAY_NOT_SET = ['served_before_stop', 'merged_into_bill_id'];

    public function authorize(): bool
    {
        return true;
    }

    /**
     * The size check happens before validation rather than as a `max:` rule.
     *
     * A `max:` on the array still walks every entry through five rules first, so
     * a till that queued ten thousand operations pays for validating all of them
     * and then gets a generic 422 that says "entries". `pos.sync_batch_too_large`
     * says the actual thing — send it in pieces — which is the only answer that
     * empties a queue.
     */
    protected function prepareForValidation(): void
    {
        $entries = $this->input('entries');
        $max = self::maxBatch();

        if (is_array($entries) && count($entries) > $max) {
            throw ApiException::of('pos.sync_batch_too_large', field: 'entries', meta: [
                'sent' => count($entries),
                'max_batch' => $max,
            ]);
        }
    }

    /**
     * Laravel resolves `rules()` through the container, so the ledger arrives
     * here rather than being reached for with a facade — the payment methods this
     * validator accepts are then the ones that module will actually record.
     *
     * @return array<string, mixed>
     */
    public function rules(TillLedger $till): array
    {
        return [
            'entries' => ['required', 'array', 'min:1'],

            /*
             * `distinct` is not tidiness. Two entries sharing a local id inside
             * one batch means the till lost track of its own queue, and the guard
             * would answer the second one with the first one's result — a second
             * round of drinks silently becoming a duplicate of the first. Refusing
             * the batch keeps both operations, unapplied, where somebody can look
             * at them.
             */
            'entries.*.local_id' => ['required', 'string', 'distinct', 'regex:/^[0-9a-fA-F-]{16,64}$/'],
            'entries.*.local_seq' => ['required', 'integer', 'min:0'],

            // From the dispatcher's own list, not a second copy of it: an action
            // it cannot perform must be refused here rather than three layers in.
            'entries.*.action' => ['required', 'string', Rule::in(SyncDispatcher::ACTIONS)],
            'entries.*.payload' => ['required', 'array'],

            /*
             * The payload fields worth checking on the way in.
             *
             * Not a copy of all eight form requests — the dispatcher casts what it
             * reads, so a string where an int belongs is harmless. These are the
             * ones where a bad value survives casting and lands in a row somebody
             * later has to explain: a tender method the ledger has no column for, a
             * price with a minus in front of it, a note longer than its column.
             *
             * Wildcard rules only run for keys that are actually present, so a
             * `bill.send` entry carrying nothing but a bill id passes all of them
             * without a `sometimes` on every line.
             */
            'entries.*.payload.channel' => ['string', Rule::in(OrderChannel::values())],
            'entries.*.payload.table_label' => ['nullable', 'string', 'max:32'],
            'entries.*.payload.guests' => ['integer', 'min:1', 'max:200'],
            'entries.*.payload.quantity' => ['integer', 'min:1', 'max:999'],
            'entries.*.payload.seat_no' => ['integer', 'min:1', 'max:24'],
            'entries.*.payload.bill_no' => ['integer', 'min:1', 'max:'.BillRegistry::BILLS_PER_TABLE],
            'entries.*.payload.note' => ['nullable', 'string', 'max:255'],
            'entries.*.payload.reason' => ['nullable', 'string', 'max:255'],
            'entries.*.payload.amount' => ['integer', 'min:0'],

            /*
             * A money split queued in a basement dining room.
             *
             * Bounded here as well as in `MoveBillRequest`, because a queue
             * entry never passes through that request: `sync/batch` is the other
             * door onto the same dispatcher, and a `ways` of 900 replayed the
             * next morning would mint nine hundred bills on one table before
             * anything downstream noticed.
             */
            'entries.*.payload.ways' => ['integer', 'min:'.BillSplit::WAYS_MIN, 'max:'.BillSplit::WAYS_MAX],
            'entries.*.payload.amount_tiyin' => ['integer', 'min:1'],

            /*
             * The price the guest was quoted, and the only money a client is
             * allowed to name. It is never charged — the catalogue still prices
             * the line — it exists so the server can say whether the number the
             * waiter read off the board still holds. A negative one would be a
             * conflict screen showing a guest owing less than nothing.
             */
            'entries.*.payload.unit_price' => ['integer', 'min:0'],

            'entries.*.payload.tenders' => ['array', 'min:1', 'max:6'],
            // The same list `TenderController::settle` validates against, for the
            // same reason: the ledger has one column of methods and a queued sale
            // must not be the way a fifth one appears in it.
            'entries.*.payload.tenders.*.method' => ['required', 'string', Rule::in($till->methods())],
            'entries.*.payload.tenders.*.amount' => ['required', 'integer', 'min:0'],
            'entries.*.payload.tenders.*.reference' => ['nullable', 'string', 'max:120'],
            // A negative tip is a discount wearing a tip's name, and it would skip
            // the approval ladder every real discount goes through.
            'entries.*.payload.tenders.*.tip' => ['nullable', 'integer', 'min:0'],
        ];
    }

    /**
     * The queue, with each payload whole.
     *
     * `validated()` returns the fields that have rules, and most of a payload
     * deliberately has none — the bill id, the dish, the line ids being split,
     * the local id a line points its bill at. Handing the dispatcher a payload
     * trimmed to the handful of fields this class happens to bound would drop the
     * bill out of every entry, so the payload is taken back from the input once
     * the checks above have passed.
     *
     * @return array<int, array{local_id: string, local_seq: int, action: string, payload: array<string, mixed>}>
     */
    public function entries(): array
    {
        /** @var array<int, array{local_id: string, local_seq: int, action: string, payload: array<string, mixed>}> $entries */
        $entries = array_values($this->validated()['entries']);
        /** @var array<int, array<string, mixed>> $sent */
        $sent = array_values((array) $this->input('entries', []));

        foreach (array_keys($entries) as $index) {
            /** @var array<string, mixed> $payload */
            $payload = (array) ($sent[$index]['payload'] ?? []);
            $entries[$index]['payload'] = Arr::except($payload, self::DEVICE_MAY_NOT_SET);
        }

        return $entries;
    }

    public static function maxBatch(): int
    {
        return max(1, (int) config('pos.sync.max_batch', 200));
    }
}
