<?php

declare(strict_types=1);

namespace Modules\Staff\Tests\Feature;

use App\Contracts\Staff\Roster;
use App\Models\Branch;
use App\Models\Tenant;
use App\Support\Tenancy\TenantContext;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Modules\Staff\Models\Attendance;
use Modules\Staff\Models\Shift;
use Modules\Staff\Models\StaffMember;
use Tests\TestCase;

/**
 * Scheduled against actual, per person — the read the labour report needs.
 *
 * The card promised "plan against fact, overtime and late clock-ins" and
 * drew nothing, because Analytics may not read Staff. This is the contract
 * method that carries it across.
 */
final class LabourHoursTest extends TestCase
{
    use RefreshDatabase;

    private Tenant $tenant;

    private Branch $branch;

    protected function setUp(): void
    {
        parent::setUp();

        $this->tenant = Tenant::query()->create([
            'name' => 'Osh Markazi', 'slug' => 'osh-markazi', 'country_code' => 'UZ',
            'locale' => 'uz', 'timezone' => 'Asia/Tashkent', 'status' => 'active',
        ]);
        app(TenantContext::class)->set($this->tenant);
        $this->branch = Branch::factory()->named('Chilonzor', 'CHZ')->create(['tenant_id' => $this->tenant->id]);
    }

    protected function tearDown(): void
    {
        app(TenantContext::class)->clear();
        parent::tearDown();
    }

    public function test_it_puts_the_rota_beside_what_actually_happened(): void
    {
        $member = StaffMember::factory()->create([
            'tenant_id' => $this->tenant->id,
            'branch_id' => $this->branch->id,
            'first_name' => 'Jasur',
            'last_name' => 'Toshev',
            'position' => 'waiter',
        ]);

        // Two rostered shifts of nine hours; one worked in full, one short.
        foreach (['2026-08-18', '2026-08-19'] as $index => $day) {
            $shift = Shift::factory()->create([
                'tenant_id' => $this->tenant->id,
                'branch_id' => $this->branch->id,
                'staff_member_id' => $member->id,
                'starts_at' => $day.' 09:00:00',
                'ends_at' => $day.' 18:00:00',
                'status' => 'planned',
            ]);

            Attendance::query()->create([
                'tenant_id' => $this->tenant->id,
                'branch_id' => $this->branch->id,
                'staff_member_id' => $member->id,
                'checked_in_at' => $day.($index === 0 ? ' 09:00:00' : ' 09:21:00'),
                'checked_out_at' => $day.' 18:00:00',
                'method' => 'pin',
                'minutes_worked' => $index === 0 ? 540 : 519,
                'is_late' => $index === 1,
            ]);

            $this->assertGreaterThan(0, $shift->id);
        }

        $rows = app(Roster::class)->hoursBetween('2026-08-18', '2026-08-19', $this->branch->id);

        $this->assertCount(1, $rows);
        $this->assertSame('Toshev Jasur', $rows[0]['name']);
        $this->assertSame(2, $rows[0]['shifts']);
        $this->assertSame(1080, $rows[0]['scheduled_minutes']);
        $this->assertSame(1059, $rows[0]['worked_minutes']);
        $this->assertSame(1, $rows[0]['late_count']);
    }

    public function test_a_rostered_shift_nobody_came_to_counts_as_nothing_worked(): void
    {
        $member = StaffMember::factory()->create([
            'tenant_id' => $this->tenant->id,
            'branch_id' => $this->branch->id,
            'first_name' => 'Nodira',
            'last_name' => 'Saidova',
        ]);

        Shift::factory()->create([
            'tenant_id' => $this->tenant->id,
            'branch_id' => $this->branch->id,
            'staff_member_id' => $member->id,
            'starts_at' => '2026-08-20 09:00:00',
            'ends_at' => '2026-08-20 17:00:00',
            'status' => 'planned',
        ]);

        $rows = app(Roster::class)->hoursBetween('2026-08-20', '2026-08-20', $this->branch->id);

        $this->assertSame(480, $rows[0]['scheduled_minutes']);
        $this->assertSame(0, $rows[0]['worked_minutes']);
    }

    public function test_a_window_with_no_rota_answers_nothing(): void
    {
        $this->assertSame([], app(Roster::class)->hoursBetween('2020-01-01', '2020-01-02'));
    }
}
