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
use Illuminate\Support\Carbon;
use Illuminate\Testing\TestResponse;
use Modules\Tables\Models\BookingWindow;
use Modules\Tables\Models\Reservation;
use Tests\TestCase;

/**
 * When a venue takes bookings, and what a guest may do with their own.
 *
 * Two features that only make sense together. Booking windows are what stop the
 * website offering 04:30 on a Tuesday — until now the endpoint accepted any
 * instant inside ninety days, and the only thing preventing a table being held
 * was a person reading the request and ringing back. That call is one the
 * restaurant pays for, about a slot it should never have offered.
 *
 * The guest's code is the other half, and commercially the more valuable one: a
 * guest who cannot call a booking off from their phone rings a room that is busy
 * serving dinner, which in practice means nobody rings. The table stays held for
 * a party that is not coming.
 */
final class BookingWindowTest extends TestCase
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

        $this->branch = Branch::factory()->create([
            'tenant_id' => $this->tenant->id,
            'status' => 'active',
        ]);
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

    /** Tomorrow, at a whole hour, on the venue's own clock. */
    private function tomorrowAt(int $hour, int $minute = 0): Carbon
    {
        return Carbon::now()->addDay()->setTime($hour, $minute, 0);
    }

    private function windowForTomorrow(int $capacity = 20, string $opens = '12:00', string $closes = '23:00'): BookingWindow
    {
        app(TenantContext::class)->set($this->tenant);

        return BookingWindow::create([
            'tenant_id' => $this->tenant->id,
            'branch_id' => $this->branch->id,
            'weekday' => $this->tomorrowAt(12)->isoWeekday(),
            'opens_at' => $opens,
            'closes_at' => $closes,
            'slot_minutes' => 30,
            'capacity' => $capacity,
            'is_active' => true,
        ]);
    }

    /**
     * @param array<string, mixed> $over
     */
    private function book(array $over = []): TestResponse
    {
        return $this->withHeaders([
            'X-Tenant' => $this->tenant->slug,
            'Accept' => 'application/json',
        ])->postJson('/api/v1/public/reservations', [
            'guest_name' => 'Dilnoza Aliyeva',
            'guest_phone' => '+998 90 123 45 67',
            'guests_count' => 4,
            'branch_id' => $this->branch->id,
            'starts_at' => $this->tomorrowAt(19)->toIso8601String(),
            ...$over,
        ]);
    }

    // ============ The branch a guest chose ============

    public function test_a_guest_can_finally_say_which_venue(): void
    {
        // The form has drawn a chooser since it was designed and had nowhere to
        // send the answer — it wrote "Filial: Sergeli" into the free-text note.
        $answer = $this->book()->assertCreated();

        $this->assertSame($this->branch->id, $answer->json('data.branch_id'));
        $this->assertSame($this->branch->id, Reservation::query()->first()?->branch_id);
    }

    public function test_a_venue_that_is_not_this_restaurants_is_refused(): void
    {
        $other = Tenant::query()->create([
            'name' => 'Lagmon', 'slug' => 'lagmon-uyi', 'country_code' => 'UZ',
            'locale' => 'uz', 'timezone' => 'Asia/Tashkent', 'status' => 'active',
        ]);
        $theirs = Branch::factory()->create(['tenant_id' => $other->id]);

        app(TenantContext::class)->set($this->tenant);

        $this->book(['branch_id' => $theirs->id])->assertStatus(422);
    }

    // ============ Windows ============

    public function test_a_slot_the_venue_offers_is_taken(): void
    {
        $this->windowForTomorrow();

        $this->book(['starts_at' => $this->tomorrowAt(19)->toIso8601String()])->assertCreated();
    }

    public function test_an_hour_the_venue_is_dark_for_is_refused(): void
    {
        $this->windowForTomorrow();

        $refusal = $this->book(['starts_at' => $this->tomorrowAt(4, 30)->toIso8601String()])
            ->assertStatus(422);

        $this->assertSame('tables.slot_unavailable', $refusal->json('error.code'));
    }

    public function test_a_time_between_slots_is_refused(): void
    {
        $this->windowForTomorrow();

        // 19:10 is inside the window and is not one of its half hours. A booking
        // at a time the chooser never drew is a booking nobody planned for.
        $this->book(['starts_at' => $this->tomorrowAt(19, 10)->toIso8601String()])
            ->assertStatus(422);
    }

    public function test_a_full_slot_stops_taking_covers(): void
    {
        $this->windowForTomorrow(capacity: 6);

        $this->book(['guests_count' => 4])->assertCreated();

        // Four are held; a party of four cannot have the remaining two seats.
        // A different phone number, or the duplicate belt answers first.
        $refusal = $this->book([
            'guest_phone' => '+998 90 999 88 77',
            'guests_count' => 4,
        ])->assertStatus(422);

        $this->assertSame('tables.slot_unavailable', $refusal->json('error.code'));

        // And the two that DO fit are still bookable.
        $this->book(['guest_phone' => '+998 90 777 66 55', 'guests_count' => 2])->assertCreated();
    }

    public function test_a_cancelled_booking_gives_its_covers_back(): void
    {
        $this->windowForTomorrow(capacity: 4);

        $code = (string) $this->book(['guests_count' => 4])->assertCreated()->json('data.code');

        $this->book(['guest_phone' => '+998 90 999 88 77', 'guests_count' => 4])->assertStatus(422);

        $this->guest()->postJson("/api/v1/public/reservations/{$code}/cancel")->assertOk();

        // The slot is back on the chooser before the guest has put the phone
        // down — the whole commercial point of a cancel link.
        $this->book(['guest_phone' => '+998 90 999 88 77', 'guests_count' => 4])->assertCreated();
    }

    public function test_a_venue_with_no_windows_takes_anything(): void
    {
        // Windows are a feature a restaurant switches on by filling them in, and
        // every restaurant on the platform has none until somebody does.
        // Refusing every booking until then is a feature that looks like an
        // outage.
        $this->book(['starts_at' => $this->tomorrowAt(4, 30)->toIso8601String()])->assertCreated();
    }

    // ============ The chooser ============

    private function guest(): self
    {
        return $this->withHeaders([
            'X-Tenant' => $this->tenant->slug,
            'Accept' => 'application/json',
        ]);
    }

    public function test_the_public_chooser_lists_the_times_and_never_the_figures(): void
    {
        $this->windowForTomorrow(capacity: 10, opens: '18:00', closes: '20:00');

        $day = $this->tomorrowAt(12)->format('Y-m-d');

        $slots = $this->guest()
            ->getJson("/api/v1/public/booking-slots?branch_id={$this->branch->id}&date={$day}")
            ->assertOk()
            ->json('data');

        // 18:00, 18:30, 19:00, 19:30 — the last slot STARTS before closing.
        $this->assertCount(4, $slots);
        $this->assertTrue($slots[0]['available']);

        // Availability only. How many covers are left would let anybody outside
        // the building watch a restaurant's evening fill up.
        $this->assertSame(['at', 'available'], array_keys($slots[0]));
    }

    public function test_the_chooser_answers_for_the_party_that_is_asking(): void
    {
        $this->windowForTomorrow(capacity: 4, opens: '18:00', closes: '19:00');
        $day = $this->tomorrowAt(12)->format('Y-m-d');

        $forTwo = $this->guest()
            ->getJson("/api/v1/public/booking-slots?branch_id={$this->branch->id}&date={$day}&guests=2")
            ->assertOk()->json('data');
        $forSix = $this->guest()
            ->getJson("/api/v1/public/booking-slots?branch_id={$this->branch->id}&date={$day}&guests=6")
            ->assertOk()->json('data');

        $this->assertTrue($forTwo[0]['available']);
        // A chooser that ignored party size would offer a guest of six a time
        // the endpoint then refuses.
        $this->assertFalse($forSix[0]['available']);
    }

    // ============ The guest's own booking ============

    public function test_a_guest_reads_confirms_and_cancels_with_their_code(): void
    {
        $code = (string) $this->book()->assertCreated()->json('data.code');

        $this->assertSame(10, strlen($code));

        $read = $this->guest()->getJson("/api/v1/public/reservations/{$code}")->assertOk();
        $this->assertSame('pending', $read->json('data.status'));
        $this->assertFalse($read->json('data.confirmed'));
        $this->assertTrue($read->json('data.cancellable'));

        $this->guest()->postJson("/api/v1/public/reservations/{$code}/confirm")->assertOk()
            ->assertJsonPath('data.confirmed', true);

        $this->guest()->postJson("/api/v1/public/reservations/{$code}/cancel")->assertOk()
            ->assertJsonPath('data.status', 'cancelled');
    }

    public function test_the_code_is_read_however_the_guest_typed_it(): void
    {
        $code = (string) $this->book()->assertCreated()->json('data.code');

        // Printed in capitals, typed on a keyboard that is not. A lookup that
        // failed on case would be a booking that "does not exist" in front of a
        // person holding it.
        $this->guest()->getJson('/api/v1/public/reservations/'.strtolower($code))->assertOk();
    }

    public function test_a_code_from_another_restaurant_is_simply_not_found(): void
    {
        $code = (string) $this->book()->assertCreated()->json('data.code');

        $other = Tenant::query()->create([
            'name' => 'Lagmon', 'slug' => 'lagmon-uyi', 'country_code' => 'UZ',
            'locale' => 'uz', 'timezone' => 'Asia/Tashkent', 'status' => 'active',
        ]);

        // The uniqueness index is platform-wide; the model's scope is what
        // refuses this, and the answer is 404 rather than "not yours" — the two
        // together would be an oracle.
        $this->withHeaders(['X-Tenant' => $other->slug, 'Accept' => 'application/json'])
            ->getJson("/api/v1/public/reservations/{$code}")
            ->assertNotFound();
    }

    public function test_a_seated_party_cannot_be_cancelled_from_outside_the_building(): void
    {
        $code = (string) $this->book()->assertCreated()->json('data.code');

        app(TenantContext::class)->set($this->tenant);
        Reservation::query()->where('code', $code)->update(['status' => 'seated']);

        $this->guest()->postJson("/api/v1/public/reservations/{$code}/cancel")
            ->assertApiError('tables.reservation_closed');
    }

    // ============ The back office ============

    public function test_a_manager_writes_the_windows_and_a_waiter_reads_them(): void
    {
        $this->signIn('branch-manager');

        $created = $this->postJson('/api/v1/tables/booking-windows', [
            'branch_id' => $this->branch->id,
            'weekday' => 5,
            'opens_at' => '18:00',
            'closes_at' => '23:00',
            'slot_minutes' => 30,
            'capacity' => 24,
        ])->assertCreated();

        $this->assertSame(5, $created->json('data.weekday'));
        $this->assertSame('18:00', $created->json('data.opens_at'));

        $this->signIn('waiter');
        $this->getJson('/api/v1/tables/booking-windows')->assertOk()->assertJsonCount(1, 'data');
    }

    public function test_a_waiter_cannot_change_when_the_venue_opens(): void
    {
        $this->signIn('waiter');

        $this->postJson('/api/v1/tables/booking-windows', [
            'branch_id' => $this->branch->id,
            'weekday' => 5,
            'opens_at' => '18:00',
            'closes_at' => '23:00',
        ])->assertForbidden();
    }

    public function test_a_slot_longer_than_four_hours_is_not_a_slot(): void
    {
        $this->signIn('branch-manager');

        $this->postJson('/api/v1/tables/booking-windows', [
            'branch_id' => $this->branch->id,
            'weekday' => 5,
            'opens_at' => '18:00',
            'closes_at' => '23:00',
            'slot_minutes' => 600,
        ])->assertStatus(422);
    }

    public function test_another_restaurants_windows_are_invisible(): void
    {
        $other = Tenant::query()->create([
            'name' => 'Lagmon', 'slug' => 'lagmon-uyi', 'country_code' => 'UZ',
            'locale' => 'uz', 'timezone' => 'Asia/Tashkent', 'status' => 'active',
        ]);
        $theirBranch = Branch::factory()->create(['tenant_id' => $other->id]);

        BookingWindow::create([
            'tenant_id' => $other->id,
            'branch_id' => $theirBranch->id,
            'weekday' => 5, 'opens_at' => '18:00', 'closes_at' => '23:00',
            'slot_minutes' => 30, 'capacity' => 10, 'is_active' => true,
        ]);

        app(TenantContext::class)->set($this->tenant);
        $this->signIn('branch-manager');

        $this->getJson('/api/v1/tables/booking-windows')->assertOk()->assertJsonCount(0, 'data');
    }
}
