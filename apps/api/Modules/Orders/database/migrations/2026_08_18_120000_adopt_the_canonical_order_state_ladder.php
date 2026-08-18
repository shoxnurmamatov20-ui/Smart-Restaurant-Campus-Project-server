<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * Move orders onto the canonical ladder.
 *
 * The old vocabulary was this module's own: `in_kitchen` and `on_the_way`
 * appear in no design file and in no handoff document, and `cancelled`
 * collapsed three events that DECISIONS Q8 requires kept apart — a void moves
 * no money, a refund is negative revenue, and a comp is a marketing expense.
 *
 * The mapping below is lossy in exactly one place and deliberately so:
 * `cancelled` becomes `voided`, because a void is the only one of the three
 * that never moved money, and every existing `cancelled` row predates any
 * refund or comp path existing at all. Rows created after this migration
 * choose between the three explicitly.
 */
return new class extends Migration
{
    /** @var array<string, string> */
    private const FORWARD = [
        'in_kitchen' => 'cooking',
        'on_the_way' => 'enroute',
        'delivered' => 'handed',
        'cancelled' => 'voided',
    ];

    /** @var array<string, string> */
    private const BACKWARD = [
        'cooking' => 'in_kitchen',
        'enroute' => 'on_the_way',
        'handed' => 'delivered',
        'voided' => 'cancelled',
        // States the old ladder never had. `accepted` and `topay` fall back to
        // their nearest old neighbour so a rollback leaves no unreadable value;
        // `refunded` and `comped` become `cancelled`, which is what the old
        // vocabulary would have called them.
        'accepted' => 'placed',
        'topay' => 'served',
        'refunded' => 'cancelled',
        'comped' => 'cancelled',
    ];

    public function up(): void
    {
        $this->remap(self::FORWARD);
    }

    public function down(): void
    {
        $this->remap(self::BACKWARD);
    }

    /** @param array<string, string> $map */
    private function remap(array $map): void
    {
        foreach ($map as $from => $to) {
            DB::table('orders.orders')->where('status', $from)->update(['status' => $to]);

            // Line state shares the vocabulary where the values overlap, so it
            // moves in the same pass rather than being discovered later by a
            // KDS that cannot read its own tickets.
            DB::table('orders.order_items')->where('status', $from)->update(['status' => $to]);
        }
    }
};
