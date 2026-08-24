<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Models\Branch;
use App\Models\PushToken;
use App\Models\Tenant;
use App\Models\User;
use App\Notifications\ApprovalWaiting;
use App\Support\Events\DomainEvent;
use App\Support\Events\EventBus;
use App\Support\Tenancy\TenantContext;
use Database\Seeders\RolesAndPermissionsSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Str;
use PHPUnit\Framework\Attributes\Test;
use Tests\TestCase;

/**
 * The console's bell.
 *
 * Two halves, and they fail differently. The feed is a read that must never
 * cross a person or a restaurant — the bell renders on every screen in the
 * console, so a leak here is a leak everywhere. The producers are the other
 * half: a domain event that reaches nobody is silent, and silence is what this
 * feature exists to end.
 */
final class NotificationFeedTest extends TestCase
{
    use RefreshDatabase;

    private Tenant $palov;

    private Tenant $lagmon;

    private Branch $chilonzor;

    private Branch $sergeli;

    private User $owner;

    private User $manager;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(RolesAndPermissionsSeeder::class);

        $this->palov = $this->restaurant('palov-uyi');
        $this->lagmon = $this->restaurant('lagmon-uyi');

        app(TenantContext::class)->set($this->palov);

        $this->chilonzor = Branch::factory()->create([
            'tenant_id' => $this->palov->id, 'name' => 'Chilonzor', 'timezone' => 'Asia/Tashkent',
        ]);
        $this->sergeli = Branch::factory()->create([
            'tenant_id' => $this->palov->id, 'name' => 'Sergeli', 'timezone' => 'Asia/Tashkent',
        ]);

        $this->owner = $this->person($this->palov, 'owner');
        $this->manager = $this->person($this->palov, 'branch-manager', $this->chilonzor);
    }

    // ============ The feed ============

    #[Test]
    public function the_tray_holds_the_callers_own_rows_and_nobody_elses(): void
    {
        $colleague = $this->person($this->palov, 'branch-manager', $this->sergeli);

        $this->plant($this->owner, 'cash_variance', 'high');
        $this->plant($colleague, 'bill_voided', 'high');

        $body = $this->actingAs($this->owner)
            ->withHeader('X-Tenant', $this->palov->slug)
            ->getJson('/api/v1/notifications')
            ->assertOk()
            ->json('data');

        $this->assertCount(1, $body);
        $this->assertSame('cash_variance', $body[0]['key']);
    }

    #[Test]
    public function another_restaurants_row_is_invisible_even_when_it_names_the_same_person(): void
    {
        /*
         * The row that matters. Same person id, same morph type, different
         * restaurant — which is what an account held at two businesses looks
         * like, and the one case a `notifiable_id` check alone would let
         * through.
         */
        $this->plant($this->owner, 'cash_variance', 'high', tenant: $this->lagmon);
        $this->plant($this->owner, 'bill_voided', 'mid');

        $body = $this->actingAs($this->owner)
            ->withHeader('X-Tenant', $this->palov->slug)
            ->getJson('/api/v1/notifications')
            ->assertOk()
            ->json('data');

        $this->assertSame(['bill_voided'], array_column($body, 'key'));
    }

    #[Test]
    public function severity_comes_before_the_clock(): void
    {
        // An old shortfall against a fresh report: newest-first would bury the
        // one that costs money under the one that costs nothing.
        $this->plant($this->owner, 'july_pl', 'low', at: '2026-08-22 09:00:00');
        $this->plant($this->owner, 'beef_low', 'mid', at: '2026-08-22 11:40:00');
        $this->plant($this->owner, 'cash_variance', 'high', at: '2026-08-21 14:20:00');
        $this->plant($this->owner, 'bill_voided', 'high', at: '2026-08-22 08:00:00');

        $body = $this->actingAs($this->owner)
            ->withHeader('X-Tenant', $this->palov->slug)
            ->getJson('/api/v1/notifications')
            ->assertOk()
            ->json('data');

        $this->assertSame(
            ['bill_voided', 'cash_variance', 'beef_low', 'july_pl'],
            array_column($body, 'key'),
        );
    }

    #[Test]
    public function a_row_carries_the_venue_and_the_venues_own_clock(): void
    {
        $this->plant($this->owner, 'cash_variance', 'high', at: '2026-08-22 09:20:00', branch: $this->chilonzor);

        $row = $this->actingAs($this->owner)
            ->withHeader('X-Tenant', $this->palov->slug)
            ->getJson('/api/v1/notifications')
            ->assertOk()
            ->json('data.0');

        $this->assertSame('Chilonzor', $row['place']);
        $this->assertSame($this->chilonzor->id, $row['branch_id']);
        // 09:20 UTC is 14:20 in Tashkent, and the tray shows no date — a row
        // rendered in the server's zone would put the evening on the wrong day.
        $this->assertSame('14:20', $row['time']);
    }

    #[Test]
    public function the_sentence_arrives_in_the_language_the_request_asked_for(): void
    {
        $this->plant($this->owner, 'cash_variance', 'high', data: [
            'key' => 'cash_variance',
            'level' => 'high',
            'href' => '/analytics/control',
            'title' => ['uz' => 'Kassa farqi', 'ru' => 'Расхождение в кассе', 'en' => 'Till variance'],
            'body' => ['uz' => '41-smena', 'ru' => 'Смена 41', 'en' => 'Shift 41'],
        ]);

        $row = $this->actingAs($this->owner)
            ->withHeader('X-Tenant', $this->palov->slug)
            ->withHeader('X-Locale', 'ru')
            ->getJson('/api/v1/notifications')
            ->assertOk()
            ->json('data.0');

        $this->assertSame('Расхождение в кассе', $row['title']);
        $this->assertSame('Смена 41', $row['body']);
        $this->assertSame('/analytics/control', $row['href']);
    }

    // ============ Marking read ============

    #[Test]
    public function marking_read_twice_keeps_the_first_stamp(): void
    {
        $id = $this->plant($this->owner, 'cash_variance', 'high');

        $first = $this->actingAs($this->owner)
            ->withHeader('X-Tenant', $this->palov->slug)
            ->patchJson("/api/v1/notifications/{$id}/read")
            ->assertOk()
            ->json('data.read_at');

        $this->assertNotNull($first);

        // A retry after a lost response must not move the stamp: `read_at` is
        // when the reader saw it, not when the network recovered.
        $second = $this->actingAs($this->owner)
            ->withHeader('X-Tenant', $this->palov->slug)
            ->patchJson("/api/v1/notifications/{$id}/read")
            ->assertOk()
            ->json('data.read_at');

        $this->assertSame($first, $second);

        $this->actingAs($this->owner)
            ->withHeader('X-Tenant', $this->palov->slug)
            ->getJson('/api/v1/notifications')
            ->assertOk()
            ->assertJsonCount(0, 'data');
    }

    #[Test]
    public function an_id_that_belongs_to_somebody_else_is_simply_not_found(): void
    {
        $colleague = $this->person($this->palov, 'branch-manager', $this->sergeli);
        $id = $this->plant($colleague, 'cash_variance', 'high');

        $this->actingAs($this->owner)
            ->withHeader('X-Tenant', $this->palov->slug)
            ->patchJson("/api/v1/notifications/{$id}/read")
            ->assertApiError('request.not_found');

        $this->assertDatabaseHas('notifications', ['id' => $id, 'read_at' => null]);
    }

    #[Test]
    public function a_segment_that_is_not_a_uuid_is_a_404_rather_than_a_500(): void
    {
        $this->actingAs($this->owner)
            ->withHeader('X-Tenant', $this->palov->slug)
            ->patchJson('/api/v1/notifications/not-a-uuid/read')
            ->assertNotFound();
    }

    #[Test]
    public function mark_all_read_empties_the_tray_and_touches_no_one_elses(): void
    {
        $colleague = $this->person($this->palov, 'branch-manager', $this->sergeli);

        $this->plant($this->owner, 'cash_variance', 'high');
        $this->plant($this->owner, 'bill_voided', 'mid');
        $theirs = $this->plant($colleague, 'beef_low', 'mid');

        $this->actingAs($this->owner)
            ->withHeader('X-Tenant', $this->palov->slug)
            ->postJson('/api/v1/notifications/read-all')
            ->assertOk()
            ->assertJsonPath('data.marked', 2);

        $this->actingAs($this->owner)
            ->withHeader('X-Tenant', $this->palov->slug)
            ->getJson('/api/v1/notifications')
            ->assertOk()
            ->assertJsonCount(0, 'data');

        $this->assertDatabaseHas('notifications', ['id' => $theirs, 'read_at' => null]);
    }

    // ============ What writes into it ============

    #[Test]
    public function an_approval_reaches_the_phone_and_the_console_alike(): void
    {
        Http::fake(['exp.host/*' => Http::response(['data' => []], 200)]);

        PushToken::query()->create([
            'tenant_id' => $this->palov->id, 'user_id' => $this->manager->id,
            'token' => 'ExponentPushToken[aaaaaaaaaaaaaaaaaaaaaa]',
            'platform' => 'android', 'surface' => 'crew', 'locale' => 'uz',
        ]);

        $this->manager->notify(new ApprovalWaiting(41, [
            'action' => 'discount', 'amount' => 4_500_000, 'reason' => "Tug'ilgan kun",
            'expires_at' => now()->addMinutes(3)->toIso8601String(), 'role' => 'manager',
        ]));

        // The push still goes — nothing about the console row changes what the
        // phone receives.
        Http::assertSent(fn ($request) => str_contains($request->url(), 'exp.host'));

        $row = DB::table('notifications')->where('notifiable_id', $this->manager->id)->first();

        $this->assertNotNull($row);
        $this->assertSame('approval_waiting', $row->key);
        $this->assertSame('high', $row->level);
        $this->assertSame($this->palov->id, (int) $row->tenant_id);

        /** @var array<string, mixed> $data */
        $data = json_decode((string) $row->data, true);
        $this->assertSame('/dashboard', $data['href']);
        $this->assertSame("45 000 so'm · Tug'ilgan kun", $data['body']['uz']);
    }

    #[Test]
    public function a_flagged_variance_rings_for_the_owner_and_the_venues_manager(): void
    {
        $elsewhere = $this->person($this->palov, 'branch-manager', $this->sergeli);
        $waiter = $this->person($this->palov, 'waiter', $this->chilonzor);

        $this->publish('finance.shift_variance_flagged', [
            'number' => '41', 'branch_id' => $this->chilonzor->id,
            'difference' => -3_200_000, 'expected_cash' => 480_000_000, 'counted_cash' => 476_800_000,
            'reason' => null,
        ]);

        $this->assertRang($this->owner, 'cash_variance');
        $this->assertRang($this->manager, 'cash_variance');
        // A manager pinned to Sergeli does not need Chilonzor's drawer, and a
        // waiter cannot open the screen the row links to.
        $this->assertSilent($elsewhere);
        $this->assertSilent($waiter);

        /** @var object{data: string, level: string, branch_id: int} $row */
        $row = DB::table('notifications')->where('notifiable_id', $this->owner->id)->first();
        $this->assertSame('high', $row->level);
        $this->assertSame($this->chilonzor->id, (int) $row->branch_id);

        /** @var array<string, mixed> $data */
        $data = json_decode((string) $row->data, true);
        $this->assertSame("Kassa farqi: \u{2212}32 000 so'm", $data['title']['uz']);
        $this->assertStringContainsString('4 800 000', $data['body']['uz']);
    }

    #[Test]
    public function an_undeclared_sale_reaches_the_accountant_rather_than_the_manager(): void
    {
        $accountant = $this->person($this->palov, 'accountant');

        $this->publish('finance.fiscal_receipt_expired', [
            'order_number' => 'CHZ-000412', 'branch_id' => $this->chilonzor->id,
            'total' => 18_600_000, 'attempts' => 6, 'last_error' => 'OFD timeout',
        ]);

        $this->assertRang($accountant, 'fiscal_expired');
        $this->assertRang($this->owner, 'fiscal_expired');
        // `/finance/books` is not among a branch manager's twenty-one sections,
        // and a notice linking to a refused screen reads as a broken console.
        $this->assertSilent($this->manager);
    }

    #[Test]
    public function a_void_nobody_signed_off_is_louder_than_one_a_manager_did(): void
    {
        $this->publish('pos.bill_voided', [
            'number' => 'CHZ-000501', 'total' => 18_600_000, 'reason' => 'Mijoz rad etdi',
            'approved_by_user_id' => null,
        ]);

        $this->assertRang($this->owner, 'bill_voided', 'high');

        DB::table('notifications')->delete();

        $this->publish('pos.bill_voided', [
            'number' => 'CHZ-000502', 'total' => 18_600_000, 'reason' => 'Xato kiritildi',
            'approved_by_user_id' => $this->manager->id,
        ]);

        $this->assertRang($this->owner, 'bill_voided', 'mid');
    }

    #[Test]
    public function the_bus_delivering_twice_still_rings_once(): void
    {
        $event = new BellTestEvent('finance.shift_variance_flagged', [
            'number' => '41', 'branch_id' => $this->chilonzor->id,
            'difference' => -3_200_000, 'expected_cash' => 480_000_000, 'counted_cash' => 476_800_000,
        ], $this->palov->id);

        app(EventBus::class)->publish($event);
        app(EventBus::class)->relayPending();

        // At-least-once delivery is the bus's contract; a bell whose count went
        // to two for one shortfall is a count nobody reads again.
        $this->assertSame(1, DB::table('notifications')->where('notifiable_id', $this->owner->id)->count());
    }

    #[Test]
    public function a_routine_shift_close_is_deliberately_not_worth_a_bell(): void
    {
        // Every till, every evening, five venues. The nine events that are not
        // wired are a decision, and this is the one that would look most like
        // an oversight — see RingTheConsoleBell.
        $this->publish('finance.shift_closed', [
            'number' => '41', 'branch_id' => $this->chilonzor->id, 'difference' => 0,
        ]);

        $this->assertSilent($this->owner);
    }

    // ============ Fixtures ============

    private function restaurant(string $slug): Tenant
    {
        return Tenant::query()->create([
            'name' => ucfirst($slug), 'slug' => $slug, 'country_code' => 'UZ',
            'locale' => 'uz', 'timezone' => 'Asia/Tashkent', 'status' => 'active',
        ]);
    }

    private function person(Tenant $tenant, string $role, ?Branch $branch = null): User
    {
        $user = User::factory()->create([
            'tenant_id' => $tenant->id,
            'branch_id' => $branch?->id,
        ]);

        $user->assignRole($role);

        return $user;
    }

    /**
     * One row straight into the table, so a test can decide its clock.
     *
     * @param  array<string, mixed>|null  $data
     * @return string the row's uuid
     */
    private function plant(
        User $user,
        string $key,
        string $level,
        string $at = '2026-08-22 09:00:00',
        ?Branch $branch = null,
        ?Tenant $tenant = null,
        ?array $data = null,
    ): string {
        $id = (string) Str::uuid();

        DB::table('notifications')->insert([
            'id' => $id,
            'type' => 'Tests\Feature\BellTestEvent',
            'notifiable_type' => User::class,
            'notifiable_id' => $user->id,
            'data' => json_encode($data ?? ['key' => $key, 'level' => $level, 'href' => '/dashboard']),
            'read_at' => null,
            'created_at' => $at,
            'updated_at' => $at,
            'tenant_id' => ($tenant ?? $this->palov)->id,
            'branch_id' => $branch?->id,
            'key' => $key,
            'level' => $level,
        ]);

        return $id;
    }

    /** @param array<string, mixed> $payload */
    private function publish(string $name, array $payload): void
    {
        app(EventBus::class)->publish(new BellTestEvent($name, $payload, $this->palov->id));
    }

    private function assertRang(User $user, string $key, ?string $level = null): void
    {
        $where = ['notifiable_id' => $user->id, 'key' => $key];

        if ($level !== null) {
            $where['level'] = $level;
        }

        $this->assertSame(1, DB::table('notifications')->where($where)->count(), sprintf(
            'Expected one %s row for user %d.', $key, $user->id,
        ));
    }

    private function assertSilent(User $user): void
    {
        $this->assertSame(0, DB::table('notifications')->where('notifiable_id', $user->id)->count(), sprintf(
            'User %d should not have been notified.', $user->id,
        ));
    }
}

/**
 * A domain event with the name and payload the test needs.
 *
 * Deliberately not the module's own class. `RingTheConsoleBell` lives in the
 * core and subscribes by STRING — importing `Modules\Finance\Events\…` here
 * would test a coupling the bus exists to prevent, and would tie this file to
 * a payload shape Finance is free to add to.
 */
final class BellTestEvent extends DomainEvent
{
    /** @param array<string, mixed> $payload */
    public function __construct(
        private readonly string $name,
        private readonly array $payload,
        private readonly ?int $tenantId,
    ) {}

    public function name(): string
    {
        return $this->name;
    }

    /** @return array<string, mixed> */
    public function payload(): array
    {
        return $this->payload;
    }

    public function tenantId(): ?int
    {
        return $this->tenantId;
    }
}
