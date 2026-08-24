<?php

declare(strict_types=1);

namespace Modules\Orders\Tests\Feature;

use App\Models\Branch;
use App\Models\Tenant;
use App\Models\User;
use App\Support\Tenancy\BranchContext;
use App\Support\Tenancy\BusinessDay;
use App\Support\Tenancy\TenantContext;
use Carbon\CarbonImmutable;
use Database\Seeders\RolesAndPermissionsSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Modules\Orders\Models\Order;
use Tests\TestCase;

/**
 * The aggregate the staff roster's two empty columns were waiting for.
 *
 * `staff-server.ts` has drawn `sales: 0, tickets: 0` since it was written and
 * said why: *"summing a month of them in the browser to fill two columns is not
 * a query, it is a report."* Staff may not import Orders, so this is the
 * endpoint, keyed by user id, and the console is what joins the two lists.
 *
 * The figures are asserted exactly rather than "greater than zero": a per-person
 * sales column is a number people are measured on, and a test that only checks
 * it is non-empty would pass with everybody's takings summed onto one name.
 */
final class WaiterStatsTest extends TestCase
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

    private function bill(User $waiter, int $total, int $guests, string $businessDate, string $status = 'paid'): Order
    {
        $order = Order::factory()->create([
            'tenant_id' => $this->tenant->id,
            'branch_id' => $this->branch->id,
            'waiter_user_id' => $waiter->getKey(),
            'guests_count' => $guests,
            'subtotal' => $total,
            'total' => $total,
            'status' => $status,
        ]);

        // Forced rather than passed to the factory: `HasBusinessDate` stamps
        // the venue's own trading day on create, and this test is about which
        // day a bill lands on.
        $order->forceFill(['business_date' => $businessDate])->save();

        return $order;
    }

    /**
     * A JSON list, keyed by one of its columns.
     *
     * `collect($response->json(...))` cannot be typed — `json()` answers mixed
     * — and PHPStan refuses it rather than guessing. Narrowing here once is the
     * honest fix; the alternatives are a suppression or a cast.
     *
     * @return array<int|string, array<string, mixed>>
     */
    private static function keyed(mixed $rows, string $by): array
    {
        $keyed = [];

        foreach (is_array($rows) ? $rows : [] as $row) {
            if (is_array($row) && isset($row[$by]) && (is_int($row[$by]) || is_string($row[$by]))) {
                $keyed[$row[$by]] = $row;
            }
        }

        return $keyed;
    }

    public function test_each_waiter_gets_their_own_tickets_covers_and_takings(): void
    {
        $today = app(BusinessDay::class)->dateFor();

        $aziza = $this->signIn('waiter');
        $jasur = $this->signIn('waiter');

        $this->bill($aziza, 180_000_00, 4, $today);
        $this->bill($aziza, 120_000_00, 3, $today);
        $this->bill($jasur, 90_000_00, 2, $today);

        $this->signIn('branch-manager');

        $rows = self::keyed(
            $this->getJson('/api/v1/orders/stats/by-waiter?period=today')->assertOk()->json('data'),
            'waiter_user_id',
        );

        $this->assertSame(2, $rows[$aziza->getKey()]['tickets']);
        $this->assertSame(7, $rows[$aziza->getKey()]['covers']);
        $this->assertSame(300_000_00, $rows[$aziza->getKey()]['revenue_tiyin']);
        // Per BILL, which is what "average cheque" means in this industry.
        $this->assertSame(150_000_00, $rows[$aziza->getKey()]['average_tiyin']);

        $this->assertSame(1, $rows[$jasur->getKey()]['tickets']);
        $this->assertSame(90_000_00, $rows[$jasur->getKey()]['revenue_tiyin']);
    }

    public function test_only_bills_that_were_actually_paid_count(): void
    {
        $today = app(BusinessDay::class)->dateFor();
        $waiter = $this->signIn('waiter');

        $this->bill($waiter, 100_000_00, 2, $today);
        // A bill still open, and one the guest walked out on. Neither is money.
        $this->bill($waiter, 500_000_00, 2, $today, 'placed');
        $this->bill($waiter, 500_000_00, 2, $today, 'voided');

        $this->signIn('branch-manager');

        $rows = $this->getJson('/api/v1/orders/stats/by-waiter')->assertOk()->json('data');

        $this->assertCount(1, $rows);
        $this->assertSame(100_000_00, $rows[0]['revenue_tiyin']);
    }

    public function test_yesterdays_takings_are_not_todays(): void
    {
        $today = app(BusinessDay::class)->dateFor();
        /*
         * Yesterday's TRADING day, not yesterday's calendar day.
         *
         * `now()->subDay()` is the obvious version and it is wrong for one hour
         * out of every twenty-four: the trading day starts at 06:00 in the
         * venue's own timezone, so between midnight and that boundary
         * `dateFor()` still answers the previous calendar date — and the two
         * bills below land on the same day, which is the failure this test is
         * supposed to catch rather than suffer from. Measured at 00:18 UTC with
         * the venue five hours ahead: both dates came back 2026-08-21.
         */
        $yesterday = CarbonImmutable::parse($today)->subDay()->toDateString();

        $waiter = $this->signIn('waiter');
        $this->bill($waiter, 100_000_00, 2, $today);
        $this->bill($waiter, 700_000_00, 2, $yesterday);

        $this->signIn('branch-manager');

        $this->assertSame(
            100_000_00,
            $this->getJson('/api/v1/orders/stats/by-waiter?period=today')->assertOk()->json('data.0.revenue_tiyin'),
        );

        // A week reaches back seven trading days, inclusive of today.
        $this->assertSame(
            800_000_00,
            $this->getJson('/api/v1/orders/stats/by-waiter?period=week')->assertOk()->json('data.0.revenue_tiyin'),
        );
    }

    public function test_a_stale_bookmark_falls_back_to_today_rather_than_failing(): void
    {
        $waiter = $this->signIn('waiter');
        $this->bill($waiter, 100_000_00, 2, app(BusinessDay::class)->dateFor());

        $this->signIn('branch-manager');

        // A read is a read: `?period=quarter` should draw today rather than
        // putting a 422 where a screen was, which is what ReportWindow does too.
        $this->getJson('/api/v1/orders/stats/by-waiter?period=quarter')
            ->assertOk()
            ->assertJsonPath('meta.period', 'today');
    }

    public function test_another_restaurants_takings_are_invisible(): void
    {
        $today = app(BusinessDay::class)->dateFor();
        $mine = $this->signIn('waiter');
        $this->bill($mine, 100_000_00, 2, $today);

        $elsewhere = Tenant::query()->create([
            'name' => 'Lagmon Uyi', 'slug' => 'lagmon-uyi', 'country_code' => 'UZ',
            'locale' => 'uz', 'timezone' => 'Asia/Tashkent', 'status' => 'active',
        ]);

        $theirs = User::factory()->create(['tenant_id' => $elsewhere->id]);
        Order::query()->create([
            'tenant_id' => $elsewhere->id,
            'number' => 'X-1',
            'channel' => 'dine_in',
            'status' => 'paid',
            'waiter_user_id' => $theirs->getKey(),
            'guests_count' => 2,
            'subtotal' => 999_000_00,
            'discount_total' => 0,
            'service_charge' => 0,
            'total' => 999_000_00,
            'business_date' => $today,
        ]);

        $this->signIn('branch-manager');

        $rows = $this->getJson('/api/v1/orders/stats/by-waiter')->assertOk()->json('data');

        $this->assertCount(1, $rows);
        $this->assertSame($mine->getKey(), $rows[0]['waiter_user_id']);
    }

    public function test_an_accountant_cannot_read_it(): void
    {
        $this->signIn('accountant');

        $this->getJson('/api/v1/orders/stats/by-waiter')->assertStatus(403);
    }
}
