<?php

declare(strict_types=1);

use App\Support\Tenancy\RowLevelSecurity;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * The screen above the counter, as three lists and nothing else.
 *
 * The console has had this screen since the design file was read instead of
 * `specs/01-os.md`, and it has had no tables behind it: its own docblock says
 * "the board's own configuration has no table yet". These are those tables.
 *
 * ---------------------------------------------------------------------------
 * Three lists, because the three tabs are three different things
 *
 * `columns` is which menu sections the wall draws and in what order.
 * `playlist` is the rotation — what is shown, for how long, and between which
 * hours. `banners` is the promo strip along the bottom. One table with a `kind`
 * column would have three quarters of its columns null on every row and no
 * constraint able to say which quarter.
 *
 * ---------------------------------------------------------------------------
 * What is deliberately NOT here: prices, and what is sold out
 *
 * A column names a `menu_category_id` and stops. The dishes under it, what they
 * cost and whether the kitchen has run out are read from Menu at render time
 * through `MenuCatalog::board()` and `StopList::stoppedItemIds()`.
 *
 * That is the one behaviour the screen exists to protect. A board with its own
 * copy of the price is a board that advertises last week's price the day after
 * a rise, and a board with its own sold-out flag is a board somebody has to
 * remember to edit when the beef runs out — which is a board that sells what
 * the kitchen cannot cook. The 86 sheet in the kitchen is the single place that
 * happens and this follows it.
 *
 * There is no foreign key on `menu_category_id` for the same reason
 * `crm.promo_redemptions.order_id` has none: Menu lives in another schema, and
 * a constraint across it would be a module boundary written in DDL — one that
 * `ModuleBoundaryTest` could not see and nobody could drop a module without.
 *
 * ---------------------------------------------------------------------------
 * Per branch, always
 *
 * One restaurant's Chilonzor counter and its Termiz counter do not show the
 * same board: different screens, different sizes, different sections, and a
 * breakfast window that starts an hour apart. `tenant_id` alone would give a
 * chain one wall for fifty rooms.
 *
 * ---------------------------------------------------------------------------
 * `published_at`, and why a board needs one at all
 *
 * Every row here is editable and every edit is live the moment it is saved —
 * which for a wall screen means a manager mid-reorder is on the wall, half
 * done, in front of the queue. So the rows carry the same `published_at` the
 * rota carries: `POST board/push` stamps them, and `updated_at > published_at`
 * is the console's answer to "is the wall behind what I am looking at".
 *
 * It is a stamp rather than a snapshot on purpose. A snapshot would be a fourth
 * table holding a frozen copy of the other three, and the screen it feeds
 * already re-reads prices from Menu every render — so the copy would be stale
 * in the one dimension that matters while claiming to be exact.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('board.columns', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('tenant_id')->nullable()->constrained('public.tenants')->cascadeOnDelete();
            $table->foreignId('branch_id')->nullable()->constrained('public.branches')->cascadeOnDelete();

            // Menu's category id, unconstrained — see the note above.
            $table->unsignedBigInteger('menu_category_id')
                ->comment('menu.menu_categories.id — no FK, Menu is another module');

            /*
             * The heading colour, as a literal hex.
             *
             * Not a design token, and deliberately: these are the board's own
             * palette, mixed for a backlit screen several metres away. Reusing
             * `--brand-500` here would put a colour chosen for a 14px label on a
             * 40px heading at four metres. `board-data.ts` says the same thing
             * from the other side.
             */
            $table->string('accent', 9)->default('#7FB0FF')->comment('#RRGGBB for the board, not a console token');

            $table->unsignedSmallInteger('position')->default(0);
            $table->boolean('is_visible')->default(true);
            $table->datetime('published_at')->nullable()->comment('When this last reached the screens');
            $table->timestamps();

            // A section is drawn once per wall. Two rows for one category is two
            // headings with the same dishes under both, which reads as a bug in
            // the menu rather than a bug in the board.
            $table->unique(['tenant_id', 'branch_id', 'menu_category_id'], 'board_columns_one_per_section');

            // The read the wall does: this venue's columns, in order.
            $table->index(['tenant_id', 'branch_id', 'position']);
        });

        Schema::create('board.playlist', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('tenant_id')->nullable()->constrained('public.tenants')->cascadeOnDelete();
            $table->foreignId('branch_id')->nullable()->constrained('public.branches')->cascadeOnDelete();

            $table->string('slug', 48)->comment('Stable key: main, today, combo, breakfast');
            $table->jsonb('name')->comment('{uz,ru,en} — what the manager calls this screen');

            /*
             * How long this screen holds, or the hours it replaces the rotation
             * for. Exactly one of the two, enforced below.
             *
             * A scheduled screen takes NO turn: the breakfast menu does not get
             * twelve seconds every rotation between eight and eleven, it *is*
             * the board for those three hours and then stops existing. Storing a
             * duration for it would make `rotationSeconds()` count a screen that
             * never comes round, and the console's "one full turn" figure — the
             * number a manager sets the others by — would be wrong all day.
             */
            $table->unsignedSmallInteger('seconds')->nullable()->comment('Rotating screens only; null when scheduled');
            $table->time('window_start')->nullable()->comment('Scheduled screens only');
            $table->time('window_end')->nullable();

            $table->boolean('is_active')->default(true);
            $table->unsignedSmallInteger('position')->default(0);
            $table->datetime('published_at')->nullable();
            $table->timestamps();

            $table->unique(['tenant_id', 'branch_id', 'slug'], 'board_playlist_one_per_key');
            $table->index(['tenant_id', 'branch_id', 'position']);
        });

        /*
         * Rotating or scheduled, never both and never neither.
         *
         * In the database rather than only in the FormRequest because a row that
         * is both is unrenderable: the console asks "seconds, or a window?" and a
         * row answering yes to both makes the screen pick one silently. A seeder,
         * a console command or a future importer does not go through a
         * FormRequest, and this is the one invariant the whole tab rests on.
         */
        DB::statement(
            'alter table board.playlist add constraint board_playlist_rotates_or_is_scheduled check ('
            .' (seconds is not null and window_start is null and window_end is null)'
            .' or (seconds is null and window_start is not null and window_end is not null)'
            .')',
        );

        Schema::create('board.banners', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('tenant_id')->nullable()->constrained('public.tenants')->cascadeOnDelete();
            $table->foreignId('branch_id')->nullable()->constrained('public.branches')->cascadeOnDelete();

            $table->string('slug', 48);
            $table->jsonb('text')->comment('{uz,ru,en} — read by a guest, so all three');

            // offer | new | loyalty. A short list the console draws a coloured
            // chip from, not free text: a fourth word would render as an unstyled
            // pill nobody chose the colour of.
            $table->string('kind', 16)->default('offer')->comment('offer|new|loyalty');

            $table->datetime('starts_at')->nullable()->comment('null = it has always been running');
            $table->datetime('ends_at')->nullable()->comment('null = until somebody turns it off');

            /*
             * On the wall, or written and waiting.
             *
             * Separate from the window because they answer different questions: a
             * banner outside its dates is finished, a banner with `is_live` false
             * is a draft somebody is still wording. Collapsing them would mean
             * un-publishing a banner by editing its end date, and the edit that
             * takes it down would be indistinguishable from the campaign ending.
             */
            $table->boolean('is_live')->default(false);

            $table->datetime('published_at')->nullable();
            $table->timestamps();

            $table->unique(['tenant_id', 'branch_id', 'slug'], 'board_banners_one_per_key');
            $table->index(['tenant_id', 'branch_id', 'is_live']);
        });

        RowLevelSecurity::guard('board.columns', 'board.playlist', 'board.banners');
    }

    public function down(): void
    {
        RowLevelSecurity::release('board.banners', 'board.playlist', 'board.columns');

        Schema::dropIfExists('board.banners');
        Schema::dropIfExists('board.playlist');
        Schema::dropIfExists('board.columns');
    }
};
