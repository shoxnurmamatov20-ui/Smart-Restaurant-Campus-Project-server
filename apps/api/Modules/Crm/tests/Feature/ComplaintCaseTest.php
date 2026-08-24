<?php

declare(strict_types=1);

namespace Modules\Crm\Tests\Feature;

use App\Models\Tenant;
use App\Models\User;
use Database\Seeders\RolesAndPermissionsSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Modules\Crm\Database\Seeders\CrmCaseSeeder;
use Modules\Crm\Models\CaseEvent;
use Modules\Crm\Models\ComplaintCase;
use Modules\Crm\Models\Customer;
use Modules\Crm\Models\Feedback;
use Tests\TestCase;

/**
 * The complaints desk.
 *
 * The four answers are what these tests are mostly about, because until this
 * table existed "refunded half" and "declined" would have landed in the
 * database as the same row — `crm.feedbacks` has a status column and nothing
 * else. Every test below asks the question that row could not answer: what was
 * the guest told, what did it cost, and who decided.
 */
final class ComplaintCaseTest extends TestCase
{
    use RefreshDatabase;

    /** 30 000 so'm — `crm.cases.auto_refund_ceiling_tiyin`. */
    private const CEILING = 3_000_000;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(RolesAndPermissionsSeeder::class);
    }

    private function actingAsOperator(): User
    {
        $user = User::factory()->create();
        $user->assignRole('order-operator');
        $this->actingAs($user);

        return $user;
    }

    private function actingAsManager(): User
    {
        $user = User::factory()->create();
        $user->assignRole('branch-manager');
        $this->actingAs($user);

        return $user;
    }

    // ============ Auth & RBAC ============

    public function test_unauthenticated_user_cannot_read_the_queue(): void
    {
        $this->getJson('/api/v1/crm/cases')->assertStatus(401);
    }

    public function test_a_cook_cannot_read_the_queue(): void
    {
        $user = User::factory()->create();
        $user->assignRole('cook');
        $this->actingAs($user);

        $this->getJson('/api/v1/crm/cases')->assertStatus(403);
    }

    public function test_a_waiter_can_read_a_complaint_but_never_answer_one(): void
    {
        $user = User::factory()->create();
        $user->assignRole('waiter');
        $this->actingAs($user);

        $case = ComplaintCase::factory()->create();

        $this->getJson('/api/v1/crm/cases')->assertOk();
        $this->postJson("/api/v1/crm/cases/{$case->id}/decide", ['outcome' => 'refunded'])
            ->assertStatus(403);
    }

    // ============ Opening one ============

    public function test_opening_a_complaint_numbers_it_and_stamps_a_deadline(): void
    {
        $this->actingAsOperator();

        $response = $this->postJson('/api/v1/crm/cases', [
            'channel' => 'phone',
            'kind' => 'late',
            'guest_name' => 'Nilufar Yusupova',
            'amount_tiyin' => 24_000_00,
            'quote' => 'Bir yarim soat kutdim.',
        ])->assertCreated();

        $response->assertJsonPath('data.status', 'open');
        $this->assertMatchesRegularExpression('/^SH-\d{4}$/', (string) $response->json('data.number'));
        $this->assertNotNull($response->json('data.due_at'));

        // The history opens with the complaint, so nothing about it is ever
        // only a final state.
        $this->assertSame('opened', CaseEvent::query()->value('kind'));
    }

    public function test_numbers_do_not_repeat(): void
    {
        $this->actingAsOperator();

        $first = $this->postJson('/api/v1/crm/cases', ['channel' => 'phone', 'kind' => 'late'])
            ->assertCreated()->json('data.number');
        $second = $this->postJson('/api/v1/crm/cases', ['channel' => 'phone', 'kind' => 'late'])
            ->assertCreated()->json('data.number');

        $this->assertNotSame($first, $second);
    }

    public function test_a_complaint_cannot_be_opened_already_answered(): void
    {
        $this->actingAsOperator();

        $this->postJson('/api/v1/crm/cases', [
            'channel' => 'phone',
            'kind' => 'late',
            'outcome' => 'refunded',
            'status' => 'resolved',
        ])->assertCreated()
            // Both were ignored: the request has no rule for either, so a
            // complaint cannot arrive already settled.
            ->assertJsonPath('data.outcome', null)
            ->assertJsonPath('data.status', 'open');
    }

    public function test_an_unknown_kind_is_refused(): void
    {
        $this->actingAsOperator();

        $this->postJson('/api/v1/crm/cases', ['channel' => 'phone', 'kind' => 'rudeness'])
            ->assertStatus(422)->assertApiValidationErrors('kind');
    }

    // ============ The four answers ============

    public function test_a_small_refund_needs_nobody_and_credits_the_guest(): void
    {
        $this->actingAsOperator();

        $guest = Customer::factory()->create(['credit_limit' => 0]);
        $case = ComplaintCase::factory()->create(['customer_id' => $guest->id]);

        $this->postJson("/api/v1/crm/cases/{$case->id}/decide", ['outcome' => 'refunded'])
            ->assertOk()
            ->assertJsonPath('data.outcome', 'refunded')
            ->assertJsonPath('data.outcome_tiyin', 24_000_00)
            ->assertJsonPath('data.status', 'resolved');

        // The money moved. A negative balance is the platform's word for "the
        // restaurant owes this guest" — not a flag with nothing behind it.
        $this->assertSame(-24_000_00, $guest->refresh()->account_balance);
    }

    public function test_half_is_rounded_the_same_way_the_button_rounds_it(): void
    {
        $this->actingAsOperator();

        $guest = Customer::factory()->create();
        // 47 000 so'm, chosen because half of it is not a round thousand — and
        // because half of it still fits under the ceiling, so this test is
        // about the rounding rather than about the manager.
        $case = ComplaintCase::factory()->create([
            'customer_id' => $guest->id, 'amount_tiyin' => 47_000_00,
        ]);

        // `cases-data.ts`: half, rounded to the nearest thousand so'm.
        // 47 000 / 2 = 23 500 → 24 000.
        $this->postJson("/api/v1/crm/cases/{$case->id}/decide", ['outcome' => 'partly'])
            ->assertOk()
            ->assertJsonPath('data.outcome_tiyin', 24_000_00);
    }

    public function test_points_cost_the_loyalty_budget_rather_than_the_till(): void
    {
        $this->actingAsOperator();

        $guest = Customer::factory()->create(['points' => 100]);
        $case = ComplaintCase::factory()->create(['customer_id' => $guest->id]);

        $this->postJson("/api/v1/crm/cases/{$case->id}/decide", ['outcome' => 'points'])
            ->assertOk()
            ->assertJsonPath('data.outcome', 'points');

        $guest->refresh();

        // 24 000 so'm of apology, in whole so'm — the loyalty balance is not
        // tiyin, and a hundred-fold error here would be a guest handed a
        // hundred times what anybody meant.
        $this->assertSame(100 + 24_000, $guest->points);
        // And nothing left the drawer.
        $this->assertSame(0, $guest->account_balance);
    }

    public function test_declining_costs_nothing_and_still_records_who_said_no(): void
    {
        $operator = $this->actingAsOperator();

        $guest = Customer::factory()->create();
        $case = ComplaintCase::factory()->create(['customer_id' => $guest->id]);

        $this->postJson("/api/v1/crm/cases/{$case->id}/decide", [
            'outcome' => 'declined', 'note' => 'Buyurtma to\'liq yetkazilgan.',
        ])
            ->assertOk()
            ->assertJsonPath('data.outcome_tiyin', 0);

        $this->assertSame(0, $guest->refresh()->account_balance);
        $this->assertSame($operator->id, $case->refresh()->decided_by_user_id);

        // The reason is in the history, which is the only place a fourth
        // complaint from the same guest can be read against.
        $this->assertSame(
            "Buyurtma to'liq yetkazilgan.",
            CaseEvent::query()->where('kind', 'decided')->value('note'),
        );
    }

    public function test_an_expensive_answer_needs_a_manager(): void
    {
        $this->actingAsOperator();

        $guest = Customer::factory()->create();
        $case = ComplaintCase::factory()->expensive()->create(['customer_id' => $guest->id]);

        $this->postJson("/api/v1/crm/cases/{$case->id}/decide", ['outcome' => 'refunded'])
            ->assertApiError('crm.case_needs_manager');

        // Nothing moved, and the complaint is still open for somebody senior.
        $this->assertSame(0, $guest->refresh()->account_balance);
        $this->assertNull($case->refresh()->outcome);
    }

    public function test_a_manager_may_answer_the_expensive_one(): void
    {
        $this->actingAsManager();

        $guest = Customer::factory()->create();
        $case = ComplaintCase::factory()->expensive()->create(['customer_id' => $guest->id]);

        $this->postJson("/api/v1/crm/cases/{$case->id}/decide", ['outcome' => 'refunded'])
            ->assertOk()
            ->assertJsonPath('data.outcome_tiyin', 88_000_00);

        $this->assertSame(-88_000_00, $guest->refresh()->account_balance);
    }

    public function test_a_complaint_can_only_be_answered_once(): void
    {
        $this->actingAsOperator();

        $guest = Customer::factory()->create();
        $case = ComplaintCase::factory()->create(['customer_id' => $guest->id]);

        $this->postJson("/api/v1/crm/cases/{$case->id}/decide", ['outcome' => 'refunded'])->assertOk();

        // The second answer would pay the guest twice.
        $this->postJson("/api/v1/crm/cases/{$case->id}/decide", ['outcome' => 'refunded'])
            ->assertApiError('crm.case_already_decided');

        $this->assertSame(-24_000_00, $guest->refresh()->account_balance);
    }

    public function test_an_anonymous_complaint_can_be_answered_with_no_ledger_to_credit(): void
    {
        $this->actingAsOperator();

        $case = ComplaintCase::factory()->create(['customer_id' => null]);

        // Refusing would leave the complaint open forever; writing a ledger
        // line against nobody would be a number in the books with no owner.
        $this->postJson("/api/v1/crm/cases/{$case->id}/decide", ['outcome' => 'refunded'])
            ->assertOk()
            ->assertJsonPath('data.outcome_tiyin', 24_000_00)
            ->assertJsonPath('data.status', 'resolved');
    }

    public function test_a_negotiated_amount_is_honoured(): void
    {
        $this->actingAsOperator();

        $guest = Customer::factory()->create();
        $case = ComplaintCase::factory()->create(['customer_id' => $guest->id]);

        // A manager settling on 20 000 of a disputed 24 000 is a real
        // conversation and the queue has to be able to record what was agreed.
        $this->postJson("/api/v1/crm/cases/{$case->id}/decide", [
            'outcome' => 'partly', 'amount_tiyin' => 20_000_00,
        ])->assertOk()->assertJsonPath('data.outcome_tiyin', 20_000_00);

        $this->assertSame(-20_000_00, $guest->refresh()->account_balance);
    }

    // ============ Working one ============

    public function test_assigning_and_noting_both_land_in_the_history(): void
    {
        $operator = $this->actingAsOperator();
        $case = ComplaintCase::factory()->create();

        $this->patchJson("/api/v1/crm/cases/{$case->id}", [
            'status' => 'in_progress',
            'assigned_to_user_id' => $operator->id,
            'note' => 'Kuryerga qo\'ng\'iroq qilindi.',
        ])->assertOk()->assertJsonPath('data.status', 'in_progress');

        $kinds = CaseEvent::query()->where('case_id', $case->id)->pluck('kind')->all();

        $this->assertContains('assigned', $kinds);
        $this->assertContains('status', $kinds);
        $this->assertContains('note', $kinds);
    }

    public function test_a_patch_cannot_mark_a_complaint_resolved(): void
    {
        $this->actingAsOperator();
        $case = ComplaintCase::factory()->create();

        // Resolved is what `decide` writes, together with the outcome, the
        // amount and the name of whoever chose.
        $this->patchJson("/api/v1/crm/cases/{$case->id}", ['status' => 'resolved'])
            ->assertStatus(422)->assertApiValidationErrors('status');
    }

    // ============ Lateness ============

    public function test_an_unanswered_complaint_past_its_deadline_is_overdue(): void
    {
        $this->actingAsOperator();

        $late = ComplaintCase::factory()->overdue()->create();
        $answered = ComplaintCase::factory()->overdue()->decided()->create();

        $this->getJson("/api/v1/crm/cases/{$late->id}")
            ->assertOk()->assertJsonPath('data.is_overdue', true);

        // Answered late is not overdue — it is done.
        $this->getJson("/api/v1/crm/cases/{$answered->id}")
            ->assertOk()->assertJsonPath('data.is_overdue', false);
    }

    public function test_the_desk_says_which_answers_need_nobody(): void
    {
        $this->actingAsOperator();

        $small = ComplaintCase::factory()->create(['amount_tiyin' => self::CEILING]);
        $big = ComplaintCase::factory()->create(['amount_tiyin' => self::CEILING + 1]);

        $this->getJson("/api/v1/crm/cases/{$small->id}")
            ->assertOk()->assertJsonPath('data.settles_itself', true);

        $this->getJson("/api/v1/crm/cases/{$big->id}")
            ->assertOk()->assertJsonPath('data.settles_itself', false);
    }

    // ============ From a review ============

    public function test_a_review_becomes_a_complaint_with_the_guests_own_words(): void
    {
        $this->actingAsOperator();

        $guest = Customer::factory()->create();
        $feedback = Feedback::factory()->create([
            'customer_id' => $guest->id,
            'score' => 1,
            'comment' => 'Ovqat sovuq keldi.',
            'source' => 'web',
        ]);

        $this->postJson("/api/v1/crm/feedbacks/{$feedback->id}/case")
            ->assertCreated()
            ->assertJsonPath('data.feedback_id', $feedback->id)
            ->assertJsonPath('data.customer_id', $guest->id)
            // Copied rather than retyped: the wording is evidence.
            ->assertJsonPath('data.quote', 'Ovqat sovuq keldi.')
            ->assertJsonPath('data.channel', 'web');

        // And the review leaves the queue, so two people do not ring one guest.
        $this->assertSame('in_review', $feedback->refresh()->status);
    }

    public function test_pressing_open_a_case_twice_returns_the_one_that_exists(): void
    {
        $this->actingAsOperator();
        $feedback = Feedback::factory()->create();

        $first = $this->postJson("/api/v1/crm/feedbacks/{$feedback->id}/case")->assertCreated();
        $second = $this->postJson("/api/v1/crm/feedbacks/{$feedback->id}/case")->assertOk();

        $this->assertSame($first->json('data.id'), $second->json('data.id'));
        $this->assertSame(1, ComplaintCase::query()->count());
    }

    // ============ The causes panel ============

    public function test_causes_group_by_kind_and_carry_what_each_cost(): void
    {
        $this->actingAsManager();

        ComplaintCase::factory()->count(2)->create(['kind' => 'missing']);
        ComplaintCase::factory()->create(['kind' => 'late'])
            ->forceFill(['outcome' => 'refunded', 'outcome_tiyin' => 24_000_00])->save();

        $response = $this->getJson('/api/v1/crm/cases/causes')->assertOk();

        /** @var list<array{kind: string, count: int, cost_tiyin: int}> $rows */
        $rows = $response->json('data.kinds');

        $kinds = [];

        foreach ($rows as $row) {
            $kinds[$row['kind']] = $row;
        }

        $this->assertSame(2, $kinds['missing']['count']);
        $this->assertSame(24_000_00, $kinds['late']['cost_tiyin']);

        // The month's own figures, in the same answer: the console's KPI strip
        // and its right-hand column are one window over one table, and asking
        // four times would report four slightly different months.
        $response->assertJsonPath('data.total', 3);
        $response->assertJsonPath('data.outcomes.0.outcome', 'refunded');
        $response->assertJsonPath('data.outcomes.0.cost_tiyin', 24_000_00);
    }

    public function test_the_answer_time_is_null_rather_than_zero_when_nothing_was_answered(): void
    {
        $this->actingAsManager();

        ComplaintCase::factory()->create();

        // Zero minutes would read as instant service, which is the opposite of
        // "nobody has answered anything this month".
        $this->getJson('/api/v1/crm/cases/causes')
            ->assertOk()
            ->assertJsonPath('data.answer_minutes', null);
    }

    public function test_seeding_the_desk_twice_writes_the_same_rows_once(): void
    {
        $this->actingAsOperator();

        $this->seed(CrmCaseSeeder::class);
        $this->seed(CrmCaseSeeder::class);

        // Matched on the number a guest is asked to quote, so a reseeded demo
        // has four complaints rather than eight — and each keeps its history
        // rather than gaining a second "opened" line.
        $this->assertSame(4, ComplaintCase::query()->count());
        $this->assertSame(
            1,
            CaseEvent::query()->where('kind', 'opened')
                ->where('case_id', ComplaintCase::query()->where('number', 'SH-2418')->value('id'))
                ->count(),
        );
    }

    // ============ Tenant isolation ============

    public function test_one_restaurant_never_sees_another_restaurants_complaints(): void
    {
        $a = Tenant::query()->create([
            'name' => 'Osh Markazi', 'slug' => 'osh-markazi', 'country_code' => 'UZ',
            'locale' => 'uz', 'timezone' => 'Asia/Tashkent', 'status' => 'active',
        ]);
        Tenant::query()->create([
            'name' => 'City Cafe', 'slug' => 'city-cafe', 'country_code' => 'UZ',
            'locale' => 'uz', 'timezone' => 'Asia/Tashkent', 'status' => 'active',
        ]);

        ComplaintCase::factory()->count(2)->create(['tenant_id' => $a->id]);

        $user = User::factory()->create(['tenant_id' => $a->id]);
        $user->assignRole('owner');
        $this->actingAs($user);

        $this->withHeader('X-Tenant', 'osh-markazi')
            ->getJson('/api/v1/crm/cases')->assertOk()->assertJsonCount(2, 'data');

        // Asking for another restaurant is refused outright: an empty list
        // would read as "no data" and hide the attempt entirely.
        $this->withHeader('X-Tenant', 'city-cafe')
            ->getJson('/api/v1/crm/cases')
            ->assertStatus(403)
            ->assertApiError('tenant.mismatch');
    }
}
