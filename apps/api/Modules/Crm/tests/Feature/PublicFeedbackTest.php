<?php

declare(strict_types=1);

namespace Modules\Crm\Tests\Feature;

use App\Models\Branch;
use App\Models\Tenant;
use App\Models\User;
use App\Support\Tenancy\TenantContext;
use Database\Seeders\RolesAndPermissionsSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Testing\TestResponse;
use Modules\Crm\Models\Customer;
use Modules\Crm\Models\Feedback;
use Modules\Tables\Models\Hall;
use Modules\Tables\Models\RestaurantTable;
use Tests\TestCase;

/**
 * A review, from a guest who may have no account at all.
 *
 * Three screens post here and none can be made to sign in first — the QR
 * rating screen at a table, the customer app's problem sheet, and the same
 * sheet in the mobile app. So the first test is the important one: a complaint
 * form that demands an account collects fewer complaints, which shows up on a
 * dashboard as a better week.
 */
final class PublicFeedbackTest extends TestCase
{
    use RefreshDatabase;

    private Tenant $tenant;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(RolesAndPermissionsSeeder::class);

        $this->tenant = $this->restaurant('osh-xona');
        app(TenantContext::class)->set($this->tenant);
    }

    private function restaurant(string $slug): Tenant
    {
        return Tenant::query()->create([
            'name' => ucfirst($slug), 'slug' => $slug, 'country_code' => 'UZ',
            'locale' => 'uz', 'timezone' => 'Asia/Tashkent', 'status' => 'active',
        ]);
    }

    /** @param array<string, mixed> $body */
    private function leave(array $body = [], ?string $token = null): TestResponse
    {
        $headers = ['X-Tenant' => $this->tenant->slug, 'Accept' => 'application/json'];

        if ($token !== null) {
            $headers['Authorization'] = 'Bearer '.$token;
        }

        return $this->withHeaders($headers)->postJson('/api/v1/public/feedback', [
            'score' => 5,
            ...$body,
        ]);
    }

    // ============ No account needed ============

    public function test_a_guest_at_a_table_can_leave_a_review_with_no_account(): void
    {
        $this->leave(['score' => 4, 'comment' => 'Osh zo\'r edi', 'table_id' => 7, 'aspect' => 'food'])
            ->assertCreated()
            ->assertJsonPath('data.score', 4);

        $review = Feedback::query()->firstOrFail();
        $this->assertNull($review->customer_id);
        $this->assertSame(7, $review->table_id);
        // A table means it came from the QR sticker; nothing else could have
        // supplied one.
        $this->assertSame('qr', $review->source);
        $this->assertSame($this->tenant->id, $review->tenant_id);
    }

    /**
     * The sticker names the table, and the sticker carries a token.
     *
     * `table_id` above is the console's path — a manager typing a review in on
     * somebody's behalf, who does hold an id. A guest never has one and must
     * not: an id in a URL is a small integer, and the next small integer is
     * somebody else's table. The QR routes have taken `qr_token` since they
     * were written; the review form was the one that had not caught up, so
     * every real sticker sent nothing and the review arrived detached from the
     * table it was left at.
     *
     * Resolved through `App\Contracts\Tables\FloorBoard` because CRM may not
     * import the floor plan.
     */
    public function test_a_review_left_at_a_table_finds_it_by_the_printed_token(): void
    {
        $branch = Branch::factory()->create(['tenant_id' => $this->tenant->id]);
        $hall = Hall::factory()->create(['tenant_id' => $this->tenant->id, 'branch_id' => $branch->id]);
        $table = RestaurantTable::factory()->create([
            'tenant_id' => $this->tenant->id,
            'branch_id' => $branch->id,
            'hall_id' => $hall->id,
        ]);

        $this->leave(['score' => 5, 'table_token' => $table->qr_token])->assertCreated();

        $review = Feedback::query()->firstOrFail();
        $this->assertSame((int) $table->getKey(), $review->table_id);
        $this->assertSame('qr', $review->source);
    }

    /**
     * A token that resolves to nothing loses the table and keeps the review.
     *
     * A peeling sticker, a photograph of a photograph, a table that was
     * retired — all of them arrive here, and all of them are a guest who still
     * said the soup was cold. Refusing would lose the only part worth having.
     */
    public function test_an_unknown_token_loses_the_table_and_not_the_review(): void
    {
        $this->leave(['score' => 2, 'comment' => 'Sovuq', 'table_token' => str_repeat('z', 22)])
            ->assertCreated();

        $review = Feedback::query()->firstOrFail();
        $this->assertNull($review->table_id);
        // No table means it did not come off a sticker, whatever it claimed.
        $this->assertSame('web', $review->source);
    }

    public function test_a_signed_in_guests_review_lands_on_their_record(): void
    {
        $guest = Customer::factory()->create(['phone' => '+998901234567', 'name' => 'Dilnoza']);
        $token = $guest->createToken('test', ['customer'])->plainTextToken;

        $this->leave(['score' => 2, 'comment' => 'Sovuq keldi'], token: $token)->assertCreated();

        $review = Feedback::query()->firstOrFail();
        $this->assertSame($guest->id, $review->customer_id);
        // Their own details, so a manager ringing back needs one screen.
        $this->assertSame('+998901234567', $review->guest_phone);
        $this->assertSame('Dilnoza', $review->guest_name);
        $this->assertSame('web', $review->source);
    }

    public function test_an_expired_token_loses_the_attribution_and_not_the_review(): void
    {
        $guest = Customer::factory()->create(['phone' => '+998901234567']);
        $token = $guest->createToken('test', ['customer'], now()->subDay())->plainTextToken;

        // The comment is worth more than knowing who wrote it.
        $this->leave(['score' => 3, 'comment' => 'Yaxshi'], token: $token)->assertCreated();

        $this->assertNull(Feedback::query()->firstOrFail()->customer_id);
    }

    // ============ Urgency is decided here, never claimed ============

    public function test_a_one_star_reaches_a_manager_today(): void
    {
        $this->leave(['score' => 1, 'comment' => 'Juda yomon'])
            ->assertCreated()
            ->assertJsonPath('data.urgent', true);
    }

    public function test_an_allergy_is_urgent_whatever_the_score(): void
    {
        // The complaint in CrmFeedbackSeeder is a four-star with an allergic
        // reaction in it. A score-only rule leaves it unread until Monday.
        $this->leave([
            'score' => 4,
            'comment' => "Yong'oqqa allergiyam borligini aytgan edim, salatda yong'oq chiqdi.",
        ])
            ->assertCreated()
            ->assertJsonPath('data.urgent', true);
    }

    public function test_a_happy_review_is_not_urgent(): void
    {
        $this->leave(['score' => 5, 'comment' => 'Rahmat, hammasi zo\'r'])
            ->assertCreated()
            ->assertJsonPath('data.urgent', false);
    }

    public function test_a_client_cannot_jump_the_queue(): void
    {
        $this->leave([
            'score' => 5,
            'is_urgent' => true,
            'status' => 'resolved',
            'customer_id' => 999,
            'source' => 'aggregator',
        ])->assertCreated();

        $review = Feedback::query()->firstOrFail();
        $this->assertFalse($review->is_urgent);
        $this->assertSame('new', $review->status);
        $this->assertNull($review->customer_id);
        $this->assertSame('web', $review->source);
    }

    // ============ Validation, and what comes back ============

    public function test_a_score_outside_one_to_five_is_refused(): void
    {
        $this->leave(['score' => 0])->assertStatus(422);
        $this->leave(['score' => 6])->assertStatus(422);
    }

    public function test_the_answer_says_nothing_about_the_room(): void
    {
        Feedback::factory()->count(3)->create(['score' => 1]);

        $answer = $this->leave(['score' => 5])->assertCreated();

        // Not the average, not how many other one-stars there are this week: a
        // public endpoint that echoed the room's ratings back would be a
        // competitor's research tool with a feedback form attached.
        $this->assertSame(['id', 'score', 'urgent'], array_keys((array) $answer->json('data')));
    }

    public function test_a_review_is_scoped_to_the_restaurant_it_was_left_at(): void
    {
        $other = $this->restaurant('lagmon-uyi');

        $this->leave(['score' => 2])->assertCreated();

        app(TenantContext::class)->set($other);
        $this->assertSame(0, Feedback::query()->count());
    }

    // ============ It reaches the console screen ============

    public function test_a_manager_reads_it_on_the_crm_screen(): void
    {
        $this->leave(['score' => 1, 'comment' => 'Sovuq', 'order_number' => 'A-4471'])->assertCreated();

        $manager = User::factory()->create(['tenant_id' => $this->tenant->id]);
        $manager->assignRole('branch-manager');
        $this->actingAs($manager);

        $this->getJson('/api/v1/crm/feedbacks?filter[unresolved]=1')
            ->assertOk()
            ->assertJsonPath('data.0.score', 1)
            ->assertJsonPath('data.0.is_urgent', true)
            ->assertJsonPath('data.0.order_number', 'A-4471');
    }
}
