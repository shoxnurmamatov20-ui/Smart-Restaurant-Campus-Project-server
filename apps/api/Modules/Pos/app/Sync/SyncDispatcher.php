<?php

declare(strict_types=1);

namespace Modules\Pos\Sync;

use App\Contracts\Finance\TillLedger;
use App\Contracts\Menu\MenuCatalog;
use App\Contracts\Menu\StopList;
use App\Contracts\Orders\Bill;
use App\Contracts\Orders\BillRegistry;
use App\Support\Events\EventBus;
use Modules\Pos\Events\BillComped;
use Modules\Pos\Events\BillVoided;
use Modules\Pos\Models\PosApproval;
use Modules\Pos\Models\Terminal;
use Modules\Pos\Models\TerminalSession;
use Modules\Pos\Services\TenderService;
use RuntimeException;

/**
 * What each thing a till can do actually does — in one place, for both paths.
 *
 * There are two ways a sale reaches this server: over HTTP as it happens, and
 * out of a device's queue hours later when the router comes back. They must
 * produce the same rows, the same events and the same refusals, and the only way
 * to be sure of that is for the work to exist once. Written twice, the two
 * copies drift the first time anything is added — a void that announces itself
 * online and silently does not when replayed, and a loss-prevention screen that
 * misses exactly the shifts worth looking at.
 *
 * So the controllers keep what is genuinely HTTP — validating a request, running
 * the approval gate, shaping a response — and hand the verb here. The batch
 * replay hands the same verbs here with no controller involved.
 *
 * ---------------------------------------------------------------------------
 * Conflicts
 *
 * Checked BEFORE the work, and thrown rather than returned. A queued write was
 * valid when the cashier made it; what changed is the world. That is a different
 * thing from a malformed request and it needs a different answer — one a person
 * chooses from. {@see ConflictKind} for the six and why they are six.
 *
 * The checks are here rather than inside Orders or Finance on purpose. Those
 * modules refuse the same conditions with a sentence — "this bill is closed" —
 * which is right for them and useless to a screen that has to offer three
 * buttons. This layer knows it is draining a queue, so it can ask the question
 * the sentence cannot.
 */
final class SyncDispatcher
{
    /**
     * Everything a till may queue, and the only strings this class answers to.
     *
     * The same names `IdempotencyGuard` records in `pos.sync_entries.action`, so
     * a stalled queue can be read straight out of the table without a decoder.
     *
     * @var list<string>
     */
    public const ACTIONS = [
        'bill.open', 'bill.line.add', 'bill.line.void', 'bill.discount',
        'bill.send', 'bill.split', 'bill.merge', 'bill.transfer',
        'bill.cancel', 'bill.comp', 'bill.tender',
    ];

    public function __construct(
        private readonly BillRegistry $bills,
        private readonly TenderService $tenders,
        private readonly TillLedger $till,
        private readonly MenuCatalog $menu,
        private readonly StopList $stops,
        private readonly EventBus $events,
    ) {}

    /**
     * Do one queued thing.
     *
     * @param array<string, mixed> $payload
     *
     * @return array<string, mixed>
     *
     * Conflict checks are NOT here — see {@see self::conflictsFor()}. Online,
     * the modules' own refusals are the right answer: the cashier is looking at
     * the bill and can see it closed. A queue draining hours later is the case
     * that needs a question instead, and only that path asks it.
     *
     * @throws RuntimeException for everything a module refuses on its own terms
     */
    public function apply(
        string $action,
        array $payload,
        TerminalSession $session,
        Terminal $terminal,
        ?PosApproval $approval = null,
        ?ShiftChoice $shift = null,
    ): array {
        if (! in_array($action, self::ACTIONS, true)) {
            throw new RuntimeException("Noma'lum amal: {$action}");
        }

        return match ($action) {
            'bill.open' => $this->openBill($payload, $session),
            'bill.line.add' => $this->addLine($payload),
            'bill.line.void' => $this->voidLine($payload),
            'bill.discount' => $this->discount($payload),
            'bill.send' => $this->send($payload),
            'bill.split' => $this->split($payload),
            'bill.merge' => $this->merge($payload),
            'bill.transfer' => $this->transfer($payload),
            'bill.cancel' => $this->endBill($payload, $session, $terminal, $approval, comp: false),
            'bill.comp' => $this->endBill($payload, $session, $terminal, $approval, comp: true),
            'bill.tender' => $this->tender($payload, $session, $terminal, $shift),
        };
    }

    // ============ Bills ============

    /**
     * @param array<string, mixed> $payload
     *
     * @return array<string, mixed>
     */
    private function openBill(array $payload, TerminalSession $session): array
    {
        return $this->bills->open(
            channel: (string) $payload['channel'],
            tableId: isset($payload['table_id']) ? (int) $payload['table_id'] : null,
            tableLabel: isset($payload['table_label']) ? (string) $payload['table_label'] : null,
            // From the session. Always — a client that could name the waiter
            // could attribute its sales to somebody else.
            waiterUserId: (int) $session->user_id,
            customerId: isset($payload['customer_id']) ? (int) $payload['customer_id'] : null,
            guests: (int) ($payload['guests'] ?? 1),
        )->toArray();
    }

    /**
     * @param array<string, mixed> $payload
     *
     * @return array<string, mixed>
     */
    private function addLine(array $payload): array
    {
        return $this->bills->addLine(
            billId: (int) $payload['bill_id'],
            menuItemId: (int) $payload['menu_item_id'],
            quantity: (int) ($payload['quantity'] ?? 1),
            /*
             * The price the guest was quoted, honoured when it is still standing.
             *
             * This was dropped on the floor: the payload carried `unit_price`,
             * `refuseIfPriceMoved()` read it to decide whether to ask a question,
             * and the write then priced the line from the catalogue regardless.
             * Harmless while the two agreed, and the whole point of the question
             * when they did not — a cashier answering `honour_quoted` got the
             * current price anyway, which is the answer they had just declined.
             *
             * `isset()` rather than `??`, deliberately: a resolution that chose
             * `reprice` writes the key back as null, and `(int) null` is a line
             * priced at zero.
             */
            unitPriceOverride: isset($payload['unit_price']) ? (int) $payload['unit_price'] : null,
            note: isset($payload['note']) ? (string) $payload['note'] : null,
            seatNo: (int) ($payload['seat_no'] ?? 1),
            billNo: (int) ($payload['bill_no'] ?? 1),
            modifierChoiceIds: array_map('intval', (array) ($payload['modifiers'] ?? [])),
            /*
             * Only ever set by `ConflictResolution` answering `keep`.
             *
             * A queued entry cannot carry this: a till that could put the key in
             * its own JSON could sell a stopped dish all evening by claiming each
             * plate was cooked before the stop. The key exists in the payload
             * only because a person has just been shown the question and chosen
             * this answer, and their reason is what it holds.
             */
            servedBeforeStop: isset($payload['served_before_stop'])
                ? (string) $payload['served_before_stop']
                : null,
        )->toArray();
    }

    /**
     * @param array<string, mixed> $payload
     *
     * @return array<string, mixed>
     */
    private function voidLine(array $payload): array
    {
        $billId = (int) $payload['bill_id'];

        return $this->bills->voidLine($billId, (int) $payload['line_id'], (string) $payload['reason'])->toArray();
    }

    /**
     * @param array<string, mixed> $payload
     *
     * @return array<string, mixed>
     */
    private function discount(array $payload): array
    {
        $billId = (int) $payload['bill_id'];

        return $this->bills->applyDiscount($billId, (int) $payload['amount'], (string) $payload['reason'])->toArray();
    }

    /**
     * @param array<string, mixed> $payload
     *
     * @return array<string, mixed>
     */
    private function send(array $payload): array
    {
        $billId = (int) $payload['bill_id'];

        return $this->bills->send($billId)->toArray();
    }

    /**
     * @param array<string, mixed> $payload
     *
     * @return array<string, mixed>
     */
    private function split(array $payload): array
    {
        $billId = (int) $payload['bill_id'];

        /*
         * Three splits, one verb, and the payload says which.
         *
         * They queue and replay identically — the same bill, the same person,
         * the same moment — and the till has always sent one action name. What
         * differs is what is being divided: `line_ids` hands dishes over,
         * `ways` divides the money equally, `amount_tiyin` takes a named figure
         * off. Naming them `bill.split.evenly` and friends would have been three
         * new entries in `ACTIONS`, three new branches in every queue reader,
         * and a device on an older bundle sending a verb this server has never
         * heard of.
         */
        if (isset($payload['ways'])) {
            return self::family($this->bills->splitEvenly($billId, (int) $payload['ways']));
        }

        if (isset($payload['amount_tiyin'])) {
            return self::family($this->bills->splitAmount($billId, (int) $payload['amount_tiyin']));
        }

        return $this->bills->split($billId, array_map('intval', (array) $payload['line_ids']))->toArray();
    }

    /**
     * A money split's answer: the parent, with the whole family beside it.
     *
     * The parent at the top level rather than a bare list, because every caller
     * of this dispatcher — the controller's `payable`, the offline queue's
     * replay comparison — reads `total` off the result and would find none on an
     * array of bills. `split` carries all of them in payment order, which is
     * what the till prints and what the cashier reads out.
     *
     * @param array<int, Bill> $family
     *
     * @return array<string, mixed>
     */
    private static function family(array $family): array
    {
        return $family[0]->toArray() + [
            'split' => array_map(static fn (Bill $bill): array => $bill->toArray(), $family),
        ];
    }

    /**
     * @param array<string, mixed> $payload
     *
     * @return array<string, mixed>
     */
    private function merge(array $payload): array
    {
        $sourceId = (int) $payload['bill_id'];

        return $this->bills->merge($sourceId, (int) $payload['target_bill_id'])->toArray();
    }

    /**
     * @param array<string, mixed> $payload
     *
     * @return array<string, mixed>
     */
    private function transfer(array $payload): array
    {
        $billId = (int) $payload['bill_id'];

        return $this->bills->transfer(
            billId: $billId,
            tableId: isset($payload['table_id']) ? (int) $payload['table_id'] : null,
            tableLabel: isset($payload['table_label']) ? (string) $payload['table_label'] : null,
            waiterUserId: isset($payload['waiter_user_id']) ? (int) $payload['waiter_user_id'] : null,
        )->toArray();
    }

    /**
     * Void or comp — the same shape, two events, and never one with a flag.
     *
     * @param array<string, mixed> $payload
     *
     * @return array<string, mixed>
     */
    private function endBill(
        array $payload,
        TerminalSession $session,
        Terminal $terminal,
        ?PosApproval $approval,
        bool $comp,
    ): array {
        $billId = (int) $payload['bill_id'];
        $reason = (string) $payload['reason'];
        $found = $this->billOrFail($billId);

        $closed = $comp
            ? $this->bills->comp($billId, $reason)
            : $this->bills->cancel($billId, $reason);

        // `$found->total` and not `$closed->total`: what the guest would have
        // paid, read before the bill was ended.
        $this->events->publish($comp
            ? new BillComped($closed->id, $closed->number, $found->total, $reason,
                (int) $terminal->getKey(), (int) $session->user_id, $approval)
            : new BillVoided($closed->id, $closed->number, $found->total, $reason,
                (int) $terminal->getKey(), (int) $session->user_id, $approval));

        return $closed->toArray();
    }

    // ============ Money ============

    /**
     * @param array<string, mixed> $payload
     *
     * @return array<string, mixed>
     */
    private function tender(
        array $payload,
        TerminalSession $session,
        Terminal $terminal,
        ?ShiftChoice $shift,
    ): array {
        /*
         * Which drawer this money lands in, and why a caller may override it.
         *
         * The session's own shift is right for every ordinary sale and for every
         * entry a queue drains normally. It is wrong for exactly one case:
         * `ConflictKind::ShiftClosed`, where the notes are already sitting in a
         * drawer that has been counted and sealed, and a person has decided which
         * shift should carry them.
         *
         * The override is a parameter and never a payload key. A till that could
         * name its own shift in the JSON it queues could post a night's takings
         * into any drawer it liked, including one it never opened — and the whole
         * point of raising that conflict was that the decision belongs to a human
         * with the till in front of them.
         */
        $shiftId = $shift !== null
            ? $shift->shiftId
            : $session->cash_shift_id ?? $this->till->openShiftFor((int) $session->user_id);

        if ($shiftId === null) {
            throw new RuntimeException('Ochiq smena yo\'q.');
        }

        return $this->tenders->settle(
            terminal: $terminal,
            billId: (int) $payload['bill_id'],
            shiftId: (int) $shiftId,
            tenders: (array) $payload['tenders'],
            into: $shift,
        );
    }

    // ============ Conflict checks ============

    /**
     * "Does this queued write still make sense?"
     *
     * Called before {@see self::apply()} and only by the replay path. Every
     * check here answers a question the live path does not have to ask: the
     * cashier standing at the till can SEE that the bill closed, and telling
     * them so in a sentence is the right answer. A queue draining at seven the
     * next morning has nobody looking at it, and the same sentence there is a
     * row nobody can act on.
     *
     * Ordered cheapest first — a stop-list read and a price lookup before the
     * bill, because an entry that fails on the dish never needs the bill.
     *
     * @param array<string, mixed> $payload
     *
     * @throws ConflictException
     */
    public function conflictsFor(string $action, array $payload, TerminalSession $session): void
    {
        match ($action) {
            'bill.open' => $this->refuseIfTableTaken($payload),
            'bill.line.add' => $this->checkLine($payload),
            'bill.tender' => $this->checkTender($payload, $session),
            'bill.line.void', 'bill.discount', 'bill.send', 'bill.split',
            'bill.merge', 'bill.transfer', 'bill.cancel', 'bill.comp' => $this->refuseIfSettled($payload),
            default => null,
        };
    }

    /**
     * @param array<string, mixed> $payload
     */
    private function checkLine(array $payload): void
    {
        $dishId = (int) $payload['menu_item_id'];

        $this->refuseIfStopped($dishId);
        $this->refuseIfPriceMoved($dishId, $payload);
        $this->refuseIfSettled($payload);
    }

    /**
     * @param array<string, mixed> $payload
     */
    private function checkTender(array $payload, TerminalSession $session): void
    {
        $found = $this->bills->find((int) $payload['bill_id']);

        /*
         * Already paid is a conflict and not a refusal.
         *
         * `TenderService` refuses it — "this bill is already closed" — and that
         * sentence is right for a cashier who tapped Pay twice. In a draining
         * queue it means another till took the same table's money, which is two
         * people both having done their job, and only a person can say whether
         * the guest paid once or twice. Getting it wrong costs a double charge
         * in one direction and a meal in the other.
         */
        if ($found !== null && ! $found->isOpen()) {
            throw ConflictException::of(
                ConflictKind::PaymentDuplicate,
                "#{$found->number} hisobi allaqachon to'langan.",
                ['bill_id' => $found->id, 'number' => $found->number, 'status' => $found->status,
                    'total' => $found->total],
            );
        }

        $taken = isset($payload['shift_id']) ? (int) $payload['shift_id'] : null;

        if ($taken === null) {
            return;
        }

        $current = $session->cash_shift_id ?? $this->till->openShiftFor((int) $session->user_id);

        if ($taken === (int) $current) {
            return;
        }

        /*
         * The notes are in a drawer somebody has already counted.
         *
         * Booking this into the shift that is open NOW is the reflex, and it
         * counts the same money twice: the cash went into last night's till, last
         * night's Z counted it as an unexplained overage, and recording it again
         * today makes it revenue a second time. Which shift carries it is a
         * decision with money on both sides of it, so it goes back as a question.
         */
        throw ConflictException::of(
            ConflictKind::ShiftClosed,
            'Bu pul boshqa smenada olingan.',
            ['taken_in_shift_id' => $taken, 'open_shift_id' => $current === null ? null : (int) $current],
        );
    }

    /**
     * Somebody settled the bill while this till was away.
     *
     * One check for every write onto an existing bill, so the question is asked
     * once rather than in nine places that would each have to remember.
     *
     * @param array<string, mixed> $payload
     */
    private function refuseIfSettled(array $payload): void
    {
        $billId = (int) ($payload['bill_id'] ?? 0);
        $found = $billId > 0 ? $this->bills->find($billId) : null;

        // A bill that is not there at all is not a conflict — nobody can choose
        // their way out of it. `apply()` will refuse it by name.
        if ($found === null || $found->isOpen()) {
            return;
        }

        throw ConflictException::of(
            ConflictKind::BillSettled,
            "#{$found->number} hisobi yopilgan.",
            ['bill_id' => $found->id, 'number' => $found->number, 'status' => $found->status,
                'table_id' => $found->tableId, 'table_label' => $found->tableLabel],
        );
    }

    private function refuseIfStopped(int $dishId): void
    {
        if (! in_array($dishId, $this->stops->stoppedItemIds(), true)) {
            return;
        }

        /*
         * Orders refuses this too, and its refusal is right for a live till: a
         * waiter must not promise a guest something the kitchen has run out of.
         * A queue is the other case — the food was cooked and carried out before
         * the stop — and there the refusal loses a sale whose stock has already
         * left the building, which is the version an inventory count cannot
         * explain.
         */
        $dish = $this->menu->find($dishId);

        /*
         * Named if the catalogue still knows it, numbered if it does not.
         *
         * A dish can be gone by the time an offline queue drains — deleted, or
         * belonging to a restaurant this terminal no longer serves. The waiter
         * still needs to be told which line is the problem, and `#41` is a worse
         * sentence than "Manti" but a far better one than an empty space.
         */
        $title = $dish === null ? "#{$dishId}" : $dish->title;

        throw ConflictException::of(
            ConflictKind::ItemUnavailable,
            $title.' hozir stop-listda.',
            ['menu_item_id' => $dishId, 'title' => $dish?->title],
        );
    }

    /**
     * @param array<string, mixed> $payload
     */
    private function refuseIfPriceMoved(int $dishId, array $payload): void
    {
        // Only asked when the till says what it charged. An entry with no quoted
        // price is a till that trusted the catalogue, and there is nothing for
        // the catalogue to disagree with.
        if (! isset($payload['unit_price'])) {
            return;
        }

        $quoted = (int) $payload['unit_price'];
        $dish = $this->menu->find($dishId);

        if ($dish === null || (int) $dish->price === $quoted) {
            return;
        }

        throw ConflictException::of(
            ConflictKind::PriceMoved,
            "{$dish->title}: mehmonga aytilgan narx hozirgisidan farq qiladi.",
            ['menu_item_id' => $dishId, 'title' => $dish->title,
                'quoted_price' => $quoted, 'current_price' => (int) $dish->price],
        );
    }

    /**
     * Somebody else seated this table while the till was away.
     *
     * Not a refusal: a table legitimately carries up to four bills, and two
     * waiters covering one room during an outage is ordinary rather than wrong.
     * It is a question because the answer — fold them together, keep them apart,
     * move one — is a judgement about what the guests actually did.
     *
     * @param array<string, mixed> $payload
     */
    private function refuseIfTableTaken(array $payload): void
    {
        $tableId = isset($payload['table_id']) ? (int) $payload['table_id'] : null;

        if ($tableId === null) {
            return;
        }

        $live = $this->bills->openBillsOn($tableId);

        if ($live === []) {
            return;
        }

        throw ConflictException::of(
            ConflictKind::TableTaken,
            'Bu stolda boshqa ochiq hisob bor.',
            [
                'table_id' => $tableId,
                'open_bills' => array_map(static fn (Bill $bill): array => [
                    'id' => $bill->id,
                    'number' => $bill->number,
                    'waiter_user_id' => $bill->waiterUserId,
                    'total' => $bill->total,
                ], $live),
                'bills_per_table' => BillRegistry::BILLS_PER_TABLE,
            ],
        );
    }

    private function billOrFail(int $billId): Bill
    {
        $found = $this->bills->find($billId);

        if ($found === null) {
            throw new RuntimeException("#{$billId} hisobi topilmadi.");
        }

        return $found;
    }
}
