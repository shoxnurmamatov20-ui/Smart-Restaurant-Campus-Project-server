<?php

declare(strict_types=1);

namespace App\Support\Orders;

use App\Contracts\Menu\MenuCatalog;
use App\Contracts\Menu\StopList;
use App\Support\Errors\ApiException;

/**
 * Turning a basket of ids from a stranger's phone into dishes this kitchen can
 * actually cook.
 *
 * Two endpoints need exactly this and they live in two modules: a delivery
 * ordered from the customer app (Orders) and a plate added from a QR code at a
 * table (Tables). Modules may not import one another, so the shared half sits
 * in the core beside `BillTotals` — which is here for the same reason, that
 * several callers must agree and the only way to be sure is for the rule to
 * exist once.
 *
 * ---------------------------------------------------------------------------
 * Why it refuses here rather than at `addLine`
 *
 * `BillRegistry::addLine()` already refuses a stopped dish, and rightly — it is
 * the last line of defence and it works for every caller, including an offline
 * queue nobody wrote a controller for. But it refuses by throwing a
 * `RuntimeException` with an Uzbek sentence in it, from inside a transaction
 * that has already opened a bill.
 *
 * A guest gets a better answer if the whole basket is checked before anything
 * is written: one refusal, naming the dish, in the reader's own language, with
 * the id so the phone can grey out the right tile — and no half-built order to
 * roll back. The contract's throw stays where it is; this is the polite version
 * in front of it.
 */
final readonly class GuestBasket
{
    /**
     * @param  array<int, GuestBasketLine>  $lines
     */
    private function __construct(public array $lines) {}

    /**
     * Read a validated `items` array and prove every line is sellable.
     *
     * @param  array<int, array<string, mixed>>  $items  As validated: menu_item_id,
     *                                                   quantity, and optionally
     *                                                   modifier_choice_ids and note.
     * @param  string  $field  The request field to blame, so the phone can highlight it.
     *
     * @throws ApiException when a dish is unknown, withdrawn, or 86'd tonight
     */
    public static function read(array $items, MenuCatalog $menu, StopList $stops, string $field = 'items'): self
    {
        // Read once, not once per line: a basket of twelve would otherwise ask
        // the kitchen the same question twelve times.
        $stopped = $stops->stoppedItemIds();
        $lines = [];

        foreach ($items as $item) {
            $dishId = (int) ($item['menu_item_id'] ?? 0);
            $dish = $menu->find($dishId);

            if ($dish === null) {
                throw ApiException::of('order.item_not_found', field: $field, meta: [
                    'menu_item_id' => $dishId,
                ]);
            }

            /*
             * Two different unavailabilities, one refusal.
             *
             * `isOrderable` is the business saying it does not sell this — a
             * draft, an archived dish, one withdrawn from the menu. The stop
             * list is one kitchen saying it has run out tonight. A guest cannot
             * act on the difference, so they get one answer; the meta carries
             * which dish, which is what a screen needs to grey the right tile.
             */
            if (! $dish->isOrderable || in_array($dish->id, $stopped, true)) {
                throw ApiException::detailed(
                    'stop_list.item_unavailable',
                    uz: "{$dish->title} hozir mavjud emas.",
                    ru: "«{$dish->title}» сейчас недоступно.",
                    en: "{$dish->title} is not available right now.",
                    field: $field,
                    meta: ['menu_item_id' => $dish->id],
                );
            }

            $note = $item['note'] ?? null;

            $lines[] = new GuestBasketLine(
                dish: $dish,
                quantity: max(1, (int) ($item['quantity'] ?? 1)),
                choiceIds: array_values(array_map(
                    static fn ($id): int => (int) $id,
                    (array) ($item['modifier_choice_ids'] ?? []),
                )),
                note: is_string($note) && trim($note) !== '' ? trim($note) : null,
                seatNo: max(1, (int) ($item['seat_no'] ?? 1)),
            );
        }

        return new self($lines);
    }

    /**
     * The slowest dish in the basket, in minutes.
     *
     * The slowest, not the sum: a kitchen with a grill and a salad station
     * cooks them at the same time, and adding the two would quote an hour for a
     * plate that is ready in twenty.
     *
     * `$floor` is what a dish that says nothing is worth — most of the
     * catalogue leaves `cook_time_minutes` null, and treating that as zero
     * would promise a guest their dinner immediately.
     */
    public function slowestCookMinutes(int $floor): int
    {
        $slowest = $floor;

        foreach ($this->lines as $line) {
            $slowest = max($slowest, (int) ($line->dish->cookTimeMinutes ?? 0));
        }

        return $slowest;
    }
}
