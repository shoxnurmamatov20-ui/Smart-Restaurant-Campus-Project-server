<?php

declare(strict_types=1);

namespace Modules\Staff\Tests\Feature;

use App\Models\Branch;
use App\Models\Tenant;
use App\Models\User;
use App\Models\UserPin;
use App\Support\Auth\PinCredentials;
use App\Support\Tenancy\TenantContext;
use Database\Seeders\RolesAndPermissionsSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Testing\TestResponse;
use Modules\Staff\Models\StaffDevice;
use Tests\TestCase;

/**
 * A waiter signing into the staff app on their own phone.
 *
 * The whole security model is two credentials in one order, and every test here
 * is about that order holding:
 *
 *   **The device says whose phone it is.** Enrolled once, by a manager reading
 *   eight characters aloud. It can do exactly one thing — offer a PIN — so a
 *   phone left on a bus signs in as nobody.
 *
 *   **The PIN says they are the one holding it.** Four digits against a person
 *   the server has already identified, which is the only arrangement where four
 *   digits mean anything: with 200 people enrolled, a PIN that also had to
 *   identify would land on *somebody* once in fifty guesses.
 *
 * The lockout is shared with the till, and that is tested here rather than taken
 * on trust — it is the reason the PIN moved out of `Modules/Pos` into core.
 */
final class StaffAppSignInTest extends TestCase
{
    use RefreshDatabase;

    private Tenant $tenant;

    private User $manager;

    private User $waiter;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(RolesAndPermissionsSeeder::class);

        $this->tenant = Tenant::query()->create([
            'name' => 'Osh Markazi', 'slug' => 'osh-markazi', 'country_code' => 'UZ',
            'locale' => 'uz', 'timezone' => 'Asia/Tashkent', 'status' => 'active',
        ]);
        app(TenantContext::class)->set($this->tenant);

        Branch::factory()->create(['tenant_id' => $this->tenant->id, 'code' => 'CHILONZOR']);

        $this->manager = User::factory()->create(['tenant_id' => $this->tenant->id]);
        $this->manager->assignRole('branch-manager');

        $this->waiter = User::factory()->create(['tenant_id' => $this->tenant->id]);
        $this->waiter->assignRole('waiter');

        app(PinCredentials::class)->set($this->waiter, '4821');
    }

    /**
     * Forget the principal the last request resolved.
     *
     * `RequestGuard::user()` memoises what it found, and the container survives
     * between requests inside one test — so a second request reuses the first
     * one's answer and ignores its own `Authorization` header. Every other test
     * in the suite uses one token throughout and never notices; this file is the
     * only one that deliberately switches principal mid-test, because that is
     * the flow under test: a manager issues a code over HTTP, then the phone
     * presents its own device token.
     *
     * Left here rather than moved into `Tests\TestCase::call()`. Doing it for
     * every request looks like the general fix and is not: `actingAs()` sets the
     * user *on* the guard, so forgetting guards before each request throws that
     * user away — measured, and it turned a green suite into 298 failures.
     *
     * Not a product bug either way. php-fpm builds a fresh container per
     * request; only the harness holds one open.
     */
    private function forgetWhoWasHere(): void
    {
        $this->app->make('auth')->forgetGuards();
    }

    private function asManager(): self
    {
        $this->forgetWhoWasHere();

        return $this->withHeaders([
            'Authorization' => 'Bearer '.$this->manager->createToken('test')->plainTextToken,
            'X-Tenant' => $this->tenant->slug,
            'Accept' => 'application/json',
        ]);
    }

    private function asDevice(string $token): self
    {
        $this->forgetWhoWasHere();

        return $this->withHeaders([
            'Authorization' => 'Bearer '.$token,
            'X-Tenant' => $this->tenant->slug,
            'Accept' => 'application/json',
        ]);
    }

    /** A manager issues a code and the phone redeems it. Returns the device token. */
    private function enrol(?User $employee = null): string
    {
        $code = $this->asManager()->postJson('/api/v1/staff/devices/code', [
            'user_id' => ($employee ?? $this->waiter)->id,
            'label' => 'iPhone 13',
            'branch_code' => 'CHILONZOR',
        ])->assertCreated()->json('code');

        return (string) $this->pair((string) $code)->assertCreated()->json('token');
    }

    private function pair(string $code): TestResponse
    {
        $this->forgetWhoWasHere();

        return $this->postJson('/api/v1/staff/devices/pair', [
            'code' => $code,
            'device_fingerprint' => 'test-handset',
            'app_version' => '1.0.0',
        ]);
    }

    // ============ Enrolling ============

    /**
     * The phone reading its own enrolment, before anybody has signed in.
     *
     * The sign-in screen prints one line above the keypad — which branch and
     * which handset — and it used to print a fixture: the demo's "Chilonzor
     * filiali · POS-3", on every phone in the country. The line exists so a
     * person can check they are in the right back office before typing, so a
     * line that is right for one restaurant and wrong for the rest is worse
     * than no line at all.
     */
    public function test_a_phone_can_read_its_own_enrolment(): void
    {
        $token = $this->enrol();

        $this->asDevice($token)->getJson('/api/v1/staff/devices/me')
            ->assertOk()
            ->assertJsonPath('data.label', 'iPhone 13')
            ->assertJsonPath('data.branch_code', 'CHILONZOR')
            ->assertJsonPath('data.is_paired', true);
    }

    /**
     * Anything that is not an enrolled handset gets nothing, a person included.
     *
     * 403 rather than 404: `staff.device_required` is the catalogue's answer for
     * "you are authenticated, and not as a device", which is what a manager's
     * browser hitting this route is.
     */
    public function test_a_person_is_not_a_handset(): void
    {
        $this->asManager()->getJson('/api/v1/staff/devices/me')
            ->assertStatus(403)
            ->assertJsonPath('error.code', 'staff.device_required');
    }

    public function test_a_manager_hands_out_a_code_that_is_shown_once(): void
    {
        $answer = $this->asManager()->postJson('/api/v1/staff/devices/code', [
            'user_id' => $this->waiter->id,
            'label' => 'iPhone 13',
            'branch_code' => 'CHILONZOR',
        ])->assertCreated();

        $code = (string) $answer->json('code');

        // Eight characters a manager can read across a room: no I, O, 0 or 1.
        $this->assertSame(8, mb_strlen($code));
        $this->assertMatchesRegularExpression('/^[ABCDEFGHJKLMNPQRSTUVWXYZ2-9]{8}$/', $code);

        // Only a hash is kept. For the ten minutes it lives, the code is a
        // bearer credential, and a plaintext column is a list of working keys.
        $stored = StaffDevice::query()->where('user_id', $this->waiter->id)->first();
        $this->assertNotNull($stored);
        $this->assertNotSame($code, $stored->pairing_code_hash);
    }

    public function test_a_code_for_somebody_elses_employee_is_refused_by_name(): void
    {
        $elsewhere = Tenant::query()->create([
            'name' => 'Boshqa', 'slug' => 'boshqa', 'country_code' => 'UZ',
            'locale' => 'uz', 'timezone' => 'Asia/Tashkent', 'status' => 'active',
        ]);
        $theirs = User::factory()->create(['tenant_id' => $elsewhere->id]);

        $this->asManager()->postJson('/api/v1/staff/devices/code', [
            'user_id' => $theirs->id,
            'label' => 'iPhone',
        ])->assertApiError('staff.employee_unknown');
    }

    public function test_a_waiter_cannot_enrol_their_own_phone(): void
    {
        /*
         * Handing out a credential that signs in as a person is a manager's act.
         * A waiter who could issue their own code could issue anybody's.
         */
        $this->withHeaders([
            'Authorization' => 'Bearer '.$this->waiter->createToken('test')->plainTextToken,
            'X-Tenant' => $this->tenant->slug,
            'Accept' => 'application/json',
        ])->postJson('/api/v1/staff/devices/code', [
            'user_id' => $this->waiter->id,
            'label' => 'iPhone',
        ])->assertForbidden();
    }

    public function test_a_code_pairs_exactly_one_phone(): void
    {
        $code = (string) $this->asManager()->postJson('/api/v1/staff/devices/code', [
            'user_id' => $this->waiter->id, 'label' => 'iPhone',
        ])->assertCreated()->json('code');

        $this->pair($code)->assertCreated();

        // The second attempt finds nothing: redemption clears the code inside
        // the same transaction that mints the token.
        $this->pair($code)->assertStatus(422);
    }

    public function test_an_expired_code_is_refused(): void
    {
        $code = (string) $this->asManager()->postJson('/api/v1/staff/devices/code', [
            'user_id' => $this->waiter->id, 'label' => 'iPhone',
        ])->assertCreated()->json('code');

        $this->travel(11)->minutes();

        $this->pair($code)->assertStatus(422);
    }

    public function test_re_enrolling_kills_the_old_phone_at_once(): void
    {
        $first = $this->enrol();

        // The waiter lost the handset and the manager issues a new code. The
        // lost phone must stop working now, not when somebody finishes typing.
        $this->asManager()->postJson('/api/v1/staff/devices/code', [
            'user_id' => $this->waiter->id, 'label' => 'Yangi telefon',
        ])->assertCreated();

        $this->asDevice($first)->postJson('/api/v1/staff/auth/pin', ['pin' => '4821'])
            ->assertUnauthorized();
    }

    // ============ Signing in ============

    public function test_the_right_pin_on_an_enrolled_phone_signs_the_person_in(): void
    {
        $device = $this->enrol();

        $answer = $this->asDevice($device)
            ->postJson('/api/v1/staff/auth/pin', ['pin' => '4821'])
            ->assertCreated();

        $this->assertNotEmpty($answer->json('token'));
        $this->assertSame($this->waiter->id, $answer->json('person.id'));
        $this->assertContains('waiter', (array) $answer->json('person.roles'));
        $this->assertSame('CHILONZOR', $answer->json('device.branch_code'));
    }

    public function test_the_wrong_pin_says_only_that_it_is_wrong(): void
    {
        $device = $this->enrol();

        $this->asDevice($device)->postJson('/api/v1/staff/auth/pin', ['pin' => '0000'])
            ->assertApiError('staff.pin_invalid');
    }

    public function test_the_body_cannot_name_a_different_person(): void
    {
        $device = $this->enrol();
        $owner = User::factory()->create(['tenant_id' => $this->tenant->id]);
        $owner->assignRole('owner');
        app(PinCredentials::class)->set($owner, '1111');

        /*
         * The device token says whose phone this is, and the body has no say.
         * A `user_id` here would let a phone enrolled to a dishwasher try PINs
         * against the owner's account — which is exactly what this sends.
         */
        $answer = $this->asDevice($device)->postJson('/api/v1/staff/auth/pin', [
            'pin' => '1111',
            'user_id' => $owner->id,
        ]);

        $answer->assertApiError('staff.pin_invalid');
    }

    public function test_a_user_token_cannot_be_used_as_a_device_token(): void
    {
        /*
         * A person's own token reaching the PIN exchange would be a waiter
         * signing themselves in from a browser with no enrolled phone at all —
         * which removes the first of the two credentials.
         */
        $this->withHeaders([
            'Authorization' => 'Bearer '.$this->waiter->createToken('test')->plainTextToken,
            'X-Tenant' => $this->tenant->slug,
            'Accept' => 'application/json',
        ])->postJson('/api/v1/staff/auth/pin', ['pin' => '4821'])
            ->assertApiError('staff.device_required');
    }

    public function test_the_pin_pad_is_not_a_way_to_ask_who_still_works_here(): void
    {
        $device = $this->enrol();

        /*
         * The employee moved to another restaurant in the group while the phone
         * kept its token. A correct PIN has to get the same answer as a wrong
         * one — three answers would be three ways to ask, from a keypad anybody
         * who has picked the phone up can reach.
         *
         * Moved rather than deleted, and the distinction is worth keeping: a
         * deleted account takes its device row and its PIN with it (both cascade
         * from `users`), so the phone's token stops resolving at all and the
         * refusal is a 401 from Sanctum rather than anything this controller
         * decides. That is correct behaviour and a different test.
         */
        $elsewhere = Tenant::query()->create([
            'name' => 'Ikkinchi', 'slug' => 'ikkinchi', 'country_code' => 'UZ',
            'locale' => 'uz', 'timezone' => 'Asia/Tashkent', 'status' => 'active',
        ]);

        $this->waiter->forceFill(['tenant_id' => $elsewhere->id])->save();

        $this->asDevice($device)->postJson('/api/v1/staff/auth/pin', ['pin' => '4821'])
            ->assertApiError('staff.pin_invalid');
    }

    public function test_a_deleted_employee_takes_their_phones_enrolment_with_them(): void
    {
        $device = $this->enrol();

        // `staff.devices.user_id` and `user_pins.user_id` both cascade from
        // `users`, so sacking somebody revokes their phone in the same
        // statement — no separate step for a manager to forget.
        $this->waiter->delete();

        $this->asDevice($device)->postJson('/api/v1/staff/auth/pin', ['pin' => '4821'])
            ->assertUnauthorized();

        $this->assertSame(0, StaffDevice::query()->withoutGlobalScopes()->count());
    }

    // ============ The lockout, shared with the till ============

    public function test_five_wrong_tries_shut_the_door(): void
    {
        $device = $this->enrol();

        for ($try = 0; $try < 5; $try++) {
            $this->asDevice($device)->postJson('/api/v1/staff/auth/pin', ['pin' => '0000']);
        }

        $answer = $this->asDevice($device)
            ->postJson('/api/v1/staff/auth/pin', ['pin' => '4821'])
            ->assertApiError('staff.pin_locked');

        // Minutes rather than a sentence: the client holds three languages.
        $this->assertGreaterThan(0, (int) $answer->json('error.retry_after_minutes'));
    }

    public function test_the_phones_wrong_tries_count_against_the_till_too(): void
    {
        $device = $this->enrol();

        for ($try = 0; $try < 5; $try++) {
            $this->asDevice($device)->postJson('/api/v1/staff/auth/pin', ['pin' => '0000']);
        }

        /*
         * The reason the PIN moved out of `Modules/Pos` and into core.
         *
         * Two counters would mean ten guesses against a four-digit secret
         * instead of five — and the phone is the surface somebody can walk away
         * with. One row, one lockout, both doors shut.
         */
        $credential = UserPin::query()->where('user_id', $this->waiter->id)->first();

        $this->assertNotNull($credential);
        $this->assertTrue($credential->is_locked);
    }

    public function test_a_correct_pin_that_cannot_be_used_does_not_reset_the_counter(): void
    {
        $device = $this->enrol();

        $this->asDevice($device)->postJson('/api/v1/staff/auth/pin', ['pin' => '0000']);
        $this->assertSame(1, UserPin::query()->where('user_id', $this->waiter->id)->value('failed_attempts'));

        /*
         * Right digits, unusable account. Clearing the counter here would let
         * somebody who has guessed the PIN hold the lockout at zero forever by
         * signing in, failing the tenant check, and starting again.
         *
         * Moved rather than deleted, because a deleted employee takes the PIN
         * row with it and there would be no counter left to assert on.
         */
        $elsewhere = Tenant::query()->create([
            'name' => 'Ikkinchi', 'slug' => 'ikkinchi', 'country_code' => 'UZ',
            'locale' => 'uz', 'timezone' => 'Asia/Tashkent', 'status' => 'active',
        ]);
        $this->waiter->forceFill(['tenant_id' => $elsewhere->id])->save();

        $this->asDevice($device)->postJson('/api/v1/staff/auth/pin', ['pin' => '4821']);

        $this->assertSame(1, UserPin::query()->where('user_id', $this->waiter->id)->value('failed_attempts'));
    }

    // ============ Afterwards ============

    public function test_the_session_says_who_is_signed_in(): void
    {
        $device = $this->enrol();
        $token = (string) $this->asDevice($device)
            ->postJson('/api/v1/staff/auth/pin', ['pin' => '4821'])->json('token');

        $this->asDevice($token)->getJson('/api/v1/staff/auth/session')
            ->assertOk()
            ->assertJsonPath('data.id', $this->waiter->id);
    }

    public function test_signing_out_keeps_the_phone_enrolled(): void
    {
        $device = $this->enrol();
        $token = (string) $this->asDevice($device)
            ->postJson('/api/v1/staff/auth/pin', ['pin' => '4821'])->json('token');

        $this->asDevice($token)->deleteJson('/api/v1/staff/auth/session')->assertOk();

        // The user token is dead...
        $this->asDevice($token)->getJson('/api/v1/staff/auth/session')->assertUnauthorized();

        /*
         * ...and the enrolment is not. Signing out at the end of a shift must
         * not mean finding a manager to re-enrol the phone at the start of the
         * next one, or nobody ever signs out.
         */
        $this->asDevice($device)->postJson('/api/v1/staff/auth/pin', ['pin' => '4821'])
            ->assertCreated();
    }
}
