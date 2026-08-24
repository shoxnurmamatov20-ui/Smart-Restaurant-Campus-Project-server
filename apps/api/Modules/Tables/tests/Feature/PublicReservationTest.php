<?php

declare(strict_types=1);

namespace Modules\Tables\Tests\Feature;

use App\Models\Tenant;
use App\Support\Tenancy\TenantContext;
use Database\Seeders\RolesAndPermissionsSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Testing\TestResponse;
use Modules\Tables\Models\Reservation;
use Tests\TestCase;

/**
 * A stranger writing into a real restaurant's diary.
 *
 * This is the second thing on the platform anybody can write without signing
 * in, and the first that creates rows a manager has to deal with in the
 * morning. Every test here is about one of the three belts that make that
 * acceptable:
 *
 *   **It is a request, never a reservation.** Everything arrives `pending` and
 *   holds no table, so a flood costs a list to clear rather than a night's
 *   covers.
 *
 *   **A guest cannot choose what is not theirs to choose.** Not the table, not
 *   the status, not where the booking claims to have come from.
 *
 *   **One number, one live booking a day.** A second tap on a slow connection
 *   returns the first booking rather than making another.
 *
 * The fourth belt — five a minute per address — is the route's, and is not
 * asserted here: a test that fired six requests would be testing Laravel's
 * throttle rather than this endpoint, and would go flaky the day the suite runs
 * two of these files in the same minute.
 */
final class PublicReservationTest extends TestCase
{
    use RefreshDatabase;

    private Tenant $tenant;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(RolesAndPermissionsSeeder::class);

        $this->tenant = Tenant::query()->create([
            'name' => 'Osh Xona', 'slug' => 'osh-xona', 'country_code' => 'UZ',
            'locale' => 'uz', 'timezone' => 'Asia/Tashkent', 'status' => 'active',
        ]);
        app(TenantContext::class)->set($this->tenant);
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
            'starts_at' => now()->addDay()->setTime(19, 0)->toIso8601String(),
            ...$over,
        ]);
    }

    // ============ It works, and with no session ============

    public function test_a_guest_with_no_account_can_ask_for_a_table(): void
    {
        $answer = $this->book()->assertCreated();

        $this->assertSame('pending', $answer->json('data.status'));
        $this->assertFalse($answer->json('data.confirmed'));
        $this->assertSame(4, $answer->json('data.guests_count'));

        $booked = Reservation::query()->first();
        $this->assertNotNull($booked);
        $this->assertSame('Dilnoza Aliyeva', $booked->guest_name);
        $this->assertSame($this->tenant->id, $booked->tenant_id);
    }

    public function test_it_says_the_request_landed_rather_than_that_a_table_is_held(): void
    {
        /*
         * The site prints "we will ring you back", and `confirmed: false` is
         * what keeps that promise honest. A screen that read this as "booked"
         * would have a guest arriving on Friday expecting a table nobody
         * agreed to.
         */
        $this->assertFalse($this->book()->assertCreated()->json('data.confirmed'));
    }

    // ============ What a guest may not decide ============

    public function test_a_guest_cannot_confirm_their_own_booking(): void
    {
        $this->book(['status' => 'confirmed'])->assertCreated();

        // Confirming is a person looking at a diary. A request that could
        // arrive confirmed would be a booking nobody agreed to.
        $this->assertSame('pending', Reservation::query()->value('status'));
    }

    public function test_a_guest_cannot_claim_a_table(): void
    {
        $this->book(['restaurant_table_id' => 1])->assertCreated();

        /*
         * A form that let somebody hold table 12 for Friday is a form that lets
         * somebody hold every table for Friday. The restaurant seats them.
         */
        $this->assertNull(Reservation::query()->value('restaurant_table_id'));
    }

    public function test_a_booking_always_says_it_came_from_the_web(): void
    {
        $this->book(['source' => 'phone'])->assertCreated();

        // The whole value of this column is telling a manager where a booking
        // came from; a field the client fills in says whatever it likes.
        $this->assertSame('web', Reservation::query()->value('source'));
    }

    // ============ One number, one live booking a day ============

    public function test_a_second_tap_returns_the_first_booking(): void
    {
        $first = $this->book()->assertCreated();
        $again = $this->book()->assertOk();

        /*
         * 200 and not 201, and the same id.
         *
         * A guest who taps twice on a café's Wi-Fi has done nothing wrong, and
         * an error would send them to tap a third time. What they wanted has
         * already happened, so this says so.
         */
        $this->assertTrue($again->json('data.duplicate'));
        $this->assertSame($first->json('data.id'), $again->json('data.id'));
        $this->assertSame(1, Reservation::query()->count());
    }

    public function test_the_same_number_written_differently_is_still_the_same_number(): void
    {
        $this->book(['guest_phone' => '+998 90 123 45 67'])->assertCreated();
        $this->book(['guest_phone' => '+998-90-123-45-67'])->assertOk();
        $this->book(['guest_phone' => '+998901234567'])->assertOk();

        // Stored as written, these are three rows the duplicate check cannot
        // see — and three rows a manager rings the same person about.
        $this->assertSame(1, Reservation::query()->count());
        $this->assertSame('+998901234567', Reservation::query()->value('guest_phone'));
    }

    public function test_the_same_number_may_book_a_different_day(): void
    {
        $this->book()->assertCreated();
        $this->book(['starts_at' => now()->addDays(3)->setTime(19, 0)->toIso8601String()])
            ->assertCreated();

        // A regular booking Tuesday and Friday is a regular, not a duplicate.
        $this->assertSame(2, Reservation::query()->count());
    }

    public function test_a_cancelled_booking_does_not_block_a_new_one(): void
    {
        $this->book()->assertCreated();
        Reservation::query()->update(['status' => 'cancelled']);

        // They cancelled and changed their mind. Only a live booking blocks.
        $this->book()->assertCreated();
        $this->assertSame(2, Reservation::query()->count());
    }

    // ============ What is refused ============

    public function test_a_booking_in_the_past_is_refused(): void
    {
        $this->book(['starts_at' => now()->subHour()->toIso8601String()])->assertStatus(422);
    }

    public function test_a_booking_a_year_out_is_refused(): void
    {
        // Not a booking — a script, or a mistyped year. The copy says to call.
        $this->book(['starts_at' => now()->addYear()->toIso8601String()])->assertStatus(422);
    }

    public function test_a_party_of_eighty_is_told_to_telephone(): void
    {
        /*
         * The staff form allows two hundred because a manager books a wedding.
         * Eighty arriving through a web form with nobody spoken to is not a
         * booking, it is a problem.
         */
        $this->book(['guests_count' => 80])->assertStatus(422);
    }

    public function test_a_booking_with_no_telephone_number_is_refused(): void
    {
        // The restaurant confirms by ringing. A booking nobody can ring is a
        // table held for somebody who may not exist.
        $this->book(['guest_phone' => ''])->assertStatus(422);
    }

    public function test_a_booking_for_no_restaurant_is_refused(): void
    {
        $answer = $this->withHeaders(['Accept' => 'application/json'])
            ->postJson('/api/v1/public/reservations', [
                'guest_name' => 'Dilnoza Aliyeva',
                'guest_phone' => '+998901234567',
                'guests_count' => 2,
                'starts_at' => now()->addDay()->toIso8601String(),
            ]);

        /*
         * No `X-Tenant`. Tenancy is the only thing scoping this endpoint, so a
         * request without one must not land anywhere — a booking that belonged
         * to no restaurant would sit in a table nobody reads.
         */
        $this->assertNotSame(201, $answer->status());
        $this->assertSame(0, Reservation::query()->withoutGlobalScopes()->count());
    }
}
