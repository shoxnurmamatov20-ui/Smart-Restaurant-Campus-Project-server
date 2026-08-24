<?php

declare(strict_types=1);

namespace Modules\Pos\Tests\Feature;

use App\Models\PushToken;
use App\Models\Tenant;
use App\Models\User;
use App\Support\Events\EventBus;
use App\Support\Tenancy\TenantContext;
use Database\Seeders\RolesAndPermissionsSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Modules\Pos\Events\ApprovalRequested;
use Modules\Pos\Models\PosApproval;
use PHPUnit\Framework\Attributes\Test;
use Tests\TestCase;

/**
 * A request for approval reaches the manager's phone — and only the manager's.
 */
final class ApprovalPushTest extends TestCase
{
    use RefreshDatabase;

    private Tenant $tenant;

    protected function setUp(): void
    {
        parent::setUp();

        $this->seed(RolesAndPermissionsSeeder::class);

        $this->tenant = Tenant::query()->create([
            'name' => 'Osh Markazi', 'slug' => 'osh-markazi', 'country_code' => 'UZ',
            'locale' => 'uz', 'timezone' => 'Asia/Tashkent', 'status' => 'active',
        ]);
        app(TenantContext::class)->set($this->tenant);
    }

    #[Test]
    public function the_manager_is_paged_and_the_waiter_is_not(): void
    {
        $manager = $this->person('branch-manager', 'ExponentPushToken[manager0000000000]');
        $this->person('waiter', 'ExponentPushToken[waiter00000000000]');

        Http::fake(['exp.host/*' => Http::response(['data' => [['status' => 'ok']]])]);

        $approval = PosApproval::factory()->create([
            'tenant_id' => $this->tenant->id,
            'action' => 'discount',
            'amount' => 1_250_000,
            'reason' => 'Doimiy mijoz',
            'expires_at' => now()->addMinutes(5),
        ]);

        app(EventBus::class)->publish(new ApprovalRequested($approval));
        // Delivery rides on the transaction's commit, and a test transaction
        // never commits; the relay is the same path a crash recovery takes.
        app(EventBus::class)->relayPending();

        Http::assertSentCount(1);
        Http::assertSent(function ($request) use ($manager) {
            $messages = $request->data();
            $one = $messages[0];

            return $one['to'] === 'ExponentPushToken[manager0000000000]'
                && str_contains((string) $one['title'], 'Chegirma')
                && str_contains((string) $one['body'], '12 500')
                && $one['data']['url'] === '/crew/manager/queue'
                && $manager->pushTokens()->count() === 1;
        });
    }

    #[Test]
    public function a_redelivered_event_does_not_page_twice(): void
    {
        $this->person('branch-manager', 'ExponentPushToken[manager0000000000]');
        Http::fake(['exp.host/*' => Http::response(['data' => [['status' => 'ok']]])]);

        $approval = PosApproval::factory()->create([
            'tenant_id' => $this->tenant->id, 'action' => 'void', 'amount' => 50_000,
            'expires_at' => now()->addMinutes(5),
        ]);
        $event = new ApprovalRequested($approval);

        app(EventBus::class)->publish($event);
        app(EventBus::class)->relayPending();
        // The bus is at-least-once; a second sweep must find nothing new to do —
        // and if it did hand the row over again, `ProcessedEvents` holds.
        app(EventBus::class)->relayPending();

        Http::assertSentCount(1);
    }

    private function person(string $role, string $token): User
    {
        $user = User::factory()->create(['tenant_id' => $this->tenant->id]);
        $user->assignRole($role);
        PushToken::query()->create([
            'tenant_id' => $this->tenant->id, 'user_id' => $user->id, 'token' => $token,
            'platform' => 'android', 'surface' => 'crew',
        ]);

        return $user;
    }
}
