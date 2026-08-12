<?php

declare(strict_types=1);

namespace Modules\Orders\Services;

use App\Contracts\Menu\MenuCatalog;
use App\Contracts\Orders\Bill;
use App\Contracts\Orders\BillLine;
use App\Contracts\Orders\BillRegistry;
use Illuminate\Support\Facades\DB;
use Modules\Orders\Models\Order;
use Modules\Orders\Models\OrderItem;
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
    public function __construct(private readonly MenuCatalog $menu) {}

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

    public function find(int $billId): ?Bill
    {
        $order = Order::query()->with('items')->find($billId);

        return $order === null ? null : $this->toBill($order);
    }

    public function addLine(
        int $billId,
        int $menuItemId,
        int $quantity = 1,
        ?int $unitPriceOverride = null,
        ?string $note = null,
    ): Bill {
        if ($quantity < 1) {
            throw new RuntimeException('Miqdor kamida 1 bo\'lishi kerak.');
        }

        return DB::transaction(function () use ($billId, $menuItemId, $quantity, $unitPriceOverride, $note): Bill {
            $order = $this->openOrderOrFail($billId);

            $dish = $this->menu->find($menuItemId);

            if ($dish === null) {
                throw new RuntimeException("Menyuda #{$menuItemId} taom topilmadi.");
            }

            // The price is taken from the catalogue, not the request. An
            // override is possible — happy hour, a manager's decision — but it
            // has to be handed in explicitly rather than being the default.
            $unitPrice = $unitPriceOverride ?? $dish->price;

            if ($unitPrice < 0) {
                throw new RuntimeException('Narx manfiy bo\'la olmaydi.');
            }

            OrderItem::create([
                'order_id' => $order->id,
                'menu_item_id' => $dish->id,
                // Snapshot: renaming or repricing the dish tomorrow must not
                // rewrite tonight's receipt.
                'sku' => $dish->sku,
                'title' => $dish->title,
                'station' => $dish->station,
                'quantity' => $quantity,
                'unit_price' => $unitPrice,
                'total_price' => $unitPrice * $quantity,
                'status' => 'pending',
                'note' => $note,
            ]);

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

    public function applyServiceCharge(int $billId, int $amountTiyin): Bill
    {
        if ($amountTiyin < 0) {
            throw new RuntimeException('Servis haqi manfiy bo\'la olmaydi.');
        }

        return DB::transaction(function () use ($billId, $amountTiyin): Bill {
            $order = $this->openOrderOrFail($billId);
            $order->update(['service_charge' => $amountTiyin]);

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

            if (! $order->transitionTo('placed')) {
                throw new RuntimeException('Hisobni yuborib bo\'lmadi.');
            }

            $order->refresh();
            $order->transitionTo('in_kitchen');

            return $this->toBill($order->refresh());
        });
    }

    /**
     * @param array<int, int> $lineIds
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

    public function close(int $billId): Bill
    {
        return DB::transaction(function () use ($billId): Bill {
            $order = $this->openOrderOrFail($billId);

            if (! $order->transitionTo('paid')) {
                throw new RuntimeException('Hisobni yopib bo\'lmadi.');
            }

            return $this->toBill($order->refresh());
        });
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

    // ============ Internals ============

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

    private function recalculate(Order $order): Order
    {
        return $order->recalculateTotals()->refresh();
    }

    private function toBill(Order $order): Bill
    {
        $lines = $order->relationLoaded('items')
            ? $order->items
            : $order->items()->orderBy('id')->get();

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
            lines: $lines->map(static fn (OrderItem $item): BillLine => new BillLine(
                id: (int) $item->id,
                orderId: (int) $item->order_id,
                menuItemId: $item->menu_item_id === null ? null : (int) $item->menu_item_id,
                sku: (string) $item->sku,
                title: (string) $item->title,
                station: $item->station,
                quantity: (int) $item->quantity,
                unitPrice: (int) $item->unit_price,
                totalPrice: (int) $item->total_price,
                status: (string) $item->status,
                note: $item->note,
            ))->all(),
            note: $order->note,
        );
    }
}
