<?php

declare(strict_types=1);

namespace Modules\Staff\Http\Controllers;

use App\Contracts\Inventory\StockLedger;
use App\Contracts\Orders\BillRegistry;
use App\Contracts\Suppliers\Receiving;
use App\Contracts\Tables\FloorPlan;
use App\Http\Controllers\Controller;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Modules\Staff\Http\Requests\StoreStaffActionsRequest;
use Modules\Staff\Models\Attendance;
use Modules\Staff\Models\Shift;
use Modules\Staff\Models\StaffAction;
use Modules\Staff\Models\StaffMember;

/**
 * The staff app's queue, drained.
 *
 * A waiter's phone loses the network in a basement dining room and keeps
 * working — clocks them in, claims a table, logs a tray of spoiled salad — into
 * a local list (`apps/mobile/src/crew/queue.ts`). This is the one door that
 * list comes through, and until now there was none: `retryAll()` marked every
 * entry failed and fetched nothing.
 *
 * ---------------------------------------------------------------------------
 * Nothing is answered "fine" and then dropped
 *
 * Everything that arrives is written to `staff.actions` first, whatever else
 * happens to it. Eight of the ten kinds then go somewhere else that means
 * something: two into this module's own attendance rows, and six across four
 * contracts —
 * `StockLedger` for the shelf, `FloorPlan` for the room, `Receiving` for the
 * van at the service entrance, `BillRegistry` for the rider on the road.
 *
 * Four of them used to be journalled and nothing more, and the note here said
 * so: *"claiming a table, resolving a call, confirming a delivery and moving a
 * courier along belong to Tables, Orders and Suppliers, and Staff may not reach
 * into any of them."* That was true and the answer was a contract each, not an
 * import — the same move `waste_log` and `count_submit` already made. The
 * journal row is still written first, so the argument that produced it holds:
 * the waiter DID claim the table an hour ago, and a refusal would tell their
 * phone to drop the fact.
 *
 * The other two — a courier's cash declaration and a checklist tick — are the
 * journal and nothing else, deliberately; `StaffAction::JOURNAL_ONLY_KINDS`
 * carries the argument, and `ChecklistController` reads them back.
 *
 * A contract that cannot do the work answers `false` rather than throwing, and
 * the entry comes back `rejected` with a reason. One refused entry must never
 * strand the eleven beside it.
 *
 * ---------------------------------------------------------------------------
 * Why the permission check is here and not on the route
 *
 * The same reason `SyncController` states: a batch is one route carrying eight
 * verbs. Guarded by a single permission the route would either lock out the
 * waiter it exists for — no permission is held by every crew role — or hand a
 * storekeeper's write-off power to everybody who can sign in. So each verb is
 * checked against the map below, and an entry the caller may not perform comes
 * back `rejected` rather than failing the batch: one refused entry must not
 * strand the eleven beside it.
 *
 * Clocking yourself in carries no permission, deliberately. The roster row is
 * derived from the token — nobody can clock in as anybody else — and a
 * permission for "record that I arrived" is a permission somebody would
 * eventually be missing at six in the morning.
 */
final class StaffActionController extends Controller
{
    /**
     * What each queued verb would have needed had it been done online.
     *
     * A copy of what the owning module's routes declare, and a deliberate one:
     * there is no way to ask the router "what would this have cost". Change one
     * of those routes and change this line with it.
     *
     * @var array<string, string|null>
     */
    private const PERMISSION_FOR = [
        // About the caller and nobody else. See the class note.
        'clock_in' => null,
        'clock_out' => null,
        'table_claim' => 'tables.update',
        'call_resolve' => 'orders.update',
        'count_submit' => 'inventory.update',
        'receive_confirm' => 'suppliers.update',
        'waste_log' => 'inventory.update',
        'delivery_status' => 'orders.update',
        /*
         * Both about the caller and nobody else, so both carry none — the same
         * argument `clock_in` makes. A courier declaring what is in their own
         * pocket and a manager saying they checked the fridges are statements
         * about themselves; a permission for either is a permission somebody is
         * eventually missing at one in the morning with the notes in their hand.
         *
         * Neither grants anything. The declaration does not move money — a
         * cashier still counts it into a drawer against their own shift — and a
         * tick does not close anything.
         */
        'cash_handover' => null,
        'checklist_tick' => null,
    ];

    /**
     * Two minutes late is on time.
     *
     * The staff screen's own `LATE_GRACE_MINUTES`, kept the same number for the
     * same reason it gives: mark somebody late for being ninety seconds behind
     * and every name on the list is late, and then nobody reads it.
     */
    private const LATE_GRACE_MINUTES = 5;

    /**
     * How far before a rostered start a clock-in still belongs to that shift.
     *
     * A cook on a 08:00–20:00 rota who arrives at 05:40 for the morning prep
     * turned up for that shift. Matching only from 08:00 would call them absent
     * for a day they worked twelve hours of.
     */
    private const EARLY_WINDOW_HOURS = 3;

    public function store(
        StoreStaffActionsRequest $request,
        StockLedger $stock,
        FloorPlan $floor,
        Receiving $receiving,
        BillRegistry $bills,
    ): JsonResponse {
        /** @var User $person */
        $person = $request->user();

        $member = StaffMember::query()->where('user_id', $person->getKey())->first();

        /** @var array<int, array{local_id: string, kind: string, at: string, payload?: array<string, mixed>|null}> $entries */
        $entries = $request->validated()['entries'];

        $results = [];

        foreach ($entries as $entry) {
            $results[] = $this->apply($entry, $person, $member, $stock, $floor, $receiving, $bills);
        }

        return response()->json([
            'data' => [
                'results' => $results,
                'applied' => count(array_filter($results, static fn (array $r): bool => $r['status'] === StaffAction::APPLIED)),
                'rejected' => count(array_filter($results, static fn (array $r): bool => $r['status'] === StaffAction::REJECTED)),
            ],
        ], 201);
    }

    /**
     * One entry: journal it, and put it where it belongs if there is anywhere.
     *
     * @param  array{local_id: string, kind: string, at: string, payload?: array<string, mixed>|null}  $entry
     * @return array{local_id: string, status: string, reason?: string, applied_to?: string|null}
     */
    private function apply(
        array $entry,
        User $person,
        ?StaffMember $member,
        StockLedger $stock,
        FloorPlan $floor,
        Receiving $receiving,
        BillRegistry $bills,
    ): array {
        $localId = $entry['local_id'];
        $kind = $entry['kind'];
        $payload = $entry['payload'] ?? [];
        $happenedAt = Carbon::parse($entry['at']);

        /*
         * Seen before? Then this is a retry, and the answer is the one we gave
         * the first time.
         *
         * The header guards the request; this guards the entry, which is the
         * case a queue actually produces — twelve sent, nine written, the
         * connection dies, and the retry carries a different, overlapping
         * twelve. Answering the stored verdict rather than "duplicate" matters:
         * a phone that was told `rejected` the first time has to be told it
         * again, or it will keep the entry and ask forever.
         */
        $seen = StaffAction::query()
            ->where('user_id', $person->getKey())
            ->where('local_id', $localId)
            ->first();

        if ($seen !== null) {
            return array_filter([
                'local_id' => $localId,
                'status' => $seen->status,
                'reason' => $seen->reason,
                'applied_to' => $seen->applied_to,
                'duplicate' => true,
            ], static fn ($value): bool => $value !== null);
        }

        $needs = self::PERMISSION_FOR[$kind] ?? null;

        if ($needs !== null && ! $person->can($needs)) {
            return $this->record($entry, $person, $member, $happenedAt, StaffAction::REJECTED, 'not_permitted');
        }

        [$status, $reason, $appliedTo] = match ($kind) {
            'clock_in' => $this->clockIn($member, $happenedAt),
            'clock_out' => $this->clockOut($member, $happenedAt),
            'waste_log' => $this->writeOff($payload, $localId, $stock),
            'count_submit' => $this->countIn($payload, $localId, $stock),
            'table_claim' => $this->claimTable($payload, $person, $floor),
            'call_resolve' => $this->resolveCall($payload, $person, $floor),
            'receive_confirm' => $this->confirmDelivery($payload, $person, $receiving),
            'delivery_status' => $this->moveDelivery($payload, $happenedAt, $bills),
            'cash_handover' => $this->declareCash($payload),
            'checklist_tick' => $this->tickChecklist($payload),
            /*
             * A kind the request accepted and nothing here handles.
             *
             * Unreachable while `StaffAction::KINDS` and the match above hold
             * the same eight words — the form request validates against that
             * list — and kept as the honest answer to a ninth being added to
             * one of them and not the other: the row is written, and the phone
             * is told the truth about where it went, which is nowhere.
             */
            default => [StaffAction::APPLIED, null, null],
        };

        return $this->record($entry, $person, $member, $happenedAt, $status, $reason, $appliedTo);
    }

    /**
     * Clock in, at the moment the person actually arrived.
     *
     * `Attendance::checkIn` on the wall tablet stamps `now()`, which is right
     * there and wrong here: an entry queued at 08:03 and drained at 14:00 would
     * pay somebody from two in the afternoon.
     *
     * @return array{0: string, 1: string|null, 2: string|null}
     */
    private function clockIn(?StaffMember $member, Carbon $at): array
    {
        if ($member === null) {
            return [StaffAction::REJECTED, 'no_roster_row', null];
        }

        if ($member->status !== 'active') {
            return [StaffAction::REJECTED, 'not_active', null];
        }

        // A second open record would pay the same hours twice — the same
        // refusal AttendanceController makes at the service entrance.
        $open = Attendance::query()->open()->where('staff_member_id', $member->id)->exists();

        if ($open) {
            return [StaffAction::REJECTED, 'already_clocked_in', null];
        }

        Attendance::create([
            'branch_id' => $member->branch_id,
            'staff_member_id' => $member->id,
            'checked_in_at' => $at,
            'method' => 'pin',
            'is_late' => $this->wasLate($member, $at),
        ]);

        return [StaffAction::APPLIED, null, 'staff.attendances'];
    }

    /** @return array{0: string, 1: string|null, 2: string|null} */
    private function clockOut(?StaffMember $member, Carbon $at): array
    {
        if ($member === null) {
            return [StaffAction::REJECTED, 'no_roster_row', null];
        }

        $attendance = Attendance::query()->open()
            ->where('staff_member_id', $member->id)
            ->latest('checked_in_at')
            ->first();

        if ($attendance === null) {
            return [StaffAction::REJECTED, 'not_clocked_in', null];
        }

        // A phone whose clock is behind ours would otherwise close a record
        // before it opened and store a negative shift as an unsigned integer.
        if ($at->lessThan($attendance->checked_in_at)) {
            return [StaffAction::REJECTED, 'ends_before_it_starts', null];
        }

        $attendance->closeAt($at);

        return [StaffAction::APPLIED, null, 'staff.attendances'];
    }

    /**
     * A tray of spoiled salad, off the shelf.
     *
     * @param  array<string, mixed>  $payload
     * @return array{0: string, 1: string|null, 2: string|null}
     */
    private function writeOff(array $payload, string $localId, StockLedger $stock): array
    {
        $ingredientId = $this->intFrom($payload, 'ingredient_id');
        $quantity = $this->intFrom($payload, 'quantity');
        $reason = $this->stringFrom($payload, 'reason');

        if ($ingredientId === null || $quantity === null || $quantity <= 0) {
            return [StaffAction::REJECTED, 'payload_incomplete', null];
        }

        // Unexplained shrinkage is what the stock module exists to surface, so
        // a write-off with no reason is refused here as it is on the direct
        // route — the phone asks for one before it queues the entry.
        if ($reason === null) {
            return [StaffAction::REJECTED, 'reason_required', null];
        }

        $change = $stock->writeOff($ingredientId, $quantity, $reason, 'CREW-'.$localId);

        return $change === null
            ? [StaffAction::REJECTED, 'unknown_ingredient', null]
            : [StaffAction::APPLIED, null, 'inventory.stock_movements'];
    }

    /**
     * A shelf counted on a phone.
     *
     * One line per entry, because that is what the queue holds: the app's count
     * panel enqueues each row as the storekeeper types it, so a phone that dies
     * halfway through has still recorded the half that was counted.
     *
     * @param  array<string, mixed>  $payload
     * @return array{0: string, 1: string|null, 2: string|null}
     */
    private function countIn(array $payload, string $localId, StockLedger $stock): array
    {
        $ingredientId = $this->intFrom($payload, 'ingredient_id');
        $counted = $this->intFrom($payload, 'counted');

        if ($ingredientId === null || $counted === null || $counted < 0) {
            return [StaffAction::REJECTED, 'payload_incomplete', null];
        }

        $change = $stock->recordCount($ingredientId, $counted, 'CREW-'.$localId);

        return $change === null
            ? [StaffAction::REJECTED, 'unknown_ingredient', null]
            : [StaffAction::APPLIED, null, 'inventory.stock_movements'];
    }

    /**
     * "Bu stol meniki."
     *
     * The table id comes off the phone, which read it from the floor map it
     * cached before the signal went. A stale map is why this can refuse: the
     * table may have been taken out of service, or another waiter may have
     * claimed it in the ninety minutes since — and `already_claimed` is the
     * answer that tells the person which of their tables is not theirs.
     *
     * @param  array<string, mixed>  $payload
     * @return array{0: string, 1: string|null, 2: string|null}
     */
    private function claimTable(array $payload, User $person, FloorPlan $floor): array
    {
        $tableId = $this->intFrom($payload, 'table_id');

        if ($tableId === null || $tableId < 1) {
            return [StaffAction::REJECTED, 'payload_incomplete', null];
        }

        return $floor->claim($tableId, (int) $person->getKey())
            ? [StaffAction::APPLIED, null, 'tables.restaurant_tables']
            : [StaffAction::REJECTED, 'already_claimed', null];
    }

    /**
     * Somebody answered a raised hand.
     *
     * A call that was already closed comes back `already_closed` rather than
     * being retried forever: the guest was served, by whoever got there first,
     * and two waiters walking to one table is exactly what the call board is
     * meant to prevent.
     *
     * @param  array<string, mixed>  $payload
     * @return array{0: string, 1: string|null, 2: string|null}
     */
    private function resolveCall(array $payload, User $person, FloorPlan $floor): array
    {
        $callId = $this->intFrom($payload, 'call_id');

        if ($callId === null || $callId < 1) {
            return [StaffAction::REJECTED, 'payload_incomplete', null];
        }

        return $floor->resolveCall($callId, (int) $person->getKey())
            ? [StaffAction::APPLIED, null, 'tables.waiter_calls']
            : [StaffAction::REJECTED, 'already_closed', null];
    }

    /**
     * The van came and the boxes were counted.
     *
     * The heaviest entry in the queue: it raises stock on every line and grows
     * the supplier's debt. `already_received` rather than a retry is what stops
     * a queue that drains twice from doubling a delivery on the shelf — see
     * `App\Contracts\Suppliers\Receiving`.
     *
     * @param  array<string, mixed>  $payload
     * @return array{0: string, 1: string|null, 2: string|null}
     */
    private function confirmDelivery(array $payload, User $person, Receiving $receiving): array
    {
        $purchaseOrderId = $this->intFrom($payload, 'purchase_order_id');

        if ($purchaseOrderId === null || $purchaseOrderId < 1) {
            return [StaffAction::REJECTED, 'payload_incomplete', null];
        }

        return $receiving->confirm($purchaseOrderId, (int) $person->getKey())
            ? [StaffAction::APPLIED, null, 'suppliers.purchase_orders']
            : [StaffAction::REJECTED, 'already_received', null];
    }

    /**
     * The rider picked it up, left, or handed it over.
     *
     * `$happenedAt` and not `now()`, for the reason `clockIn()` gives about
     * attendance: an entry queued in a stairwell at 19:12 and drained at 21:00
     * is a delivery that left at 19:12, and stamping it with the drain time
     * would report every courier as instant and every kitchen as late.
     *
     * @param  array<string, mixed>  $payload
     * @return array{0: string, 1: string|null, 2: string|null}
     */
    private function moveDelivery(array $payload, Carbon $happenedAt, BillRegistry $bills): array
    {
        $orderId = $this->intFrom($payload, 'order_id');
        $status = $this->stringFrom($payload, 'status');

        if ($orderId === null || $orderId < 1 || $status === null) {
            return [StaffAction::REJECTED, 'payload_incomplete', null];
        }

        // The four words the rider's app can send. Validated here rather than
        // in the form request because the request validates one shape for eight
        // verbs, and a `status` field means something different to each.
        if (! in_array($status, ['picked', 'enroute', 'delivered', 'failed'], true)) {
            return [StaffAction::REJECTED, 'unknown_status', null];
        }

        return $bills->markDelivery($orderId, $status, $happenedAt)
            ? [StaffAction::APPLIED, null, 'orders.deliveries']
            : [StaffAction::REJECTED, 'no_live_delivery', null];
    }

    /**
     * "I am carrying this much."
     *
     * A courier's declaration at the end of a round, and the only figure the
     * cashier has to reconcile against before the notes are counted. It lands
     * in the journal and nowhere else — see `StaffAction::JOURNAL_ONLY_KINDS`
     * for why moving the money from here would be the wrong shape.
     *
     * Tiyin, whole and positive, like every other amount on this platform. Zero
     * is refused rather than stored: a rider who collected nothing has nothing
     * to declare, and a row saying "0" would read as a hand-over that happened
     * when none did — which is precisely the gap the cashier is looking for.
     *
     * @param  array<string, mixed>  $payload
     * @return array{0: string, 1: string|null, 2: string|null}
     */
    private function declareCash(array $payload): array
    {
        $amount = $this->intFrom($payload, 'amount_tiyin');

        if ($amount === null || $amount <= 0) {
            return [StaffAction::REJECTED, 'payload_incomplete', null];
        }

        /*
         * A ceiling, and it is a typo guard rather than a policy.
         *
         * The steppers on this app cannot produce it; a keyboard can, and a
         * rider who adds two zeroes to a nine-hundred-thousand-so'm round
         * declares nine hundred million and the cashier spends the evening
         * looking for it. Ten million so'm is far above any single round and
         * far below a fat-fingered one.
         */
        if ($amount > 1_000_000_000) {
            return [StaffAction::REJECTED, 'amount_implausible', null];
        }

        return [StaffAction::APPLIED, null, 'staff.actions'];
    }

    /**
     * One step of a run-through, ticked.
     *
     * The list and the step are stored as they arrive because the steps belong
     * to the screen that draws them: the closing list is five lines in a design
     * file, and a server-side enum of them would have to be redeployed to add a
     * sixth. What the server owns is *which run-through* — `CHECKLISTS` — so a
     * month of ticks cannot end up split between `closing` and `close`.
     *
     * Re-ticking is not an error and does not need to be guarded here: the
     * entry-level `local_id` check above already answers a resend with the
     * stored verdict, and two genuine ticks of the same step by two people on
     * one phone are two facts worth keeping.
     *
     * @param  array<string, mixed>  $payload
     * @return array{0: string, 1: string|null, 2: string|null}
     */
    private function tickChecklist(array $payload): array
    {
        $list = $this->stringFrom($payload, 'list');
        $step = $this->stringFrom($payload, 'step');

        if ($list === null || $step === null || mb_strlen($step) > 64) {
            return [StaffAction::REJECTED, 'payload_incomplete', null];
        }

        if (! in_array($list, StaffAction::CHECKLISTS, true)) {
            return [StaffAction::REJECTED, 'unknown_checklist', null];
        }

        return [StaffAction::APPLIED, null, 'staff.actions'];
    }

    /**
     * Late against the rota, not against the clock.
     *
     * Somebody with no shift rostered cannot be late for it — a cook called in
     * on their day off is doing the restaurant a favour, and marking them late
     * for arriving at eleven is how an attendance screen loses its readers.
     */
    private function wasLate(StaffMember $member, Carbon $at): bool
    {
        $shift = Shift::query()
            ->where('staff_member_id', $member->id)
            ->where('status', '!=', 'cancelled')
            ->where('starts_at', '<=', $at->copy()->addHours(self::EARLY_WINDOW_HOURS))
            ->where('ends_at', '>=', $at)
            ->orderBy('starts_at')
            ->first();

        if ($shift?->starts_at === null) {
            return false;
        }

        return $at->greaterThan($shift->starts_at->copy()->addMinutes(self::LATE_GRACE_MINUTES));
    }

    /**
     * Write the journal row. This is the part that never fails to happen.
     *
     * @param  array{local_id: string, kind: string, at: string, payload?: array<string, mixed>|null}  $entry
     * @return array{local_id: string, status: string, reason?: string, applied_to?: string|null}
     */
    private function record(
        array $entry,
        User $person,
        ?StaffMember $member,
        Carbon $happenedAt,
        string $status,
        ?string $reason = null,
        ?string $appliedTo = null,
    ): array {
        DB::transaction(function () use ($entry, $person, $member, $happenedAt, $status, $reason, $appliedTo): void {
            StaffAction::create([
                'branch_id' => $member?->branch_id,
                'user_id' => $person->getKey(),
                'staff_member_id' => $member?->id,
                'local_id' => $entry['local_id'],
                'kind' => $entry['kind'],
                'payload' => $entry['payload'] ?? [],
                'status' => $status,
                'reason' => $reason,
                'applied_to' => $appliedTo,
                'happened_at' => $happenedAt,
            ]);
        });

        $answer = ['local_id' => $entry['local_id'], 'status' => $status];

        if ($reason !== null) {
            $answer['reason'] = $reason;
        }

        if ($appliedTo !== null) {
            $answer['applied_to'] = $appliedTo;
        }

        return $answer;
    }

    /** @param array<string, mixed> $payload */
    private function intFrom(array $payload, string $key): ?int
    {
        $value = $payload[$key] ?? null;

        return is_numeric($value) ? (int) $value : null;
    }

    /** @param array<string, mixed> $payload */
    private function stringFrom(array $payload, string $key): ?string
    {
        $value = $payload[$key] ?? null;

        if (! is_string($value)) {
            return null;
        }

        $trimmed = trim($value);

        return $trimmed === '' ? null : $trimmed;
    }
}
