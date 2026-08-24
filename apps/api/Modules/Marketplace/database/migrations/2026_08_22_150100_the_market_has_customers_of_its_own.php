<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * The three tables on this platform that deliberately belong to no restaurant.
 *
 * ---------------------------------------------------------------------------
 * Why `consumers` has no `tenant_id`, and why that is not the same hole
 *
 * A marketplace customer is not a restaurant's customer. They order plov from
 * one place on Tuesday and lavash from another on Friday, and the whole
 * proposition — one account, one basket, one address book, one loyalty balance
 * across the platform — dies the moment the row is stamped with whoever they
 * happened to order from first. `crm.customers` is the other thing: a
 * restaurant's own guest list, tenanted, and it stays that way.
 *
 * So this is a fourth tenant-free table, and it is written down in
 * `ModuleBoundaryTest::TENANT_FREE_TABLES` beside `users` and the framework's
 * own. It does NOT join the row-level-security exemption list, and that
 * distinction matters: `public.users`, `pos.terminals` and `staff.devices` are
 * exempt because they carry `tenant_id` and a policy would break the
 * authentication that has to read them. These three carry no `tenant_id` at
 * all, so no policy is written for them and there is nothing to exempt —
 * `RowLevelSecurityTest` never sees them, which is why that file is untouched.
 *
 * What replaces the policy is the token. A consumer reads their own rows and
 * nothing else, checked in `RequireConsumerToken` and again in every controller
 * that takes an id from a URL. A tenant-free table with no such check would be
 * the whole platform's customer list on an endpoint with no login, which is why
 * this paragraph is here and why a fifth table must earn its own.
 *
 * ---------------------------------------------------------------------------
 * The phone is the identity
 *
 * No password, ever. Somebody ordering dinner at eight will not invent,
 * remember or reset one, and a password on a food account is a password reused
 * from somewhere that matters more. The number is E.164 and unique across the
 * platform: one phone, one account, whichever restaurant it eats at.
 *
 * ---------------------------------------------------------------------------
 * Couriers
 *
 * The marketplace's own riders, not the restaurant's staff — `staff.staff_members`
 * is tenanted and a rider carrying three restaurants' orders in one bag belongs
 * to none of them. Their last known position is stored beside a timestamp so
 * the tracking screen can say "two minutes ago" rather than implying a live
 * feed it does not have; both are nullable, because a rider whose phone died is
 * the ordinary case and the map has to draw something honest.
 */
return new class extends Migration
{
    private const CONSUMERS = 'marketplace.consumers';

    private const ADDRESSES = 'marketplace.consumer_addresses';

    private const COURIERS = 'marketplace.couriers';

    public function up(): void
    {
        Schema::create(self::CONSUMERS, function (Blueprint $table): void {
            $table->id();

            $table->string('phone', 20)->unique()->comment('E.164, normalised on the way in');
            $table->string('name', 120)->nullable();
            $table->string('locale', 5)->default('uz');

            $table->boolean('is_active')->default(true);

            // MyPOS Plus. A date rather than a boolean: "are they subscribed"
            // is a question about now, and a flag makes yesterday's answer
            // permanent. Null means they never were.
            $table->datetime('plus_until')->nullable();

            $table->unsignedBigInteger('points')->default(0)->comment('Loyalty points, whole numbers');

            $table->datetime('last_seen_at')->nullable();

            $table->timestamps();

            // Never hard-deleted: an order six months old still has to name who
            // placed it, and a deleted row would leave a dispute unanswerable.
            $table->softDeletes();
        });

        Schema::create(self::ADDRESSES, function (Blueprint $table): void {
            $table->id();
            $table->foreignId('consumer_id')->constrained('marketplace.consumers')->cascadeOnDelete();

            $table->string('label', 40)->comment("The guest's own word: Uy, Ish, Ota-onam");
            $table->string('address', 255);
            $table->string('note', 255)->nullable()->comment('Doorbell, floor, "call when downstairs"');

            $table->integer('latitude_e6')->nullable();
            $table->integer('longitude_e6')->nullable();

            $table->boolean('is_default')->default(false);
            $table->unsignedSmallInteger('sort_order')->default(0);

            $table->timestamps();

            $table->index(['consumer_id', 'sort_order']);
        });

        Schema::create(self::COURIERS, function (Blueprint $table): void {
            $table->id();

            $table->string('name', 120);
            $table->string('phone', 20)->unique();

            $table->unsignedSmallInteger('rating_tenths')->default(0);
            $table->unsignedInteger('deliveries_count')->default(0);

            $table->boolean('is_active')->default(true);

            $table->integer('last_latitude_e6')->nullable();
            $table->integer('last_longitude_e6')->nullable();
            $table->datetime('located_at')->nullable()->comment('When that position was reported');

            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists(self::COURIERS);
        Schema::dropIfExists(self::ADDRESSES);
        Schema::dropIfExists(self::CONSUMERS);
    }
};
