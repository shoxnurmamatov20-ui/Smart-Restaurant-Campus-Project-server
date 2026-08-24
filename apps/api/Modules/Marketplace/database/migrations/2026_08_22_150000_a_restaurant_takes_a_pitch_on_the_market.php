<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * A restaurant's shop window on MyPOS, and the dishes it puts in it.
 *
 * The marketplace stands ABOVE tenancy — one consumer orders from eight
 * restaurants in a month — and these two tables are where the two worlds meet.
 * A storefront belongs to exactly one restaurant, so it carries `tenant_id` and
 * the same row-level-security policy as everything else: a merchant reads their
 * own pitch and nobody else's. The consumer side reads the directory across
 * every restaurant, and it has to say so out loud — see `StorefrontDirectory`,
 * which is the ONLY place `withoutTenancy()` is used in this module.
 *
 * ---------------------------------------------------------------------------
 * Why the slug is unique across the whole platform
 *
 * It is a public URL — `mypos.uz/mp/store/osh-xona` — and a public URL cannot be
 * ambiguous. Every other unique key in this codebase is scoped per tenant for
 * good reason (two restaurants may both sell `OSH-001`), and this one must not
 * be: two storefronts sharing a slug is a link that lands on whichever row the
 * planner happened to pick.
 *
 * ---------------------------------------------------------------------------
 * Why there is no `distance_km` column
 *
 * The design's card prints one, and it is not a property of the shop: it is the
 * distance between the shop and whoever is looking. Storing it would freeze one
 * guest's answer and show it to everybody. The coordinates are stored instead —
 * as integer microdegrees, because this platform does not keep floats where an
 * integer will do — and `GET /mp/stores?near=` computes the distance per
 * request, answering `null` when nobody said where they are.
 *
 * ---------------------------------------------------------------------------
 * `store_items` — what is actually on sale here
 *
 * A restaurant does not put its whole menu on a marketplace. Portions that
 * travel badly stay behind, and the ones that go are usually dearer: a
 * marketplace order carries packaging, a courier and a 9% commission the
 * dining room does not.
 *
 * So the market price is a MARKUP over the catalogue price, not a second price
 * typed in beside it. A markup keeps tracking: a restaurant that raises plov by
 * two thousand in the dining room raises it by two thousand here, which is what
 * they meant, and never wakes up selling below cost because they edited one
 * screen and forgot the other.
 *
 * `menu_item_id` carries no foreign key on purpose — the same decision
 * `finance.payment_invoices` made about `order_id`. A constraint across a
 * module boundary is the boundary being crossed in the one place the
 * architecture tests cannot see, and it would make Menu impossible to move.
 */
return new class extends Migration
{
    private const STORES = 'marketplace.stores';

    private const ITEMS = 'marketplace.store_items';

    private const RULE = "current_setting('app.bypass_tenancy', true) = 'on'"
        ." or tenant_id = nullif(current_setting('app.tenant_id', true), '')::bigint";

    public function up(): void
    {
        Schema::create(self::STORES, function (Blueprint $table): void {
            $table->id();
            $table->foreignId('tenant_id')->nullable()->constrained('public.tenants')->cascadeOnDelete();

            // Which venue cooks it. A chain trades one storefront per address,
            // because the delivery window and the kitchen are the address's.
            $table->foreignId('branch_id')->nullable()->constrained('public.branches')->nullOnDelete();

            $table->string('slug', 80)->unique()->comment('Public URL segment — unique across the platform');

            // One trading name in every language: a restaurant is called what
            // it is called. The subtitle under it IS translated, because
            // "Milliy taomlar · osh markazi" is a description, not a name.
            $table->string('name', 120);
            $table->jsonb('kind')->nullable()->comment('{uz,ru,en} — the card subtitle');

            $table->string('cuisine', 24)->comment('CUISINES key: osh | lavash | burger | …');
            $table->string('vertical', 24)->default('food')->comment('VERTICALS key: food | grocery | …');

            /*
             * Tenths of a star, not a float and not a decimal.
             *
             * 4.9 has no exact binary representation, and a rating that arrives
             * as 4.8999999 sorts below one that arrives as 4.9 — on the screen
             * whose entire job is ordering restaurants by how good they are.
             */
            $table->unsignedSmallInteger('rating_tenths')->default(0);
            $table->unsignedInteger('reviews_count')->default(0);

            $table->unsignedBigInteger('delivery_fee_tiyin')->default(0);
            $table->unsignedBigInteger('min_order_tiyin')->default(0);

            $table->unsignedSmallInteger('minutes_from')->default(20);
            $table->unsignedSmallInteger('minutes_to')->default(40);

            /*
             * What the marketplace keeps, snapshotted per storefront.
             *
             * Nine is the platform's own sales pitch — "Komissiya 9%, 27% emas"
             * — and it is a default here rather than a constant because the
             * whole point of the pitch is that it can be negotiated down for a
             * chain worth having. An order snapshots this again, so changing it
             * never rewrites what a merchant was already owed.
             */
            $table->unsignedTinyInteger('commission_percent')->default(9);

            $table->string('status', 16)->default('pending_review')
                ->comment('live | paused | pending_review');

            // Whether the kitchen is taking orders right now. Separate from
            // `status`: paused is the platform's word, closed is the shop's.
            $table->boolean('is_open')->default(true);

            $table->string('logo_url', 500)->nullable();
            $table->string('cover_url', 500)->nullable();
            $table->string('initials', 4)->nullable()->comment('For the rows with no room for a picture');
            $table->string('tint', 9)->nullable()->comment('Flat colour standing in for the photograph');

            $table->jsonb('offer')->nullable()->comment('{uz,ru,en} — the badge on the card');
            $table->string('offer_tone', 12)->nullable()->comment('brand | warning | danger');

            // Microdegrees: 41.311081 → 41311081. See the docblock.
            $table->integer('latitude_e6')->nullable();
            $table->integer('longitude_e6')->nullable();

            $table->timestamps();
            $table->softDeletes();

            $table->index(['tenant_id', 'status']);
            $table->index(['status', 'vertical', 'cuisine'], 'marketplace_stores_directory_index');
        });

        Schema::create(self::ITEMS, function (Blueprint $table): void {
            $table->id();
            $table->foreignId('tenant_id')->nullable()->constrained('public.tenants')->cascadeOnDelete();
            $table->foreignId('store_id')->constrained('marketplace.stores')->cascadeOnDelete();

            // Menu module id. No foreign key — see the docblock.
            $table->unsignedBigInteger('menu_item_id');

            /*
             * Signed, because a marketplace price is not always higher.
             *
             * A restaurant running an introductory offer sells cheaper here than
             * in the room, and an unsigned column would make them express that
             * as a promotion they did not want to run.
             */
            $table->bigInteger('markup_tiyin')->default(0)
                ->comment('Added to the catalogue price. Tiyin, may be negative.');

            $table->boolean('is_listed')->default(true);
            $table->unsignedSmallInteger('sort_order')->default(0);

            $table->timestamps();

            // One row per dish per storefront. Scoped by tenant as well, so the
            // index stays useful under the policy rather than fighting it.
            $table->unique(['tenant_id', 'store_id', 'menu_item_id'], 'marketplace_store_items_dish_unique');
            $table->index(['tenant_id', 'store_id', 'is_listed']);
        });

        foreach ([self::STORES, self::ITEMS] as $table) {
            $this->guard($table);
        }
    }

    public function down(): void
    {
        foreach ([self::ITEMS, self::STORES] as $table) {
            DB::statement("drop policy if exists tenant_isolation on {$table}");
            Schema::dropIfExists($table);
        }
    }

    /**
     * The same four statements the blanket migration ran in August.
     *
     * It will not run again, so every table created afterwards arms itself.
     * `RowLevelSecurityTest` fails on any table carrying `tenant_id` without
     * both ENABLE and FORCE — the application connects as the table owner, and
     * an owner walks past an ENABLE'd policy without noticing.
     */
    private function guard(string $table): void
    {
        DB::statement("alter table {$table} enable row level security");
        DB::statement("alter table {$table} force row level security");
        DB::statement("drop policy if exists tenant_isolation on {$table}");
        DB::statement(
            "create policy tenant_isolation on {$table} for all"
            .' using ('.self::RULE.') with check ('.self::RULE.')',
        );
    }
};
