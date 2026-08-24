<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * The columns a bill needs when nobody at the restaurant typed it.
 *
 * Every order on this platform so far was opened by a person holding a
 * terminal: a waiter at a table, a cashier at a counter. `orders.orders` is
 * shaped for that — it knows the table, the waiter and the guest count, and it
 * knows the customer only as a `customer_id` somebody looked up.
 *
 * A delivery ordered from a phone has none of those. There is no table, no
 * waiter, and no customer row yet — there is a number to ring, a name to say at
 * the door, and an address to carry it to. Those are what this adds.
 *
 * ---------------------------------------------------------------------------
 * Why on the order and not in CRM
 *
 * `customer_id` stays, and a public order may still carry one when the guest is
 * signed in. But the phone and the name are written onto the BILL as well,
 * because they are a snapshot of what was said at the time — the same rule
 * `table_label` already follows. A guest who changes their number next month
 * must not rewrite the address a courier was sent to last night, and a courier
 * looking at tonight's order must not need CRM to be reachable.
 *
 * Creating the customer row is CRM's business and happens on `orders.placed`,
 * asynchronously. Orders does not know CRM exists.
 *
 * ---------------------------------------------------------------------------
 * `payment_state`, and why it is not a fourteenth rung on the ladder
 *
 * An order paid online is not paid until the money arrives, and until then the
 * kitchen must not cook it. The obvious move is a `pending_payment` state — and
 * it is the wrong one: `App\Support\Orders\OrderState` is the canonical ladder,
 * mirrored key-for-key in `packages/i18n/src/order-state.ts` and drawn from the
 * design file's own STATES table, and adding a rung there changes what four
 * surfaces render for every order ever placed.
 *
 * Payment is a second axis, not a rung. An order can be `cooking` and unpaid
 * (cash on delivery) or `draft` and paid (an online order whose money landed
 * before anybody fired it). One column each, and the ladder keeps meaning what
 * it says: where the FOOD is.
 *
 * So an online order waits at `draft` — never fired, so no docket, so no
 * kitchen — with `payment_state = 'pending'`. Cash and card-on-delivery are
 * `due`: the food is cooked and the money arrives at the door.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('orders.orders', function (Blueprint $table): void {
            /*
             * What the courier says at the door, and what the restaurant rings.
             *
             * Nullable because every existing row — and every dine-in bill ever
             * — has neither. A required column here would be a lie about the
             * two thirds of service that happen in the room.
             */
            $table->string('customer_name', 120)->nullable()
                ->comment('Snapshot: who ordered, as they gave it');
            $table->string('customer_phone', 32)->nullable()
                ->comment('Snapshot, normalised to digits only — see PublicOrderController');

            /*
             * One line of address, plus a landmark.
             *
             * Not a structured street/house/flat triple: Tashkent addresses are
             * routinely a mahalla and a landmark rather than a number, and a
             * form that demands a house number gets "—" typed into it. What a
             * courier needs is the sentence the guest would say on the phone.
             *
             * Coordinates alongside, nullable, because a map pin is the half of
             * an address a human cannot mistype — and the half no web form on
             * this platform collects yet.
             */
            $table->string('delivery_address', 255)->nullable();
            $table->string('delivery_note', 255)->nullable()
                ->comment('Entrance, floor, doorbell — what the map cannot say');
            $table->decimal('delivery_lat', 10, 7)->nullable();
            $table->decimal('delivery_lng', 10, 7)->nullable();

            $table->string('payment_method', 24)->nullable()
                ->comment('cash|card_on_delivery|online');
            $table->string('payment_state', 16)->nullable()
                ->comment('pending|due|paid — see the migration note; NOT a ladder rung');

            /*
             * The code the guest typed, recorded and never trusted.
             *
             * CRM checks codes — `POST /api/v1/public/promo-codes/check` — and
             * that is a check a CLIENT makes, which is exactly why the discount
             * cannot be taken from this column. A code the phone says is worth
             * twenty percent is a number the phone chose; a stranger naming any
             * string would get money off, and that is not a promotion but a
             * price field with extra steps.
             *
             * Applying it server-side needs a contract Orders can call —
             * `App\Contracts\Crm\Promotions`, which does not exist — because a
             * module may not import another. Until it does, this is stored and
             * moves no money, and the orders that carried a code are already
             * countable, which is the question marketing asks first.
             */
            $table->string('promo_code', 32)->nullable();

            /*
             * Which door the order came through.
             *
             * `channel` says how the food travels (delivery, takeaway); this
             * says who typed it. A delivery from the website, the phone app, the
             * Telegram mini app and a call-centre operator are four different
             * conversations with four different failure modes, and telling them
             * apart afterwards is impossible if nobody wrote it down.
             */
            $table->string('source', 24)->nullable()
                ->comment('web|app|telegram|qr|pos|aggregator');

            /*
             * What we PROMISED, not what we hope.
             *
             * An ETA computed at read time answers "how long from now", which is
             * a different and much kinder question than "were we late". This is
             * the number the guest was shown, frozen; the difference between it
             * and `closed_at` is the only honest measure of a delivery promise.
             */
            $table->datetime('promised_at')->nullable();
        });

        /*
         * Two reads this endpoint makes on every order, and both would otherwise
         * scan the table that grows fastest.
         *
         * The first is the belt: "does this number already have three open
         * orders". The second is tracking, which looks a bill up by number and
         * then checks the phone — `(tenant_id, number)` is already unique, so
         * only the first needs an index of its own.
         *
         * Partial, because dine-in bills have no phone and there are far more of
         * them than there will ever be phone orders. An index that skips the
         * majority of the table is an index that stays in memory.
         */
        DB::statement(
            'create index orders_by_guest_phone on orders.orders (tenant_id, customer_phone, status)'
            .' where customer_phone is not null',
        );
    }

    public function down(): void
    {
        DB::statement('drop index if exists orders.orders_by_guest_phone');

        Schema::table('orders.orders', function (Blueprint $table): void {
            $table->dropColumn([
                'customer_name',
                'customer_phone',
                'delivery_address',
                'delivery_note',
                'delivery_lat',
                'delivery_lng',
                'payment_method',
                'payment_state',
                'promo_code',
                'source',
                'promised_at',
            ]);
        });
    }
};
