<?php

declare(strict_types=1);

use App\Support\Tenancy\RowLevelSecurity;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * The complaints desk. The nearest existing table was `crm.feedbacks`, and
 * `case-actions.tsx` spelled out exactly why it could not be made to do.
 *
 * A review is a score, a comment, an aspect and an urgency flag, and its only
 * write is `POST crm/feedbacks/{feedback}/resolve`, which takes no body at all.
 * A complaint carries five things a review does not — the channel it arrived
 * on, the order it disputes, the amount in dispute, which of the four answers
 * was given, and who gave it — so "refunded half" and "declined" would have
 * landed in the database as the same row.
 *
 * ---------------------------------------------------------------------------
 * The four answers are stored as one column plus an amount
 *
 * `outcome` is `refunded|partly|points|declined` and `outcome_tiyin` is what it
 * cost. Two columns rather than four booleans because the answers are mutually
 * exclusive by definition and because the amount is the thing a report is run
 * on: "what did complaints cost us in August" is a sum, and it has to include a
 * half refund at its actual size rather than at the disputed amount.
 *
 * `points` costs the loyalty budget and not the till, which is why it is a
 * separate outcome rather than a small refund — and why the money side of it
 * goes through `Customer::adjustPoints()` rather than through Finance.
 *
 * ---------------------------------------------------------------------------
 * `crm.case_events` is the history, and it is append-only
 *
 * Every screen this platform has that decides money keeps its working: the till
 * has `pos.approvals`, the tab has `crm.account_entries`. A complaints queue
 * without one answers "we refunded 88 000" and never "who decided, when, and
 * what did they say about it" — which is the only question asked when the same
 * guest complains for the fourth time.
 *
 * The rows are never updated and never deleted. A history that can be edited is
 * not a history.
 *
 * ---------------------------------------------------------------------------
 * `due_at` rather than an SLA column
 *
 * The service level is a duration in `config/crm.php`; what a row needs is the
 * moment it is late, stamped when the case opens. A duration stored per row
 * would be right until somebody changed the policy, at which point every open
 * case would keep the old one silently; a duration computed on read would move
 * every existing case's deadline the moment the policy changed, which is worse.
 * The deadline belongs to the case, the policy belongs to the restaurant.
 *
 * ---------------------------------------------------------------------------
 * `feedback_id` is the seam the console asked for
 *
 * The review queue on the CRM screen gets an "open a case" button, and a case
 * opened from a review points back at it. Nullable, because most complaints
 * arrive by telephone and never were a review — and unique, because pressing
 * the button twice must not open two desks on one guest.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('crm.cases', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('tenant_id')->nullable()->constrained('public.tenants')->cascadeOnDelete();

            /*
             * A complaint happens at a venue: the courier who was late works out
             * of one kitchen, and the packer who missed a tea stands in one. The
             * causes panel is per branch for the same reason — "which of our
             * four branches is losing the teas" is the question it answers.
             */
            $table->foreignId('branch_id')->nullable()->constrained('public.branches')->cascadeOnDelete();

            $table->string('number', 24)->comment('SH-2418 — what the guest is told to quote');

            $table->string('channel', 24)->comment('phone|web|bot|table|aggregator|courier');
            $table->string('kind', 16)->comment('late|missing|wrong|quality|courier');

            $table->foreignId('customer_id')->nullable()->constrained('crm.customers')->nullOnDelete();
            $table->string('guest_name', 160)->nullable()->comment('An anonymous complaint is still a complaint');
            $table->string('guest_phone', 32)->nullable();

            /*
             * The bill in dispute, with no foreign key — Orders lives in another
             * schema and a constraint across it would be a module boundary
             * written in DDL. `order_number` is kept beside the id because it is
             * what the guest can read off their own receipt.
             */
            $table->unsignedBigInteger('order_id')->nullable();
            $table->string('order_number', 32)->nullable();

            $table->bigInteger('amount_tiyin')->default(0)->comment('In dispute, not the order total');
            $table->string('amount_note', 160)->nullable()->comment('What the amount covers: "3 x green tea"');

            $table->text('quote')->nullable()->comment("The guest's own words. Never paraphrased — the wording is evidence.");
            $table->jsonb('photos')->nullable()->comment('Media ids; the count is what the card draws');

            $table->string('status', 16)->default('open')->comment('open|in_progress|resolved|closed');
            $table->foreignId('assigned_to_user_id')->nullable()->constrained('public.users')->nullOnDelete();
            $table->datetime('due_at')->nullable()->comment('When this one is late, stamped at open time');

            $table->string('outcome', 16)->nullable()->comment('refunded|partly|points|declined');
            $table->bigInteger('outcome_tiyin')->default(0)->comment('What the answer actually cost, tiyin');
            $table->foreignId('decided_by_user_id')->nullable()->constrained('public.users')->nullOnDelete();
            $table->datetime('decided_at')->nullable();

            $table->foreignId('feedback_id')->nullable()->constrained('crm.feedbacks')->nullOnDelete();

            $table->timestamps();
            $table->softDeletes();

            // The working queue: what is still open at this venue, oldest first.
            $table->index(['tenant_id', 'branch_id', 'status', 'created_at']);
            // The causes panel: which kind, over a window.
            $table->index(['tenant_id', 'kind', 'created_at']);
        });

        DB::statement(
            'create unique index cases_number_per_restaurant'
            .' on crm.cases (tenant_id, number) where deleted_at is null',
        );

        /*
         * One desk per review. Pressing "open a case" twice on the same
         * one-star must not produce two rows for two people to answer
         * separately — which is how a guest gets refunded twice, or told two
         * different things.
         */
        DB::statement(
            'create unique index cases_one_per_review'
            .' on crm.cases (tenant_id, feedback_id)'
            .' where feedback_id is not null and deleted_at is null',
        );

        Schema::create('crm.case_events', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('tenant_id')->nullable()->constrained('public.tenants')->cascadeOnDelete();
            $table->foreignId('case_id')->constrained('crm.cases')->cascadeOnDelete();
            $table->foreignId('user_id')->nullable()->constrained('public.users')->nullOnDelete();

            $table->string('kind', 16)->comment('opened|assigned|note|status|decided');
            $table->string('from_value', 32)->nullable();
            $table->string('to_value', 32)->nullable();
            $table->text('note')->nullable();

            /*
             * `created_at` only. There is no `updated_at` because there is no
             * update: a history row that can be edited is not a history.
             */
            $table->timestamp('created_at')->nullable();

            $table->index(['tenant_id', 'case_id', 'id']);
        });

        RowLevelSecurity::guard('crm.cases', 'crm.case_events');
    }

    public function down(): void
    {
        Schema::dropIfExists('crm.case_events');
        Schema::dropIfExists('crm.cases');
    }
};
