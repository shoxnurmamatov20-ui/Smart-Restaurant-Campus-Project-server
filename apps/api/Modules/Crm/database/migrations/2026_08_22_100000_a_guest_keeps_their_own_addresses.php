<?php

declare(strict_types=1);

use App\Support\Tenancy\RowLevelSecurity;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Where a courier is told to go, and which language to talk to the guest in.
 *
 * Two things the customer app has been drawing from a fixture. `SAVED_ADDRESSES`
 * in `packages/surfaces/src/customer/data.ts` carries the note that says why —
 * "there is no address book in the design: no add, no edit, no map picker" — so
 * the screens were built against two invented rows and an "add an address"
 * control that did nothing.
 *
 * ---------------------------------------------------------------------------
 * The columns nobody draws and every courier needs
 *
 * `entrance`, `floor`, `flat`. A Tashkent address is a district, a block number
 * and then three pieces of information that are not in the street line at all,
 * and a courier who has to ring the guest to ask for them is a courier standing
 * outside a locked door with cooling food. They are separate columns rather than
 * more text because the driver's app puts them on their own line, in a bigger
 * size, and because "3-podyezd" written inside a free-text line is unsearchable
 * and untranslatable.
 *
 * `lat`/`lng` are nullable and stay that way. The design has no map picker, and
 * a guest who typed their address rather than dropping a pin has still given a
 * usable address. Requiring coordinates would mean inventing them.
 *
 * ---------------------------------------------------------------------------
 * `is_default` is a flag, not a sort order
 *
 * One address per guest is the one the app opens on, and the partial unique
 * index below is what makes that true. Enforcing it in PHP alone fails exactly
 * when it matters: two taps on "make this the default" from a phone with one
 * bar, and the app afterwards has two defaults and picks whichever the database
 * returns first — which is to say, a different one on different days.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('crm.customer_addresses', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('tenant_id')->nullable()->constrained('public.tenants')->cascadeOnDelete();
            $table->foreignId('customer_id')->constrained('crm.customers')->cascadeOnDelete();

            /*
             * "Uy", "Ish", "Onamning uyi" — the guest's own word, in the guest's
             * own language, and therefore NOT a `{uz,ru,en}` column. Everything
             * translatable in this platform is content the *restaurant* owns; a
             * label somebody typed for themselves is not translated by anyone.
             */
            $table->string('label', 40);
            $table->string('line', 255)->comment('The street address as the guest wrote it');

            $table->string('entrance', 16)->nullable()->comment('Podyezd — the courier needs it, the map does not have it');
            $table->string('floor', 16)->nullable();
            $table->string('flat', 16)->nullable();
            $table->string('note', 255)->nullable()->comment('Intercom code, "call before arriving", the dog');

            // Nullable on purpose: the design has no map picker, and an address
            // typed by hand is still an address a courier can find.
            $table->decimal('lat', 10, 7)->nullable();
            $table->decimal('lng', 10, 7)->nullable();

            $table->boolean('is_default')->default(false);
            $table->timestamps();
            $table->softDeletes();

            // The app's only query: this guest's addresses, default first.
            $table->index(['tenant_id', 'customer_id']);
        });

        /*
         * One default per guest, enforced by PostgreSQL.
         *
         * Partial twice over: only where the flag is true, so the other
         * addresses do not collide with each other; and only where the row is
         * live, so deleting a default and setting a new one is not refused by
         * a row nobody can see any more.
         */
        DB::statement(
            'create unique index customer_addresses_one_default'
            .' on crm.customer_addresses (tenant_id, customer_id)'
            .' where is_default and deleted_at is null',
        );

        RowLevelSecurity::guard('crm.customer_addresses');

        Schema::table('crm.customers', function (Blueprint $table): void {
            /*
             * Which language to write to this guest in.
             *
             * Nullable, and null means "we have not been told". The API's own
             * chain — `X-Locale`, then the user, then `Accept-Language`, then
             * the restaurant — already answers that for a request, and this
             * column is for the messages that are not requests: the SMS, the
             * push, the "your courier is downstairs". A guest who chose Russian
             * on the profile screen should not get an Uzbek notification because
             * the phone that triggered it was the courier's.
             */
            $table->string('locale', 2)->nullable()->after('name');
        });
    }

    public function down(): void
    {
        Schema::table('crm.customers', function (Blueprint $table): void {
            $table->dropColumn('locale');
        });

        // Dropping the table takes the index and the policy with it.
        Schema::dropIfExists('crm.customer_addresses');
    }
};
