<?php

declare(strict_types=1);

namespace Modules\Staff\Tests\Feature;

use App\Models\Branch;
use App\Models\Tenant;
use App\Models\User;
use App\Support\Auth\PinCredentials;
use App\Support\Tenancy\TenantContext;
use Database\Seeders\RolesAndPermissionsSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Modules\Staff\Models\StaffDevice;
use Modules\Staff\Models\StaffMember;
use Tests\TestCase;

/**
 * Hiring somebody, from the console's own form.
 *
 * The screen asks a manager for what a manager knows — a name, a job, a
 * venue — and nothing else. Every other column the table carries either has a
 * default or is derived, and the one that did not, `employee_code`, was
 * `required`: the console had no field for it, so the button that said "add
 * an employee" could not have worked even if it had been wired to anything.
 * It was not wired to anything either — it flashed a message.
 */
final class HiringTest extends TestCase
{
    use RefreshDatabase;

    private Tenant $tenant;

    private Branch $branch;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(RolesAndPermissionsSeeder::class);

        $this->tenant = Tenant::query()->create([
            'name' => 'Omad Manti', 'slug' => 'omad-manti', 'country_code' => 'UZ',
            'locale' => 'uz', 'timezone' => 'Asia/Tashkent', 'status' => 'active',
        ]);

        app(TenantContext::class)->set($this->tenant);
        $this->branch = Branch::factory()->named('Markaziy', 'M1')->create(['tenant_id' => $this->tenant->id]);

        $owner = User::factory()->create(['tenant_id' => $this->tenant->id]);
        $owner->assignRole('owner');
        $this->actingAs($owner);
    }

    protected function tearDown(): void
    {
        app(TenantContext::class)->clear();
        parent::tearDown();
    }

    public function test_a_name_and_a_job_is_enough_to_hire_somebody(): void
    {
        $answer = $this->postJson('/api/v1/staff/members', [
            'first_name' => 'Dilnoza',
            'last_name' => 'Yusupova',
            'position' => 'waiter',
            'branch_id' => $this->branch->id,
        ], ['X-Tenant' => $this->tenant->slug]);

        $answer->assertCreated()
            ->assertJsonPath('data.first_name', 'Dilnoza')
            ->assertJsonPath('data.position', 'waiter')
            // Generated, because a restaurant should not have to invent one.
            ->assertJsonPath('data.employee_code', 'EMP-0001')
            ->assertJsonPath('data.status', 'active');
    }

    /**
     * The HR row and the account, from one press.
     *
     * For a long time hiring wrote only the first, so a new waiter had no
     * login, no pairing code and no way into the app on their phone. The PIN
     * comes back once, beside the employee code — the two things a manager
     * reads to the person standing in front of them.
     */
    public function test_hiring_somebody_opens_their_login_and_shows_the_pin_once(): void
    {
        $answer = $this->postJson('/api/v1/staff/members', [
            'first_name' => 'Dilnoza',
            'last_name' => 'Yusupova',
            'position' => 'waiter',
            'branch_id' => $this->branch->id,
        ], ['X-Tenant' => $this->tenant->slug])->assertCreated();

        $pin = (string) $answer->json('pin');
        $this->assertMatchesRegularExpression('/^\d{4}$/', $pin);

        $member = StaffMember::query()->firstOrFail();
        $this->assertNotNull($member->user_id);
        $this->assertSame($member->user_id, $answer->json('data.user_id'));

        $person = User::query()->findOrFail($member->user_id);
        // Surname first — the order `full_name` already uses on every roster.
        $this->assertSame('Yusupova Dilnoza', $person->name);
        $this->assertSame($this->tenant->id, $person->tenant_id);
        $this->assertTrue($person->hasRole('waiter'));
        // A placeholder that can never receive mail, and says so in its TLD.
        $this->assertSame('emp-0001@staff.omad-manti.invalid', $person->email);

        // The PIN is real: the same digits open the door the crew app uses.
        $this->assertSame(PinCredentials::OK, app(PinCredentials::class)->verify($person->id, $pin)['status']);
        // And the server keeps only a hash of it.
        $this->assertDatabaseMissing('user_pins', ['pin_hash' => $pin]);
    }

    /** A manager's position is the one that works as a branch manager, not as a waiter. */
    public function test_the_role_follows_the_position(): void
    {
        $this->postJson('/api/v1/staff/members', [
            'first_name' => 'Nodira', 'last_name' => 'Aliyeva', 'position' => 'manager',
        ], ['X-Tenant' => $this->tenant->slug])->assertCreated();

        $person = User::query()->findOrFail(StaffMember::query()->firstOrFail()->user_id);
        $this->assertTrue($person->hasRole('branch-manager'));
        $this->assertFalse($person->hasRole('waiter'));
    }

    /**
     * Somebody hired before logins came with hiring, and somebody who forgot
     * their PIN: one endpoint for both, and the old PIN stops working.
     */
    public function test_a_login_can_be_opened_later_and_the_pin_rotated(): void
    {
        $member = StaffMember::factory()->create([
            'tenant_id' => $this->tenant->id,
            'branch_id' => $this->branch->id,
            'position' => 'cook',
            'user_id' => null,
        ]);

        $first = $this->postJson("/api/v1/staff/members/{$member->id}/login", [], ['X-Tenant' => $this->tenant->slug])
            ->assertCreated()
            ->assertJsonPath('created', true);

        $userId = (int) $first->json('data.user_id');
        $pinA = (string) $first->json('pin');
        $this->assertTrue(User::query()->findOrFail($userId)->hasRole('cook'));

        $second = $this->postJson("/api/v1/staff/members/{$member->id}/login", [], ['X-Tenant' => $this->tenant->slug])
            ->assertOk()
            ->assertJsonPath('created', false)
            ->assertJsonPath('data.user_id', $userId);

        $pinB = (string) $second->json('pin');
        $pins = app(PinCredentials::class);

        $this->assertSame(PinCredentials::OK, $pins->verify($userId, $pinB)['status']);
        $this->assertNotSame(PinCredentials::OK, $pins->verify($userId, $pinA)['status']);
    }

    /**
     * Letting somebody go shuts the door behind them — the account, their
     * tokens and the phone they paired. `is_active` alone guards only the
     * password door; a session that already exists has to be revoked.
     */
    public function test_letting_somebody_go_closes_their_login_and_their_phone(): void
    {
        $hired = $this->postJson('/api/v1/staff/members', [
            'first_name' => 'Bekzod', 'last_name' => 'Karimov', 'position' => 'waiter',
        ], ['X-Tenant' => $this->tenant->slug])->assertCreated();

        $memberId = (int) $hired->json('data.id');
        $person = User::query()->findOrFail((int) $hired->json('data.user_id'));
        $person->createToken('staff-app-1');

        $code = (string) $this->postJson('/api/v1/staff/devices/code', [
            'user_id' => $person->id, 'label' => 'Redmi',
        ], ['X-Tenant' => $this->tenant->slug])->assertCreated()->json('code');

        $this->app->make('auth')->forgetGuards();
        $this->postJson('/api/v1/staff/devices/pair', [
            'code' => $code, 'device_fingerprint' => 'handset-1',
        ])->assertCreated();

        $this->assertSame(1, StaffDevice::query()->where('user_id', $person->id)->where('status', 'active')->count());

        $this->app->make('auth')->forgetGuards();
        $this->actingAs(User::query()->role('owner')->firstOrFail());
        $this->deleteJson("/api/v1/staff/members/{$memberId}", [], ['X-Tenant' => $this->tenant->slug])->assertNoContent();

        $person->refresh();
        $this->assertFalse($person->is_active);
        $this->assertSame(0, $person->tokens()->count());
        $this->assertSame(0, StaffDevice::query()->where('user_id', $person->id)->where('status', 'active')->count());
        $this->assertSame(0, StaffDevice::query()->where('user_id', $person->id)->whereHas('tokens')->count());
    }

    /**
     * The two desk jobs the console's matrix names and nobody could hire.
     * An accountant signs in at the console, so the role must open that door.
     */
    public function test_an_accountant_and_an_operator_can_be_hired(): void
    {
        foreach (['accountant' => 'accountant', 'operator' => 'order-operator'] as $position => $role) {
            $answer = $this->postJson('/api/v1/staff/members', [
                'first_name' => ucfirst($position), 'last_name' => 'Rahimova', 'position' => $position,
            ], ['X-Tenant' => $this->tenant->slug])->assertCreated();

            $person = User::query()->findOrFail((int) $answer->json('data.user_id'));
            $this->assertTrue($person->hasRole($role), $position);
        }
    }

    /**
     * A desk position gets a console password, shown once beside the login
     * it will type — and that pair actually opens the console door.
     */
    public function test_a_desk_position_gets_a_console_password_that_signs_in(): void
    {
        $hired = $this->postJson('/api/v1/staff/members', [
            'first_name' => 'Sevara', 'last_name' => 'Qodirova', 'position' => 'accountant',
            'phone' => '+998901112233',
        ], ['X-Tenant' => $this->tenant->slug])->assertCreated();

        $memberId = (int) $hired->json('data.id');

        $issued = $this->postJson("/api/v1/staff/members/{$memberId}/password", [], ['X-Tenant' => $this->tenant->slug])
            ->assertOk()
            ->assertJsonPath('login', '+998901112233');

        $password = (string) $issued->json('password');
        $this->assertGreaterThanOrEqual(12, strlen($password));

        // The console door, with exactly what the manager read out.
        $this->app->make('auth')->forgetGuards();
        $this->postJson('/api/v1/auth/login', [
            'phone' => '+998901112233',
            'password' => $password,
            'device_name' => 'console',
        ], ['X-Tenant' => $this->tenant->slug])->assertOk();
    }

    /** A waiter never types a console password, so one is never issued for them. */
    public function test_a_floor_position_is_refused_a_console_password(): void
    {
        $hired = $this->postJson('/api/v1/staff/members', [
            'first_name' => 'Bekzod', 'last_name' => 'Karimov', 'position' => 'waiter',
        ], ['X-Tenant' => $this->tenant->slug])->assertCreated();

        $this->postJson('/api/v1/staff/members/'.$hired->json('data.id').'/password', [], ['X-Tenant' => $this->tenant->slug])
            ->assertStatus(422)
            ->assertJsonPath('error.code', 'staff.not_a_desk_position');
    }

    /** A promotion is a promotion now, not at the next PIN rotation. */
    public function test_changing_the_position_changes_the_role_at_once(): void
    {
        $hired = $this->postJson('/api/v1/staff/members', [
            'first_name' => 'Aziz', 'last_name' => 'Karimov', 'position' => 'cook',
        ], ['X-Tenant' => $this->tenant->slug])->assertCreated();

        $memberId = (int) $hired->json('data.id');
        $person = User::query()->findOrFail((int) $hired->json('data.user_id'));
        $this->assertTrue($person->hasRole('cook'));

        $this->patchJson("/api/v1/staff/members/{$memberId}", ['position' => 'chef'], ['X-Tenant' => $this->tenant->slug])
            ->assertOk();

        $person->refresh();
        $this->assertTrue($person->hasRole('chef'));
        $this->assertFalse($person->hasRole('cook'));
    }

    public function test_the_generated_codes_do_not_repeat(): void
    {
        $codes = [];

        foreach (['Aziz', 'Bekzod', 'Charos'] as $name) {
            $codes[] = $this->postJson('/api/v1/staff/members', [
                'first_name' => $name,
                'last_name' => 'Karimov',
                'position' => 'cook',
            ], ['X-Tenant' => $this->tenant->slug])->assertCreated()->json('data.employee_code');
        }

        $this->assertSame(['EMP-0001', 'EMP-0002', 'EMP-0003'], $codes);
        $this->assertSame(3, StaffMember::query()->count());
    }

    public function test_it_steps_over_a_code_the_restaurant_typed_itself(): void
    {
        // A restaurant with its own numbering hired somebody as EMP-0001
        // before the counter ever ran; the next generated code must not
        // collide with it and lose the row to the unique index.
        StaffMember::factory()->create([
            'tenant_id' => $this->tenant->id,
            'branch_id' => $this->branch->id,
            'employee_code' => 'EMP-0001',
        ]);

        $code = $this->postJson('/api/v1/staff/members', [
            'first_name' => 'Nodira',
            'last_name' => 'Aliyeva',
            'position' => 'manager',
        ], ['X-Tenant' => $this->tenant->slug])->assertCreated()->json('data.employee_code');

        $this->assertNotSame('EMP-0001', $code);
        $this->assertSame(2, StaffMember::query()->count());
    }

    public function test_a_restaurant_with_its_own_scheme_still_sends_one(): void
    {
        $this->postJson('/api/v1/staff/members', [
            'employee_code' => 'OSH-77',
            'first_name' => 'Jasur',
            'last_name' => 'Rahimov',
            'position' => 'chef',
        ], ['X-Tenant' => $this->tenant->slug])
            ->assertCreated()
            ->assertJsonPath('data.employee_code', 'OSH-77');
    }

    public function test_the_job_has_to_be_one_the_rota_understands(): void
    {
        $this->postJson('/api/v1/staff/members', [
            'first_name' => 'Kimdir',
            'last_name' => 'Kimsan',
            'position' => 'astronaut',
        ], ['X-Tenant' => $this->tenant->slug])
            ->assertStatus(422)
            ->assertJsonPath('error.code', 'request.validation_failed');
    }
}
