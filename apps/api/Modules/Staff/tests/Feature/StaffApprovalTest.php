<?php

declare(strict_types=1);

namespace Modules\Staff\Tests\Feature;

use App\Contracts\Pos\Approvals;
use App\Models\Branch;
use App\Models\Tenant;
use App\Models\User;
use App\Support\Tenancy\BranchContext;
use App\Support\Tenancy\TenantContext;
use Database\Seeders\RolesAndPermissionsSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Testing\TestResponse;
use Tests\TestCase;

/**
 * Asking for a manager, and answering, from a phone.
 *
 * P9 moved ANSWERING an approval off the till and said why: *"a manager is not
 * at the till — they are in the office, in the car park, or at the other
 * branch … in practice the manager's PIN gets told to the cashier, and the
 * approval table then records a lie for the rest of the year."*
 *
 * Asking stayed behind. `POST /pos/approvals` sits inside `pos.session`, so the
 * only thing that could raise a request was a tablet with a PIN session open —
 * and the person who most often needs one is a waiter standing at a table with
 * a handset. They had to walk to a till to ask, which is the same walk in the
 * same direction for the same reason.
 *
 * Everything here goes through `App\Contracts\Pos\Approvals`, because Staff may
 * not import Pos.
 */
final class StaffApprovalTest extends TestCase
{
    use RefreshDatabase;

    private Tenant $tenant;

    private Branch $branch;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(RolesAndPermissionsSeeder::class);

        $this->tenant = Tenant::query()->create([
            'name' => 'Osh Xona', 'slug' => 'osh-xona', 'country_code' => 'UZ',
            'locale' => 'uz', 'timezone' => 'Asia/Tashkent', 'status' => 'active',
        ]);
        app(TenantContext::class)->set($this->tenant);

        $this->branch = Branch::factory()->create(['tenant_id' => $this->tenant->id]);
    }

    protected function tearDown(): void
    {
        app(BranchContext::class)->clear();
        app(TenantContext::class)->clear();
        parent::tearDown();
    }

    private function signIn(string $role): User
    {
        $user = User::factory()->create(['tenant_id' => $this->tenant->id]);
        $user->assignRole($role);
        $this->actingAs($user);

        return $user;
    }

    /**
     * @param  array<string, mixed>  $over
     */
    private function ask(array $over = []): TestResponse
    {
        return $this->postJson('/api/v1/staff/approvals', [
            'action' => 'comp',
            'reason' => 'Kechikkani uchun shirinlik',
            'subject_type' => 'bill',
            'subject_id' => 41,
            'amount' => 45_000_00,
            ...$over,
        ]);
    }

    // ============ Asking ============

    public function test_a_waiter_with_a_handset_can_ask_for_a_manager(): void
    {
        $waiter = $this->signIn('waiter');

        $raised = $this->ask()->assertCreated();

        $this->assertSame('comp', $raised->json('data.action'));
        $this->assertSame(45_000_00, $raised->json('data.amount'));
        $this->assertSame('pending', $raised->json('data.status'));
        $this->assertSame($waiter->getKey(), $raised->json('data.requested_by.id'));
        // Nobody was at a till, and the record says so rather than inventing
        // one. See the migration that made `terminal_id` nullable.
        $this->assertNull($raised->json('data.terminal_id'));
    }

    public function test_asking_four_times_is_one_question_asked_louder(): void
    {
        $this->signIn('waiter');

        $first = $this->ask()->assertCreated()->json('data.id');
        $second = $this->ask()->assertCreated()->json('data.id');

        // A waiter who taps again because nobody came has not asked twice, and
        // four rows would buzz a manager's phone four times for one dessert.
        $this->assertSame($first, $second);
    }

    public function test_a_verb_the_ledger_has_never_heard_of_is_refused(): void
    {
        $this->signIn('waiter');

        $this->ask(['action' => 'open_the_safe'])->assertApiError('pos.approval_invalid');
    }

    public function test_a_reason_is_required_because_a_blank_one_is_useless(): void
    {
        $this->signIn('waiter');

        $this->ask(['reason' => ''])->assertStatus(422);
    }

    // ============ The queue ============

    public function test_the_queue_lists_what_is_waiting_oldest_first(): void
    {
        $this->signIn('waiter');
        $this->ask(['subject_id' => 41])->assertCreated();

        $this->signIn('cashier');
        $this->ask(['subject_id' => 42, 'action' => 'discount', 'amount' => 10_000_00])->assertCreated();

        $this->signIn('branch-manager');

        $queue = $this->getJson('/api/v1/staff/approvals')->assertOk()->json('data');

        $this->assertCount(2, $queue);
        $this->assertSame(41, $queue[0]['subject_id']);
    }

    public function test_a_waiter_may_read_the_queue_but_not_answer_it(): void
    {
        $this->signIn('waiter');
        $id = (int) $this->ask()->assertCreated()->json('data.id');

        // Reading is `pos.view` — a waiter holds it and wants to know whether
        // anybody has answered. Deciding is `pos.approve`, which is the whole
        // point of the ledger.
        $this->getJson('/api/v1/staff/approvals')->assertOk();
        $this->postJson("/api/v1/staff/approvals/{$id}/decide", ['approved' => true])->assertForbidden();
    }

    // ============ Answering ============

    public function test_a_manager_answers_from_wherever_they_are(): void
    {
        $this->signIn('waiter');
        $id = (int) $this->ask()->assertCreated()->json('data.id');

        $manager = $this->signIn('branch-manager');

        $answer = $this->postJson("/api/v1/staff/approvals/{$id}/decide", ['approved' => true])->assertOk();

        $this->assertSame('approved', $answer->json('data.status'));

        // And the queue empties.
        $this->assertCount(0, $this->getJson('/api/v1/staff/approvals')->assertOk()->json('data'));
        $this->assertNotNull($manager->getKey());
    }

    public function test_a_refusal_travels_as_well_as_an_agreement(): void
    {
        $this->signIn('waiter');
        $id = (int) $this->ask()->assertCreated()->json('data.id');

        $this->signIn('branch-manager');

        // The handset that raised this is in front of a guest and cannot tell
        // "the manager said no" from "nothing has arrived yet". Those are
        // opposite instructions to give a waiter.
        $this->postJson("/api/v1/staff/approvals/{$id}/decide", ['approved' => false])
            ->assertOk()
            ->assertJsonPath('data.status', 'rejected');
    }

    public function test_nobody_signs_their_own_request(): void
    {
        // A manager who raises a request may not answer it, and that single rule
        // is what makes the whole table worth keeping.
        $manager = $this->signIn('branch-manager');

        $id = (int) app(Approvals::class)->ask(
            requestedByUserId: (int) $manager->getKey(),
            action: 'comp',
            reason: 'Ozimning so\'rovim',
            subjectType: 'bill',
            subjectId: 7,
            amountTiyin: 10_000_00,
            branchId: $this->branch->id,
        )->id;

        $this->postJson("/api/v1/staff/approvals/{$id}/decide", ['approved' => true])
            ->assertApiError('pos.approval_closed');
    }

    public function test_a_question_can_only_be_answered_once(): void
    {
        $this->signIn('waiter');
        $id = (int) $this->ask()->assertCreated()->json('data.id');

        $this->signIn('branch-manager');
        $this->postJson("/api/v1/staff/approvals/{$id}/decide", ['approved' => true])->assertOk();
        $this->postJson("/api/v1/staff/approvals/{$id}/decide", ['approved' => false])
            ->assertApiError('pos.approval_closed');
    }

    // ============ Tenancy ============

    public function test_another_restaurants_queue_is_invisible(): void
    {
        $this->signIn('waiter');
        $this->ask()->assertCreated();

        $other = Tenant::query()->create([
            'name' => 'Lagmon', 'slug' => 'lagmon-uyi', 'country_code' => 'UZ',
            'locale' => 'uz', 'timezone' => 'Asia/Tashkent', 'status' => 'active',
        ]);
        $stranger = User::factory()->create(['tenant_id' => $other->id]);
        $stranger->assignRole('branch-manager');

        app(TenantContext::class)->set($other);
        $this->actingAs($stranger);

        $this->getJson('/api/v1/staff/approvals')->assertOk()->assertJsonCount(0, 'data');
    }
}
