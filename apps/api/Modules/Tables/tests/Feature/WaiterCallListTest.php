<?php

declare(strict_types=1);

namespace Modules\Tables\Tests\Feature;

use App\Models\Branch;
use App\Models\Tenant;
use App\Models\User;
use App\Support\Tenancy\BranchContext;
use App\Support\Tenancy\TenantContext;
use Database\Seeders\RolesAndPermissionsSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Modules\Tables\Models\RestaurantTable;
use Modules\Tables\Models\WaiterCall;
use Tests\TestCase;

/**
 * Which tables have their hand up.
 *
 * `tables.waiter_calls` has been written to since the QR screen's two buttons
 * became real, and nothing could read it back. That is worse than a button
 * doing nothing: the guest has been told somebody is coming.
 */
final class WaiterCallListTest extends TestCase
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

    private function raise(string $kind = 'waiter', string $status = 'open', int $minutesAgo = 3): WaiterCall
    {
        app(TenantContext::class)->set($this->tenant);

        $table = RestaurantTable::factory()->create([
            'tenant_id' => $this->tenant->id,
            'branch_id' => $this->branch->id,
        ]);

        $call = WaiterCall::create([
            'tenant_id' => $this->tenant->id,
            'branch_id' => $this->branch->id,
            'restaurant_table_id' => $table->getKey(),
            'kind' => $kind,
            'status' => $status,
        ]);

        // Backdated by hand: `created_at` is what "waiting_minutes" is measured
        // from, and a row created this instant would assert nothing.
        $call->forceFill(['created_at' => now()->subMinutes($minutesAgo)])->save();

        return $call->refresh();
    }

    public function test_the_floor_sees_what_is_still_open_oldest_first(): void
    {
        $first = $this->raise('waiter', 'open', 9);
        $this->raise('bill', 'open', 2);
        $this->raise('waiter', 'done', 40);

        $this->signIn('waiter');

        $calls = $this->getJson('/api/v1/tables/calls')->assertOk()->json('data');

        // The answered one is off the list, and the table that has been waiting
        // longest is at the top — any other sort teaches a waiter to serve
        // whoever asked most recently.
        $this->assertCount(2, $calls);
        $this->assertSame($first->getKey(), $calls[0]['id']);
        $this->assertSame(9, $calls[0]['waiting_minutes']);
    }

    public function test_the_history_is_available_to_somebody_who_asks_for_it(): void
    {
        $this->raise('waiter', 'open');
        $this->raise('waiter', 'done');

        $this->signIn('branch-manager');

        // "How long did tables wait last night" is a real question, and the
        // default is the floor screen's list rather than a month of answered
        // calls.
        $this->assertCount(2, $this->getJson('/api/v1/tables/calls?open=0')->assertOk()->json('data'));
    }

    public function test_answering_a_call_stamps_who_and_when(): void
    {
        $call = $this->raise();
        $waiter = $this->signIn('waiter');

        $this->postJson("/api/v1/tables/calls/{$call->getKey()}/resolve", ['status' => 'acknowledged'])
            ->assertOk()
            ->assertJsonPath('data.status', 'acknowledged');

        $call->refresh();
        $this->assertSame($waiter->getKey(), (int) $call->acknowledged_by_user_id);
        $this->assertNotNull($call->acknowledged_at);
        $this->assertNull($call->closed_at);

        $acknowledgedAt = $call->acknowledged_at;

        $this->postJson("/api/v1/tables/calls/{$call->getKey()}/resolve", ['status' => 'done'])->assertOk();

        $call->refresh();
        // Stamped once: a call acknowledged at 19:02 and closed at 19:06 has two
        // facts on it, and overwriting the first would lose the only measure of
        // how fast somebody answered.
        $this->assertSame($acknowledgedAt->toIso8601String(), $call->acknowledged_at->toIso8601String());
        $this->assertNotNull($call->closed_at);
    }

    public function test_a_closed_call_cannot_be_answered_again(): void
    {
        $call = $this->raise('waiter', 'done');
        $this->signIn('waiter');

        $this->postJson("/api/v1/tables/calls/{$call->getKey()}/resolve", ['status' => 'done'])
            ->assertApiError('tables.call_closed');
    }

    public function test_the_bookkeeper_has_no_business_on_the_floor(): void
    {
        $this->raise();
        $this->signIn('accountant');

        $this->getJson('/api/v1/tables/calls')->assertForbidden();
    }

    public function test_another_restaurants_raised_hands_are_invisible(): void
    {
        $this->raise();

        $other = Tenant::query()->create([
            'name' => 'Lagmon', 'slug' => 'lagmon-uyi', 'country_code' => 'UZ',
            'locale' => 'uz', 'timezone' => 'Asia/Tashkent', 'status' => 'active',
        ]);
        $stranger = User::factory()->create(['tenant_id' => $other->id]);
        $stranger->assignRole('waiter');

        app(TenantContext::class)->set($other);
        $this->actingAs($stranger);

        $this->getJson('/api/v1/tables/calls')->assertOk()->assertJsonCount(0, 'data');
    }
}
