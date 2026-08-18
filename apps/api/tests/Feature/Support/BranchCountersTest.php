<?php

declare(strict_types=1);

namespace Tests\Feature\Support;

use App\Contracts\Orders\BillRegistry;
use App\Models\Tenant;
use App\Support\Counters\BranchCounters;
use App\Support\Tenancy\TenantContext;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

/**
 * The counters that replaced max(id)+1.
 *
 * True concurrency cannot be staged inside one PHPUnit process, so what these
 * tests pin is everything AROUND the atomicity — scoping, independence, reset
 * behaviour, rollback — while the atomicity itself rests on ON CONFLICT DO
 * UPDATE ... RETURNING, which is PostgreSQL's guarantee, not ours to re-prove.
 */
final class BranchCountersTest extends TestCase
{
    use RefreshDatabase;

    private function counters(): BranchCounters
    {
        return app(BranchCounters::class);
    }

    private function actAsTenant(Tenant $tenant): void
    {
        app(TenantContext::class)->set($tenant);
    }

    /** Tenant has no factory — every test builds it the same literal way. */
    private function tenant(string $slug): Tenant
    {
        return Tenant::query()->create([
            'name' => ucfirst($slug), 'slug' => $slug, 'country_code' => 'UZ',
            'locale' => 'uz', 'timezone' => 'Asia/Tashkent', 'status' => 'active',
        ]);
    }

    public function test_a_counter_counts_from_one(): void
    {
        $this->actAsTenant($this->tenant('birinchi'));

        $this->assertSame(1, $this->counters()->next('order.number'));
        $this->assertSame(2, $this->counters()->next('order.number'));
        $this->assertSame(3, $this->counters()->next('order.number'));
    }

    public function test_tenants_never_share_a_count(): void
    {
        $palov = $this->tenant('palov-uyi');
        $lagmon = $this->tenant('lagmon-uyi');

        $this->actAsTenant($palov);
        $this->counters()->next('order.number');
        $this->counters()->next('order.number');

        // A busy neighbour must not make this restaurant's numbers jump —
        // which is exactly what the global id sequence used to do.
        $this->actAsTenant($lagmon);
        $this->assertSame(1, $this->counters()->next('order.number'));
    }

    public function test_keys_branches_and_periods_are_separate_counters(): void
    {
        $this->actAsTenant($this->tenant('birinchi'));

        $this->assertSame(1, $this->counters()->next('order.number'));
        $this->assertSame(1, $this->counters()->next('zreport.number'));
        $this->assertSame(1, $this->counters()->next('zreport.number', branchId: null, period: '2026-08-18'));
        $this->assertSame(1, $this->counters()->next('zreport.number', branchId: null, period: '2026-08-19'));
        $this->assertSame(2, $this->counters()->next('zreport.number', branchId: null, period: '2026-08-19'));

        // The perpetual counter was untouched by the daily ones.
        $this->assertSame(2, $this->counters()->next('zreport.number'));
    }

    public function test_the_same_scope_is_one_row_not_a_reset(): void
    {
        // Without NULLS NOT DISTINCT every (tenant, NULL, key, '') insert is
        // "unique", ON CONFLICT never fires, and the counter answers 1 forever.
        // This is the test that fails if that index ever loses the clause.
        $this->actAsTenant($this->tenant('birinchi'));

        $this->counters()->next('order.number');
        $this->counters()->next('order.number');

        $this->assertSame(1, DB::table('branch_counters')->where('key', 'order.number')->count());
    }

    public function test_a_rolled_back_bill_gives_its_number_back(): void
    {
        $this->actAsTenant($this->tenant('birinchi'));

        $this->counters()->next('order.number');

        try {
            DB::transaction(function (): void {
                $this->counters()->next('order.number');
                throw new \RuntimeException('the bill failed to open');
            });
        } catch (\RuntimeException) {
        }

        // 2 was taken inside the failed transaction and returned with it.
        $this->assertSame(2, $this->counters()->next('order.number'));
    }

    public function test_bills_are_numbered_by_the_counter(): void
    {
        $this->actAsTenant($this->tenant('birinchi'));
        $bills = app(BillRegistry::class);

        $this->assertSame('A-0001', $bills->open('dine_in')->number);
        $this->assertSame('A-0002', $bills->open('dine_in')->number);
    }
}
