<?php

declare(strict_types=1);

namespace Modules\Orders\Services;

use App\Contracts\Kitchen\TicketWriter;
use App\Contracts\Menu\MenuCatalog;
use App\Contracts\Menu\ModifierChoice;
use App\Contracts\Menu\StopList;
use App\Contracts\Orders\Bill;
use App\Contracts\Orders\BillLine;
use App\Contracts\Orders\BillRegistry;
use App\Contracts\Orders\LineModifier;
use App\Contracts\Tables\FloorPlan;
use App\Support\Orders\BillSplit;
use App\Support\Orders\OrderState;
use App\Support\Settings\Policies;
use App\Support\Tenancy\BranchContext;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use InvalidArgumentException;
use Modules\Orders\Models\Delivery;
use Modules\Orders\Models\Order;
use Modules\Orders\Models\OrderItem;
use Modules\Orders\Models\OrderItemModifier;
use RuntimeException;

/**
 * Orders answering the platform's write contract for bills.
 *
 * This is how the POS opens a table, splits it four ways and settles it without
 * importing a single Orders class. Everything here is deliberately boring: the
 * interesting decisions were already made in the Order model (snapshot lines,
 * server-derived totals, closed bills immutable) and this class's job is to
 * expose them, not to reinvent them.
 *
 * Two rules run through every method. Money is recomputed from the lines rather
 * than trusted from a caller, and anything that touches more than one row runs
 * inside a transaction — a split that half-happened would leave a guest holding
 * a bill for food that is also on somebody else's.
 */
final class EloquentBillRegistry implements BillRegistry
{
    public function __construct(
        private readonly MenuCatalog $menu,
        private readonly TicketWriter $tickets,
        private readonly StopList $stops,
        /*
         * The house rules, and the floor they sometimes touch.
         *
         * Both are core contracts rather than modules: `Policies` reads the
         * restaurant's own settings document, and `FloorPlan` is how a settled
         * bill clears its table without Orders importing anything from Tables —
         * `ModuleBoundaryTest` records no such edge and this does not add one.
         */
        private readonly Policies $policies,
        private readonly FloorPlan $floor,
    ) {}

    public function open(
        string $channel,
        ?int $tableId = null,
        ?string $tableLabel = null,
        ?int $waiterUserId = null,
        ?int $customerId = null,
        int $guests = 1,
    ): Bill {
        if (! in_array($channel, Order::CHANNELS, true)) {
            throw new RuntimeException("Noma'lum sotuv kanali: {$channel}");
        }

        $this->waiterHasRoomOrFail($waiterUserId);

        $order = Order::create([
            'number' => Order::nextNumber(),
            'channel' => $channel,
            'status' => 'draft',
            'restaurant_table_id' => $tableId,
            'table_label' => $tableLabel,
            'waiter_user_id' => $waiterUserId,
            'customer_id' => $customerId,
            'guests_count' => max(1, $guests),
            'subtotal' => 0,
            'discount_total' => 0,
            'service_charge' => 0,
            'total' => 0,
        ]);

        return $this->toBill($order);
    }

    public function servedBy(array $billIds): array
    {
        if ($billIds === []) {
            return [];
        }

        // The user row is joined rather than eager-loaded: this answers a
        // name and a count, and hydrating three hundred orders with their
        // relations to read two columns is work nobody sees.
        return Order::query()
            ->whereIn('orders.id', $billIds)
            ->leftJoin('public.users as w', 'w.id', '=', 'orders.waiter_user_id')
            ->get(['orders.id', 'orders.waiter_user_id', 'orders.guests_count', 'w.name as waiter_name'])
            ->mapWithKeys(static fn (Order $order): array => [
                (int) $order->id => [
                    'waiter_user_id' => $order->waiter_user_id === null ? null : (int) $order->waiter_user_id,
                    'waiter_name' => $order->getAttribute('waiter_name'),
                    'guests' => (int) $order->guests_count,
                ],
            ])
            ->all();
    }

    public function find(int $billId): ?Bill
    {
        $order = Order::query()->with('items')->find($billId);

        return $order === null ? null : $this->toBill($order);
    }

    /**
     * @param  array<int, int>  $modifierChoiceIds
     */
    public function addLine(
        int $billId,
        int $menuItemId,
        int $quantity = 1,
        ?int $unitPriceOverride = null,
        ?string $note = null,
        int $seatNo = 1,
        int $billNo = 1,
        array $modifierChoiceIds = [],
        ?string $servedBeforeStop = null,
    ): Bill {
        if ($quantity < 1) {
            throw new RuntimeException('Miqdor kamida 1 bo\'lishi kerak.');
        }

        if ($seatNo < 1) {
            throw new RuntimeException('O\'rindiq raqami kamida 1 bo\'lishi kerak.');
        }

        if ($billNo < 1 || $billNo > BillRegistry::BILLS_PER_TABLE) {
            throw new RuntimeException(sprintf(
                'Bitta stolda %d tagacha hisob bo\'lishi mumkin.',
                BillRegistry::BILLS_PER_TABLE,
            ));
        }

        return DB::transaction(function () use (
            $billId, $menuItemId, $quantity, $unitPriceOverride, $note, $seatNo, $billNo,
            $modifierChoiceIds, $servedBeforeStop
        ): Bill {
            $order = $this->openOrderOrFail($billId);

            /*
             * A bill whose money has been carved up takes no more food.
             *
             * After a money split this bill is worth its share and nothing else
             * — the arithmetic no longer derives from the lines — so a line
             * added here would be cooked, carried and never charged for.
             * Ordering another coffee once the table has divided the bill means
             * undoing the split or opening a new one, and both leave a row.
             */
            if ($order->split_share_total !== null) {
                throw new RuntimeException(
                    "#{$order->number} hisobi bo'lingan — unga yangi qator qo'shib bo'lmaydi.",
                );
            }

            $dish = $this->menu->find($menuItemId);

            if ($dish === null) {
                throw new RuntimeException("Menyuda #{$menuItemId} taom topilmadi.");
            }

            /*
             * 86, enforced here and not only drawn on the tile.
             *
             * The POS greys out a stopped dish, and that is presentation: an
             * offline queue draining a shift that was rung up before the stop, an
             * aggregator posting straight to the API, a tablet on a stale menu
             * bundle — none of them are looking at the tile. This is the line the
             * kitchen actually cannot cook, so this is where it is refused.
             *
             * By name, because the message goes to a waiter standing in front of a
             * guest. "Manti hozir stop-listda" is something they can say out loud;
             * "menu_item 41 unavailable" is something they have to translate.
             */
            if (in_array($dish->id, $this->stops->stoppedItemIds(), true)) {
                /*
                 * Unless the caller is recording food that was already served.
                 *
                 * The one legitimate exception, and it arrives as a sentence
                 * rather than a flag so the row itself says why it exists — see
                 * the contract's note. An offline queue draining at seven the
                 * next morning is not ordering plov; it is writing down plov the
                 * kitchen cooked at eight last night, before it ran out at nine.
                 * Refusing it loses the sale and keeps the stock loss.
                 */
                if ($servedBeforeStop === null || trim($servedBeforeStop) === '') {
                    throw new RuntimeException("{$dish->title} hozir stop-listda.");
                }

                $note = $note === null
                    ? $servedBeforeStop
                    : $note.' · '.$servedBeforeStop;
            }

            /*
             * Priced and validated through the catalogue, never from the
             * request. The client is told the rules so it can grey out a sixth
             * checkbox; this is where a choice that is not offered for this dish
             * — or that breaks its group's min/max — is refused. It throws
             * rather than dropping what it does not recognise, because a ticket
             * that quietly lost "no onion" reaches the kitchen looking correct.
             */
            $choices = $this->menu->priceChoices($dish->id, $modifierChoiceIds);

            // The price is taken from the catalogue, not the request. An
            // override is possible — happy hour, a manager's decision — but it
            // has to be handed in explicitly rather than being the default.
            $unitPrice = $unitPriceOverride ?? $dish->price;

            if ($unitPrice < 0) {
                throw new RuntimeException('Narx manfiy bo\'la olmaydi.');
            }

            /*
             * Modifiers move the unit price, not a separate line.
             *
             * A steak at 45 000 with 14 000 of extra meat is one line at 59 000,
             * not two lines a guest has to add up. It also keeps the stepper
             * honest: raising the quantity to three charges the extra meat three
             * times, which is what the kitchen is about to cook.
             */
            $unitPrice += array_sum(array_map(
                static fn (ModifierChoice $choice): int => $choice->priceDelta,
                $choices,
            ));

            if ($unitPrice < 0) {
                // A discount modifier bigger than the dish. Refuse rather than
                // pay a guest to eat.
                throw new RuntimeException('Qo\'shimchalar narxni manfiy qildi.');
            }

            /** @var OrderItem $line */
            $line = OrderItem::create([
                'order_id' => $order->id,
                'menu_item_id' => $dish->id,
                // Snapshot: renaming or repricing the dish tomorrow must not
                // rewrite tonight's receipt.
                'sku' => $dish->sku,
                // Frozen with the rest: the authority is holding the
                // declaration that was filed, and a dish reclassified next month
                // must not rewrite it. See the migration.
                'plu' => $dish->plu,
                'title' => $dish->title,
                'station' => $dish->station,
                'quantity' => $quantity,
                'unit_price' => $unitPrice,
                'total_price' => $unitPrice * $quantity,
                'status' => 'pending',
                'note' => $note,
                'seat_no' => $seatNo,
                'bill_no' => $billNo,
            ]);

            foreach ($choices as $choice) {
                // Frozen here for the same reason the sku and title are: the
                // receipt has to keep saying what was asked for and what it
                // cost, whatever the menu does next month.
                OrderItemModifier::create([
                    'order_item_id' => $line->id,
                    'modifier_option_id' => $choice->id,
                    'name' => ['uz' => $choice->title, 'ru' => $choice->title, 'en' => $choice->title],
                    'price_delta' => $choice->priceDelta,
                ]);
            }

            return $this->toBill($this->recalculate($order));
        });
    }

    public function voidLine(int $billId, int $lineId, string $reason): Bill
    {
        return DB::transaction(function () use ($billId, $lineId, $reason): Bill {
            $order = $this->openOrderOrFail($billId);

            /** @var OrderItem|null $line */
            $line = $order->items()->whereKey($lineId)->first();

            if ($line === null) {
                throw new RuntimeException("Bu hisobda #{$lineId} qatori yo'q.");
            }

            if ($line->status === 'cancelled') {
                throw new RuntimeException('Bu qator allaqachon bekor qilingan.');
            }

            // Cancelled, not deleted, and the total goes to zero so the bill is
            // right while the line stays readable. "Which lines came off, and
            // why" is the first question anyone asks about a short till.
            $line->update([
                'status' => 'cancelled',
                'total_price' => 0,
                'note' => trim(($line->note ?? '').' | Bekor: '.$reason),
            ]);

            return $this->toBill($this->recalculate($order));
        });
    }

    public function applyDiscount(int $billId, int $amountTiyin, string $reason): Bill
    {
        if ($amountTiyin < 0) {
            throw new RuntimeException('Chegirma manfiy bo\'la olmaydi.');
        }

        return DB::transaction(function () use ($billId, $amountTiyin, $reason): Bill {
            $order = $this->openOrderOrFail($billId);
            $subtotal = (int) $order->items()->sum('total_price');

            if ($amountTiyin > $subtotal) {
                throw new RuntimeException('Chegirma hisob summasidan katta bo\'la olmaydi.');
            }

            $order->update([
                'discount_total' => $amountTiyin,
                'note' => trim(($order->note ?? '').' | Chegirma: '.$reason),
            ]);

            return $this->toBill($this->recalculate($order));
        });
    }

    public function send(int $billId): Bill
    {
        return DB::transaction(function () use ($billId): Bill {
            $order = $this->openOrderOrFail($billId);

            if ($order->items()->where('status', '!=', 'cancelled')->doesntExist()) {
                throw new RuntimeException('Bo\'sh hisobni oshxonaga yuborib bo\'lmaydi.');
            }

            /*
             * Already fired is not a failure — it is a waiter adding a course.
             *
             * Sending a bill that is past `draft` used to be refused, because
             * the ladder has no `placed → placed` step and rightly so. But
             * re-firing an edited bill is the normal case: two starters go, the
             * mains are added ten minutes later, and the same bill is sent
             * again. What must not happen is a second docket the cook has to
             * reconcile, and that is the writer's job below, not the ladder's.
             *
             * So the transition is attempted only from `draft`; anything else
             * that is still open just re-fires.
             */
            if ($order->status === 'draft' && ! $order->transitionTo('placed')) {
                throw new RuntimeException('Hisobni yuborib bo\'lmadi.');
            }

            // Firing leaves the bill at `placed` — which is exactly what the
            // kitchen screen labels "Yangi". Moving it on is the cook's job:
            // `accepted` when they take the ticket, `cooking` when they start.
            // The old code did both here, so every ticket arrived already
            // claimed and the KDS's first column was permanently empty.

            $bill = $this->toBill($order->refresh());

            /*
             * The dockets, in this transaction.
             *
             * Firing used to be two calls — this one, and a separate
             * POST /kitchen/dispatch the client had to remember to make. A
             * tablet that lost signal between them left a bill reading "sent"
             * with nothing on any pass, and the first anybody knew was a guest
             * asking where their food was. Both or neither, now.
             *
             * Through the contract rather than Kitchen's models, which is the
             * debt ModuleBoundaryTest had recorded in the other direction.
             */
            $this->tickets->fire($bill);

            return $bill;
        });
    }

    /**
     * @param  array<int, int>  $lineIds
     */
    public function split(int $billId, array $lineIds): Bill
    {
        if ($lineIds === []) {
            throw new RuntimeException('Bo\'lish uchun kamida bitta qator tanlang.');
        }

        return DB::transaction(function () use ($billId, $lineIds): Bill {
            $order = $this->openOrderOrFail($billId);

            $moving = $order->items()->whereIn('id', $lineIds)->get();

            if ($moving->count() !== count(array_unique($lineIds))) {
                throw new RuntimeException('Tanlangan qatorlarning ba\'zisi bu hisobda yo\'q.');
            }

            if ($moving->count() === $order->items()->count()) {
                // Moving everything is not a split, it is a rename — and it
                // would leave an empty bill behind that nobody closes.
                throw new RuntimeException('Hamma qatorni ko\'chirish — bu bo\'lish emas.');
            }

            $target = Order::create([
                'number' => Order::nextNumber(),
                'channel' => $order->channel,
                'status' => $order->status === 'draft' ? 'draft' : 'placed',
                'restaurant_table_id' => $order->restaurant_table_id,
                'table_label' => $order->table_label,
                'waiter_user_id' => $order->waiter_user_id,
                'customer_id' => $order->customer_id,
                'guests_count' => 1,
                'subtotal' => 0,
                'discount_total' => 0,
                'service_charge' => 0,
                'total' => 0,
                'note' => "Bo'lindi: {$order->number}",
            ]);

            $order->items()->whereIn('id', $lineIds)->update(['order_id' => $target->id]);

            $this->recalculate($order);

            return $this->toBill($this->recalculate($target));
        });
    }

    /**
     * @return array<int, Bill>
     */
    public function splitEvenly(int $billId, int $ways): array
    {
        return DB::transaction(function () use ($billId, $ways): array {
            $order = $this->divisibleOrFail($billId);

            $ceiling = $this->splitCeiling();

            if ($ways > $ceiling) {
                /*
                 * The restaurant's own ceiling, refused before the arithmetic.
                 *
                 * `BillSplit::evenly()` has a hard maximum of twelve because two
                 * surfaces draw a stepper that stops there; this is the house
                 * rule underneath it, and a venue that has set six means six.
                 * Refusing here rather than clamping: a bill silently divided
                 * six ways when a cashier asked for eight is six people paying
                 * and two walking out.
                 */
                throw new RuntimeException("Hisobni {$ceiling} tadan ko'proq bo'lib bo'lmaydi.");
            }

            try {
                $shares = BillSplit::evenly((int) $order->total, $ways);
            } catch (InvalidArgumentException $refusal) {
                // Re-thrown as the family this interface documents, so every
                // caller keeps its one catch. The message is already the
                // sentence a cashier should read.
                throw new RuntimeException($refusal->getMessage(), 0, $refusal);
            }

            return $this->divide($order, $shares);
        });
    }

    /**
     * @return array<int, Bill>
     */
    public function splitAmount(int $billId, int $amountTiyin): array
    {
        return DB::transaction(function () use ($billId, $amountTiyin): array {
            $order = $this->divisibleOrFail($billId);

            try {
                $shares = BillSplit::byAmount((int) $order->total, $amountTiyin);
            } catch (InvalidArgumentException $refusal) {
                throw new RuntimeException($refusal->getMessage(), 0, $refusal);
            }

            return $this->divide($order, $shares);
        });
    }

    public function merge(int $sourceBillId, int $targetBillId): Bill
    {
        if ($sourceBillId === $targetBillId) {
            throw new RuntimeException('Hisobni o\'zi bilan birlashtirib bo\'lmaydi.');
        }

        return DB::transaction(function () use ($sourceBillId, $targetBillId): Bill {
            $source = $this->openOrderOrFail($sourceBillId);
            $target = $this->openOrderOrFail($targetBillId);

            $source->items()->update(['order_id' => $target->id]);

            $source->update([
                'discount_total' => 0,
                'service_charge' => 0,
                'note' => trim(($source->note ?? '')." | Birlashtirildi: {$target->number}"),
            ]);
            $this->recalculate($source);
            $source->cancel("Birlashtirildi: {$target->number}");

            return $this->toBill($this->recalculate($target));
        });
    }

    public function transfer(
        int $billId,
        ?int $tableId = null,
        ?string $tableLabel = null,
        ?int $waiterUserId = null,
    ): Bill {
        return DB::transaction(function () use ($billId, $tableId, $tableLabel, $waiterUserId): Bill {
            $order = $this->openOrderOrFail($billId);

            $changes = [];

            if ($tableId !== null) {
                $changes['restaurant_table_id'] = $tableId;
                // Denormalised on purpose: renaming a table later must not
                // rewrite where a past bill was served.
                $changes['table_label'] = $tableLabel;
            }

            if ($waiterUserId !== null) {
                $changes['waiter_user_id'] = $waiterUserId;
            }

            if ($changes !== []) {
                $order->update($changes);
            }

            return $this->toBill($order->refresh());
        });
    }

    /**
     * The guest asked for the bill.
     *
     * Forgiving where the rest of this class is strict, and the contract says
     * why: a `draft` cannot reach `topay` — a bill nobody fired has no confirmed
     * lines to present — and refusing would throw away the fact that a guest
     * asked. The waiter is walking over regardless.
     *
     * A bill already at `topay` is left alone rather than re-stamped, so "how
     * long has this table been waiting" keeps meaning what it says when somebody
     * taps twice.
     */
    public function awaitPayment(int $billId): Bill
    {
        return DB::transaction(function () use ($billId): Bill {
            $order = $this->openOrderOrFail($billId);

            if ($order->status !== OrderState::ToPay->value) {
                // Return value ignored on purpose — see above. The ladder
                // refusing is a state, not a failure.
                $order->transitionTo(OrderState::ToPay->value);
            }

            return $this->toBill($order->refresh());
        });
    }

    /**
     * The rider moved, so the bill and the dispatch row both move.
     *
     * Two writes in one transaction. The bill goes to `enroute` or `handed`,
     * which is what the guest's tracking screen reads off the ladder; the
     * delivery row records the moment, which is what the console's delivery tab
     * and a payroll question read. Splitting them across two callers is how the
     * tracking screen and the dispatch board end up telling a guest two things.
     *
     * `false` rather than a refusal for everything a stale queue can produce —
     * a bill that no longer exists, a bill nobody assigned a rider to, an entry
     * that would wind a completed drop backwards. See the contract.
     */
    public function markDelivery(int $billId, string $status, ?Carbon $at = null): bool
    {
        return DB::transaction(function () use ($billId, $status, $at): bool {
            /** @var Delivery|null $delivery */
            $delivery = Delivery::query()->live()->lockForUpdate()
                ->where('order_id', $billId)
                ->first();

            if ($delivery === null || ! $delivery->advance($status, $at)) {
                return false;
            }

            /** @var Order|null $order */
            $order = Order::query()->lockForUpdate()->find($billId);

            /*
             * The ladder is asked, not told.
             *
             * `transitionTo()` refuses a move the state machine does not allow
             * and the return value is deliberately ignored, exactly as
             * `awaitPayment()` does: a bill the guest already paid for at the
             * counter is `paid` and stays `paid` while its food is carried
             * across town, and the rider's own row is where "enroute" lives for
             * that order. A dispatch update must not fail because the money
             * arrived first.
             */
            $rung = match ($status) {
                'picked', 'enroute' => OrderState::Enroute->value,
                'delivered' => OrderState::Handed->value,
                default => null,
            };

            if ($order !== null && $rung !== null && $order->status !== $rung) {
                $order->transitionTo($rung);
            }

            return true;
        });
    }

    public function close(int $billId): Bill
    {
        return DB::transaction(function () use ($billId): Bill {
            $order = $this->openOrderOrFail($billId);

            if (! $order->transitionTo('paid')) {
                throw new RuntimeException('Hisobni yopib bo\'lmadi.');
            }

            /*
             * The second axis follows the first, but only where there is one.
             *
             * `payment_state` is null on every bill a waiter opened — the till
             * has no such column and reading one into it would invent a state
             * for two years of history. On a guest's order it is `pending` or
             * `due`, and a settled bill whose payment_state still said `pending`
             * is what the tracking screen would render as "waiting for your
             * payment" beside a meal that has been eaten and paid for.
             */
            if ($order->payment_state !== null && $order->payment_state !== 'paid') {
                $order->forceFill(['payment_state' => 'paid'])->save();
            }

            $this->clearTableIfAsked($order);

            return $this->toBill($order->refresh());
        });
    }

    /**
     * The table clears itself, when the restaurant has asked it to.
     *
     * `policies.auto_close_table_after_payment`. Off by default, because a bar
     * clears its own tables and a floor map that moved on its own would be
     * fighting the host.
     *
     * Two guards, and the second is the one that matters. A bill with no table
     * is takeaway. A table with ANOTHER open bill on it is a party still eating
     * — four friends on separate tabs, one of whom paid early — and clearing it
     * there would take a live table off the floor map mid-service, which is the
     * single way this convenience can do damage.
     *
     * Failure is ignored on purpose: `FloorPlan::release()` answers `false` for
     * a table somebody has since reserved, for a module that is switched off,
     * and for a table already cleared. None of those is a reason to fail a
     * payment that has already been taken.
     */
    private function clearTableIfAsked(Order $order): void
    {
        $tableId = $order->restaurant_table_id;

        if ($tableId === null || ! $this->policies->on('auto_close_table_after_payment')) {
            return;
        }

        $stillEating = Order::query()
            ->open()
            ->where('restaurant_table_id', $tableId)
            ->whereKeyNot($order->getKey())
            ->exists();

        if ($stillEating) {
            return;
        }

        $this->floor->release((int) $tableId);
    }

    /**
     * How many open bills one waiter may carry — `policies.max_open_bills_per_waiter`.
     *
     * Zero, the default, means no ceiling: this platform had none before the
     * setting existed and a restaurant that has never opened the screen must
     * trade exactly as it did. A venue that sets one is answering a real
     * problem — a waiter with fourteen open tables has two they have forgotten,
     * and the Z report is where they find out.
     *
     * Counted per waiter across the restaurant rather than per venue, because
     * the bills are what the person is carrying and a waiter is in one building
     * at a time anyway.
     */
    private function waiterHasRoomOrFail(?int $waiterUserId): void
    {
        $ceiling = $this->policies->number('max_open_bills_per_waiter');

        if ($waiterUserId === null || $ceiling === 0) {
            return;
        }

        $open = Order::query()->open()->where('waiter_user_id', $waiterUserId)->count();

        if ($open >= $ceiling) {
            throw new RuntimeException(
                "Ochiq hisoblar chegarasi: {$ceiling} ta. Avval birortasini yoping.",
            );
        }
    }

    /**
     * The most ways a bill may be divided here.
     *
     * The restaurant's rule, bounded by the platform's. `BillSplit::WAYS_MAX` is
     * twelve because the guest app's stepper and the till's copy both stop
     * there, and a settings document is not allowed to raise a ceiling two
     * surfaces draw — the schema refuses anything above twelve, and this is the
     * belt underneath it for a document written before that rule existed.
     */
    private function splitCeiling(): int
    {
        $asked = $this->policies->number('split_max_ways');

        return $asked === 0 ? BillSplit::WAYS_MAX : min($asked, BillSplit::WAYS_MAX);
    }

    public function markPrepaid(int $billId): Bill
    {
        return DB::transaction(function () use ($billId): Bill {
            $order = $this->openOrderOrFail($billId);

            $order->forceFill(['payment_state' => 'paid'])->save();

            /*
             * Firing is what the money unblocks, and only for a bill nothing
             * has fired yet. See the contract: a bill already on a pass gets no
             * second docket, and `send()` on it would give a cook one.
             */
            if ($order->status !== OrderState::Draft->value) {
                return $this->toBill($order->refresh());
            }

            return $this->atTheBranchThatIsCookingIt($order, fn (): Bill => $this->send($billId));
        });
    }

    /**
     * Run something with the branch context this bill belongs to.
     *
     * Every other caller of `send()` arrives with a branch already resolved —
     * `ResolveBranch` read `X-Branch` off a till, or `PublicOrderController`
     * set it by hand from the venue the guest tapped. This one arrives from a
     * BANK: a payment provider's callback, with no session, no header and
     * nothing that could name a venue.
     *
     * Without the context the dockets `TicketWriter` writes land with a null
     * `branch_id`, because `BelongsToBranch` stamps on `creating` and there is
     * nothing to stamp from. The KDS in the building filters by branch, so the
     * ticket exists, the bill reads "placed", and no screen anywhere shows it —
     * the guest waits for food nobody is cooking, which is the exact failure
     * `PublicOrderController` documented on the ordering path.
     *
     * The bill knows its own branch, so it answers. Restored rather than
     * cleared afterwards: under php-fpm this runs mid-request on a worker that
     * may already have had one, and clearing it would silently widen the next
     * query in the same request from one venue to the whole estate.
     *
     * @template T
     *
     * @param  callable(): T  $work
     * @return T
     */
    private function atTheBranchThatIsCookingIt(Order $order, callable $work): mixed
    {
        $branches = app(BranchContext::class);

        if ($order->branch_id === null || $branches->id() === (int) $order->branch_id) {
            return $work();
        }

        $before = $branches->branch();

        $branches->set($order->branch);

        try {
            return $work();
        } finally {
            $branches->set($before);
        }
    }

    public function reopen(int $billId, string $reason): Bill
    {
        return DB::transaction(function () use ($billId, $reason): Bill {
            /** @var Order|null $order */
            $order = Order::query()->lockForUpdate()->find($billId);

            if ($order === null) {
                throw new RuntimeException("#{$billId} hisobi topilmadi.");
            }

            if ($order->status !== 'paid') {
                throw new RuntimeException('Faqat to\'langan hisobni qayta ochish mumkin.');
            }

            $this->insideReopenWindowOrFail($order);

            // Straight back to `served`: the food went out, only the money is
            // being reconsidered. The reason is appended rather than replacing
            // the note, so a bill reopened twice tells the whole story.
            $order->forceFill([
                'status' => 'served',
                'closed_at' => null,
                'note' => trim(($order->note ?? '').' | Qayta ochildi: '.$reason),
            ])->save();

            return $this->toBill($order->refresh());
        });
    }

    /**
     * @return array<int, Bill>
     */
    public function openBillsOn(int $tableId): array
    {
        return Order::query()
            ->open()
            ->where('restaurant_table_id', $tableId)
            // Newest first: a waiter arriving at an occupied table is almost always
            // joining what is happening now, not what was left an hour ago.
            ->latest('id')
            ->with(['items.modifiers'])
            ->get()
            ->map(fn (Order $order): Bill => $this->toBill($order))
            ->all();
    }

    public function cancel(int $billId, string $reason): Bill
    {
        return DB::transaction(function () use ($billId, $reason): Bill {
            $order = $this->openOrderOrFail($billId);

            if (! $order->cancel($reason)) {
                throw new RuntimeException('Hisobni bekor qilib bo\'lmadi.');
            }

            return $this->toBill($order->refresh());
        });
    }

    /**
     * The restaurant is paying for this one.
     *
     * Its own state rather than a cancellation with a note, because the two differ
     * in the one place it matters: the food was made. Stock left the shelf, a cook
     * spent twenty minutes, the station ran. A comped bill that was recorded as
     * voided makes food cost look like a kitchen wasting ingredients on orders
     * nobody placed — and the manager chases a theft that is actually a birthday
     * dessert somebody authorised.
     */
    public function comp(int $billId, string $reason): Bill
    {
        return DB::transaction(function () use ($billId, $reason): Bill {
            $order = $this->openOrderOrFail($billId);

            if (! $order->comp($reason)) {
                throw new RuntimeException('Hisobni sovg\'a qilib bo\'lmadi.');
            }

            return $this->toBill($order->refresh());
        });
    }

    /**
     * The money went back.
     *
     * The order half of a refund, and only the order half — the payment rows are
     * Finance's, through `TillLedger::refund()`. A caller must do both inside one
     * transaction: the state between them, money returned against a bill still
     * reading `paid`, is the one an audit cannot explain and a guest can walk back
     * in and exploit.
     *
     * A settled bill, not an open one. Refunding something never paid for is a
     * cancellation, and it has its own method — this refuses rather than quietly
     * doing the other thing.
     */
    public function refund(int $billId, string $reason): Bill
    {
        return DB::transaction(function () use ($billId, $reason): Bill {
            /*
             * Locked, and that is not decoration.
             *
             * `openOrderOrFail()` takes the row lock for every other write on this
             * class; this path could not use it, because it wants a bill that is
             * closed. Reading without the lock leaves the window two refunds need:
             * both requests see `paid`, both pass `canMoveTo(Refunded)`, both write
             * — and the caller runs `TillLedger::refund()` in the same transaction,
             * so the guest is paid back twice for one meal. The ladder cannot catch
             * it, because neither request has committed when the other checks.
             */
            $order = Order::query()->lockForUpdate()->find($billId);

            if ($order === null) {
                throw new RuntimeException("#{$billId} hisobi topilmadi.");
            }

            if ($order->status !== OrderState::Paid->value) {
                throw new RuntimeException("#{$order->number} to\'lanmagan — qaytarib bo\'lmaydi.");
            }

            /*
             * A refund with nothing written on it — `policies.refund_needs_reason`.
             *
             * On by default, and the reason is what the rule is FOR: a loss
             * report is a list of refunds beside their reasons, and a column of
             * blanks is a report nobody reads and a hole nobody finds. Three
             * characters is the same floor `DiscountRequest` enforces, so a
             * cashier who has learned one field has learned both.
             */
            if ($this->policies->on('refund_needs_reason') && mb_strlen(trim($reason)) < 3) {
                throw new RuntimeException('Qaytarish sababini yozing.');
            }

            if (! $order->markRefunded($reason)) {
                throw new RuntimeException('Hisobni qaytarib bo\'lmadi.');
            }

            return $this->toBill($order->refresh());
        });
    }

    // ============ Internals ============

    /**
     * How long after settling a bill may still be reopened —
     * `policies.reopen_window_minutes`.
     *
     * Zero, the default, means no window at all, which is how this platform
     * behaved before the setting existed.
     *
     * Measured from `closed_at` and not from `updated_at`: a bill reopened and
     * settled again keeps moving `updated_at`, and a window measured on it
     * would quietly extend itself every time somebody touched the row. A bill
     * with no `closed_at` — settled by a path that did not stamp one — is left
     * alone rather than refused, because refusing on missing data would turn a
     * data gap into a cashier who cannot correct a mistake.
     */
    private function insideReopenWindowOrFail(Order $order): void
    {
        $window = $this->policies->number('reopen_window_minutes');

        if ($window === 0 || $order->closed_at === null) {
            return;
        }

        if ($order->closed_at->diffInMinutes(now()) > $window) {
            throw new RuntimeException(
                "Hisob {$window} daqiqadan oldin yopilgan — smenani tuzatish orqali o'zgartiring.",
            );
        }
    }

    private function openOrderOrFail(int $billId): Order
    {
        /** @var Order|null $order */
        $order = Order::query()->lockForUpdate()->find($billId);

        if ($order === null) {
            throw new RuntimeException("#{$billId} hisobi topilmadi.");
        }

        if (! $order->is_open) {
            throw new RuntimeException("#{$order->number} hisobi yopilgan — o'zgartirib bo'lmaydi.");
        }

        return $order;
    }

    /**
     * A bill that may still be carved up, locked for the duration.
     *
     * Three refusals beyond "it is closed", and each is a different mistake:
     *
     *   - **nothing on it.** Dividing zero produces shares of zero and a family
     *     of bills nobody can settle, which then sit open on the table forever.
     *   - **it is already a share.** Splitting a share would nest a family
     *     inside a family, and `split_parent_id` has one level in it on purpose:
     *     a receipt says "2/4", not "2/4 of 1/3".
     *   - **it has already been split.** The shares are what is owed now; a
     *     second division would be computed against a total that has already
     *     been handed out, and the family would stop adding up. Undo is
     *     deliberately absent — settle the shares, or void them one by one, so
     *     that whatever happens leaves a row.
     */
    private function divisibleOrFail(int $billId): Order
    {
        $order = $this->openOrderOrFail($billId);

        if ((int) $order->total <= 0) {
            throw new RuntimeException("#{$order->number} hisobida bo'linadigan summa yo'q.");
        }

        if ($order->split_parent_id !== null) {
            throw new RuntimeException("#{$order->number} allaqachon bo'lingan hisobning ulushi.");
        }

        if ($order->splitShares()->exists()) {
            throw new RuntimeException("#{$order->number} allaqachon bo'lingan.");
        }

        return $order;
    }

    /**
     * Mint the family: the parent takes the first share, siblings take the rest.
     *
     * The parent keeps its lines — see the contract and the split migration for
     * the whole argument — so what changes on it is one column and the money
     * derived from it. Everything else is carried across so each sibling reads
     * as the same table on the same channel with the same waiter: the till lists
     * them side by side, and a share whose header said something different would
     * look like somebody else's bill.
     *
     * @param  list<int>  $shares
     * @return array<int, Bill>
     */
    private function divide(Order $order, array $shares): array
    {
        $family = [$order];

        foreach (array_slice($shares, 1) as $index => $share) {
            $family[] = Order::create([
                'number' => Order::nextNumber(),
                'channel' => $order->channel,
                /*
                 * The parent's rung, with one substitution.
                 *
                 * A share has to be settleable the moment it is minted, and the
                 * ladder allows `placed → paid`; `draft` and `topay` are carried
                 * as they are because both already mean something exact — a bill
                 * nobody has fired, and a table waiting to pay.
                 */
                'status' => in_array((string) $order->status, ['draft', 'topay'], true)
                    ? (string) $order->status
                    : 'placed',
                'restaurant_table_id' => $order->restaurant_table_id,
                'table_label' => $order->table_label,
                'waiter_user_id' => $order->waiter_user_id,
                'customer_id' => $order->customer_id,
                'guests_count' => 1,
                'subtotal' => 0,
                'discount_total' => 0,
                'service_charge' => 0,
                'total' => 0,
                'split_parent_id' => $order->getKey(),
                'split_share_total' => $share,
                // Position in the family, in the words the receipt prints:
                // "2/4 — Bo'lindi: A-0042".
                'note' => sprintf('%d/%d — Bo\'lindi: %s', $index + 2, count($shares), $order->number),
                'placed_at' => $order->placed_at,
            ]);
        }

        // Written last, so a failure anywhere above leaves the parent whole
        // rather than holding a share of a family that was never minted.
        $order->forceFill(['split_share_total' => $shares[0]])->save();

        return array_map(fn (Order $bill): Bill => $this->toBill($this->recalculate($bill)), $family);
    }

    private function recalculate(Order $order): Order
    {
        return $order->recalculateTotals()->refresh();
    }

    private function toBill(Order $order): Bill
    {
        // Eager on `modifiers`, because a bill of twenty lines would otherwise
        // be twenty-one queries every time a waiter taps anything.
        $lines = $order->relationLoaded('items')
            ? $order->items->loadMissing('modifiers')
            : $order->items()->with('modifiers')->orderBy('id')->get();

        return new Bill(
            id: (int) $order->id,
            number: (string) $order->number,
            channel: (string) $order->channel,
            status: (string) $order->status,
            tableId: $order->restaurant_table_id === null ? null : (int) $order->restaurant_table_id,
            tableLabel: $order->table_label,
            waiterUserId: $order->waiter_user_id === null ? null : (int) $order->waiter_user_id,
            customerId: $order->customer_id === null ? null : (int) $order->customer_id,
            guestsCount: (int) $order->guests_count,
            subtotal: (int) $order->subtotal,
            discountTotal: (int) $order->discount_total,
            serviceCharge: (int) $order->service_charge,
            total: (int) $order->total,
            vatIncluded: (int) ($order->vat_included ?? 0),
            deliveryFee: (int) ($order->delivery_fee ?? 0),
            lines: $lines->map(static fn (OrderItem $item): BillLine => new BillLine(
                id: (int) $item->id,
                orderId: (int) $item->order_id,
                menuItemId: $item->menu_item_id === null ? null : (int) $item->menu_item_id,
                sku: (string) $item->sku,
                plu: $item->plu,
                title: (string) $item->title,
                station: $item->station,
                quantity: (int) $item->quantity,
                unitPrice: (int) $item->unit_price,
                totalPrice: (int) $item->total_price,
                status: (string) $item->status,
                note: $item->note,
                seatNo: (int) $item->seat_no,
                billNo: (int) $item->bill_no,
                modifiers: $item->modifiers
                    ->map(static fn (OrderItemModifier $modifier): LineModifier => new LineModifier(
                        optionId: $modifier->modifier_option_id === null
                            ? null
                            : (int) $modifier->modifier_option_id,
                        // Resolved for the request locale by HasTranslations,
                        // from the snapshot rather than from the live option.
                        title: (string) ($modifier->title ?? ''),
                        priceDelta: (int) $modifier->price_delta,
                    ))
                    ->all(),
            ))->all(),
            note: $order->note,
        );
    }
}
