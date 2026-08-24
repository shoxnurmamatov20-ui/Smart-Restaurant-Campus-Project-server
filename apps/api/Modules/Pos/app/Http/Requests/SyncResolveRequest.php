<?php

declare(strict_types=1);

namespace Modules\Pos\Http\Requests;

use App\Contracts\Finance\TillLedger;
use App\Contracts\Orders\BillRegistry;
use App\Support\Orders\OrderChannel;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Support\Arr;
use Illuminate\Validation\Rule;
use Modules\Pos\Sync\ConflictKind;
use Modules\Pos\Sync\SyncDispatcher;

/**
 * One conflicted entry, and the answer a person gave it.
 *
 * The entry comes back from the till rather than being looked up here, and that
 * is a consequence of how conflicts are recorded: `IdempotencyGuard::run()`
 * deletes its claim row when the work throws, so a conflicted write leaves no
 * trace on this side. The queue lives on the device — it is the only thing that
 * was awake for the whole outage — so the device is what still holds it.
 *
 * That is not a trust problem, because `local_id` is carried through to the same
 * idempotency guard the batch path uses. A resolve that is retried after a
 * dropped connection replays the first answer instead of applying twice, and a
 * till that "resolves" a write it already got through gets the original result
 * back rather than a second bill.
 *
 * The payload rules mirror `SyncBatchRequest` deliberately and without sharing a
 * trait. They are the same checks for the same reason — a tender method the
 * ledger has no column for, a price with a minus in front of it — and a shared
 * base class would be one more place to look when the two paths must differ,
 * which they already do at the top level.
 */
final class SyncResolveRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    /**
     * @return array<string, mixed>
     */
    public function rules(TillLedger $till): array
    {
        return [
            /* ---- which conflicted entry ---- */

            'local_id' => ['required', 'string', 'regex:/^[0-9a-fA-F-]{16,64}$/'],
            'local_seq' => ['required', 'integer', 'min:0'],
            'action' => ['required', 'string', Rule::in(SyncDispatcher::ACTIONS)],
            'payload' => ['required', 'array'],

            /* ---- and what the person decided ---- */

            /*
             * The kind travels with the answer rather than being re-derived.
             *
             * Re-running the check would be the obvious alternative and it is
             * wrong twice over: the world may have moved again between the
             * question and the answer, so a second run can raise a *different*
             * conflict — and then the option the cashier chose would be applied
             * to a question they were never asked.
             */
            'conflict_kind' => ['required', 'string', Rule::in(ConflictKind::values())],

            // Checked against the kind's own list in ConflictResolution, which is
            // where the pairing lives. A flat `in:` here would accept `reopen` for
            // a price conflict.
            'option' => ['required', 'string', 'max:32'],

            'with' => ['array'],
            'with.reason' => ['nullable', 'string', 'max:255'],
            'with.substitute_menu_item_id' => ['integer', 'min:1'],
            'with.table_id' => ['integer', 'min:1'],
            'with.table_label' => ['nullable', 'string', 'max:32'],
            'with.into_bill_id' => ['integer', 'min:1'],

            /* ---- the payload, on the same terms as a batch entry ---- */

            'payload.channel' => ['string', Rule::in(OrderChannel::values())],
            'payload.table_label' => ['nullable', 'string', 'max:32'],
            'payload.guests' => ['integer', 'min:1', 'max:200'],
            'payload.quantity' => ['integer', 'min:1', 'max:999'],
            'payload.seat_no' => ['integer', 'min:1', 'max:24'],
            'payload.bill_no' => ['integer', 'min:1', 'max:'.BillRegistry::BILLS_PER_TABLE],
            'payload.note' => ['nullable', 'string', 'max:255'],
            'payload.reason' => ['nullable', 'string', 'max:255'],
            'payload.amount' => ['integer', 'min:0'],
            'payload.unit_price' => ['nullable', 'integer', 'min:0'],
            'payload.tenders' => ['array', 'min:1', 'max:6'],
            'payload.tenders.*.method' => ['required', 'string', Rule::in($till->methods())],
            'payload.tenders.*.amount' => ['required', 'integer', 'min:0'],
            'payload.tenders.*.reference' => ['nullable', 'string', 'max:120'],
            'payload.tenders.*.tip' => ['nullable', 'integer', 'min:0'],
        ];
    }

    /** The queued write, whole — see `SyncBatchRequest::entries()` for why not `validated()`. */
    public function payload(): array
    {
        /** @var array<string, mixed> $payload */
        $payload = $this->input('payload', []);

        /*
         * The same keys a batch entry may not set, and for the same reason —
         * more so here, because this path deliberately does NOT re-run the
         * conflict check. A till that sent `served_before_stop` itself would be
         * answering a question it was never asked.
         */
        return Arr::except($payload, SyncBatchRequest::DEVICE_MAY_NOT_SET);
    }

    /** What the person supplied alongside their choice. */
    public function with(): array
    {
        /** @var array<string, mixed> $with */
        $with = $this->input('with', []);

        return $with;
    }

    public function kind(): ConflictKind
    {
        return ConflictKind::from((string) $this->input('conflict_kind'));
    }
}
