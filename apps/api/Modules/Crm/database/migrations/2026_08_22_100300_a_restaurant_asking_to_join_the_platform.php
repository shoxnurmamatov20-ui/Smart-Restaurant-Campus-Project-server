<?php

declare(strict_types=1);

use App\Support\Tenancy\RowLevelSecurity;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * The marketing site's contact form, kept.
 *
 * `apps/web/src/app/(marketing)/contact` has been drawing a form that flashes a
 * thank-you and forgets everything typed into it. CLAUDE.md says how a
 * restaurant joins this platform — "restoran `#contact` orqali keladi, tenant'ni
 * operator ochadi" — which makes this form the first step of the only sales
 * funnel there is, and a form nobody receives is a funnel with no top.
 *
 * ---------------------------------------------------------------------------
 * Whose row is it
 *
 * The site it was typed on, which is not the same as the business it is about.
 * A lead is by definition a restaurant with no tenant of its own yet; what the
 * row is scoped to is whoever owns the page — the platform's own marketing site
 * for "we would like to join", a restaurant's site for "can we book the whole
 * room on Friday". Every public endpoint on this platform resolves a tenant
 * before it runs (see `ResolveTenant`), so there is always one, and scoping to
 * it is what keeps one restaurant's enquiries out of another's list.
 *
 * ---------------------------------------------------------------------------
 * One live enquiry per number per day
 *
 * The partial index is the same defence `tables.reservations` uses on the same
 * kind of door: somebody who taps twice because the first tap did not look like
 * it worked gets their own enquiry back, and somebody filling the list with one
 * number has to bring a new number for each row. `business_date` here is the
 * calendar day of `created_at` in the application's own frame — a lead is not a
 * trading-day event and the venue's till day would be the wrong ruler.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('crm.leads', function (Blueprint $table): void {
            $table->id();
            // The site the form was typed on — see the note above.
            $table->foreignId('tenant_id')->nullable()->constrained('public.tenants')->cascadeOnDelete();

            $table->string('name', 120)->comment('The person, not the business');
            $table->string('phone', 24);
            $table->string('email', 160)->nullable();
            $table->string('restaurant', 160)->nullable();
            $table->string('city', 80)->nullable();
            $table->text('message')->nullable();

            $table->string('source', 24)->default('site')->comment('site|telegram|call|referral');
            $table->string('status', 16)->default('new')->comment('new|contacted|qualified|won|lost');
            $table->unsignedBigInteger('assigned_to_user_id')->nullable();
            $table->datetime('contacted_at')->nullable();
            $table->string('note', 500)->nullable()->comment('What the operator wrote after ringing back');

            $table->date('captured_on')->comment('Calendar day of capture — the duplicate window');
            $table->timestamps();
            $table->softDeletes();

            $table->index(['tenant_id', 'status', 'id']);
            $table->index(['tenant_id', 'phone']);
        });

        DB::statement(
            'create unique index leads_one_per_number_per_day'
            .' on crm.leads (tenant_id, phone, captured_on) where deleted_at is null',
        );

        RowLevelSecurity::guard('crm.leads');
    }

    public function down(): void
    {
        Schema::dropIfExists('crm.leads');
    }
};
