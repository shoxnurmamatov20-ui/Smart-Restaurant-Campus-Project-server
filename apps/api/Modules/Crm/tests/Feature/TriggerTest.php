<?php

declare(strict_types=1);

namespace Modules\Crm\Tests\Feature;

use App\Contracts\Messaging\SmsDelivery;
use App\Contracts\Messaging\SmsSender;
use App\Models\Tenant;
use App\Models\User;
use Database\Seeders\RolesAndPermissionsSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Queue;
use Modules\Crm\Database\Seeders\CrmMarketingSeeder;
use Modules\Crm\Models\Campaign;
use Modules\Crm\Models\CampaignDelivery;
use Modules\Crm\Models\Customer;
use Modules\Crm\Models\Promotion;
use Modules\Crm\Models\Trigger;
use Modules\Crm\Models\TriggerSend;
use Tests\TestCase;

/**
 * Automated messages, and the guard that stops them repeating.
 *
 * The cooldown gets the most tests here because it is the rule with legal
 * teeth: a win-back that fires every morning is what gets a sender name blocked
 * by the regulator, and it is the one failure a screen cannot show — nobody
 * sees the second message except the person it goes to.
 */
final class TriggerTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(RolesAndPermissionsSeeder::class);

        // Nothing here should reach a real gateway; the campaign path has its
        // own tests for that.
        $this->app->bind(SmsSender::class, fn (): SmsSender => new class implements SmsSender
        {
            public function send(string $phone, string $text): SmsDelivery
            {
                return SmsDelivery::accepted('ref');
            }
        });
    }

    private function actingAsMarketer(): User
    {
        $user = User::factory()->create();
        $user->assignRole('marketer');
        $this->actingAs($user);

        return $user;
    }

    // ============ Auth & RBAC ============

    public function test_unauthenticated_user_cannot_read_triggers(): void
    {
        $this->getJson('/api/v1/crm/triggers')->assertStatus(401);
    }

    public function test_a_cook_cannot_read_triggers(): void
    {
        $user = User::factory()->create();
        $user->assignRole('cook');
        $this->actingAs($user);

        $this->getJson('/api/v1/crm/triggers')->assertStatus(403);
    }

    public function test_a_cashier_cannot_switch_an_automation_on(): void
    {
        $user = User::factory()->create();
        $user->assignRole('cashier');
        $this->actingAs($user);

        $trigger = Trigger::factory()->create();

        // The switch starts sending SMS to guests with nobody watching, so it
        // asks for `crm.manage` — which a cashier does not hold.
        $this->postJson("/api/v1/crm/triggers/{$trigger->id}/toggle")->assertStatus(403);
    }

    // ============ Writing one ============

    public function test_a_trigger_without_a_cooldown_is_refused(): void
    {
        $this->actingAsMarketer();

        $this->postJson('/api/v1/crm/triggers', [
            'key' => 'back',
            'kind' => 'win_back',
            'name' => ['uz' => 'Qaytarish xabari'],
            'body' => "Sizni sog'indik.",
            'cooldown_days' => 0,
        ])->assertStatus(422)->assertApiValidationErrors('cooldown_days');
    }

    public function test_a_new_trigger_is_switched_off(): void
    {
        $this->actingAsMarketer();

        $this->postJson('/api/v1/crm/triggers', [
            'key' => 'back',
            'kind' => 'win_back',
            'name' => ['uz' => 'Qaytarish xabari'],
            'body' => "Sizni sog'indik.",
        ])
            ->assertCreated()
            // An automation that started sending the moment it existed would
            // send its first run against a rule nobody had read back.
            ->assertJsonPath('data.is_active', false);
    }

    public function test_the_key_cannot_be_renamed(): void
    {
        $this->actingAsMarketer();
        $trigger = Trigger::factory()->create(['key' => 'back']);

        $this->patchJson("/api/v1/crm/triggers/{$trigger->id}", ['key' => 'boshqa'])->assertOk();

        // The console addresses a trigger by key and the cooldown history hangs
        // off its id; renaming would leave the screen pointing at nothing.
        $this->assertSame('back', $trigger->refresh()->key);
    }

    public function test_the_card_reports_this_months_sends_and_conversions(): void
    {
        $this->actingAsMarketer();

        $trigger = Trigger::factory()->active()->create();
        $guests = Customer::factory()->count(3)->create();

        TriggerSend::factory()->create(['trigger_id' => $trigger->id, 'customer_id' => $guests[0]->id]);
        TriggerSend::factory()->converted()->create(['trigger_id' => $trigger->id, 'customer_id' => $guests[1]->id]);
        // Last month: outside the window the card counts.
        TriggerSend::factory()->create(['trigger_id' => $trigger->id, 'customer_id' => $guests[2]->id])
            ->forceFill(['created_at' => now()->subMonths(2)])->save();

        $this->getJson('/api/v1/crm/triggers')
            ->assertOk()
            ->assertJsonPath('data.0.sent_this_month', 2)
            ->assertJsonPath('data.0.converted_this_month', 1)
            ->assertJsonPath('data.0.audience', 3);
    }

    // ============ The nightly pass ============

    public function test_a_win_back_reaches_the_lapsed_and_nobody_else(): void
    {
        Queue::fake();
        $this->actingAsMarketer();

        $trigger = Trigger::factory()->active()->create(['kind' => 'win_back', 'offset_days' => 60]);

        $lapsed = Customer::factory()->create([
            'visits_count' => 5, 'last_visit_at' => now()->subDays(70),
        ]);
        // Seen last week.
        Customer::factory()->create(['visits_count' => 5, 'last_visit_at' => now()->subDays(6)]);
        // Long gone, but only ever came once: somebody who tried the place, not
        // a lapsed regular.
        Customer::factory()->create(['visits_count' => 1, 'last_visit_at' => now()->subDays(70)]);

        $this->artisan('crm:triggers')->assertSuccessful();

        $this->assertSame(1, TriggerSend::query()->where('trigger_id', $trigger->id)->count());
        $this->assertSame(
            $lapsed->id,
            TriggerSend::query()->where('trigger_id', $trigger->id)->value('customer_id'),
        );
    }

    public function test_a_trigger_never_reaches_the_same_person_twice_inside_its_cooldown(): void
    {
        Queue::fake();
        $this->actingAsMarketer();

        Trigger::factory()->active()->create(['kind' => 'win_back', 'offset_days' => 60, 'cooldown_days' => 90]);
        Customer::factory()->create(['visits_count' => 5, 'last_visit_at' => now()->subDays(70)]);

        $this->artisan('crm:triggers')->assertSuccessful();
        $this->artisan('crm:triggers')->assertSuccessful();

        $this->assertSame(1, TriggerSend::query()->count());
    }

    public function test_the_cooldown_expires_and_the_message_may_go_again(): void
    {
        Queue::fake();
        $this->actingAsMarketer();

        Trigger::factory()->active()->create(['kind' => 'win_back', 'offset_days' => 60, 'cooldown_days' => 90]);
        Customer::factory()->create(['visits_count' => 5, 'last_visit_at' => now()->subDays(70)]);

        $this->artisan('crm:triggers')->assertSuccessful();

        TriggerSend::query()->update(['created_at' => now()->subDays(100)]);

        $this->artisan('crm:triggers')->assertSuccessful();

        $this->assertSame(2, TriggerSend::query()->count());
    }

    public function test_a_switched_off_trigger_sends_nothing(): void
    {
        Queue::fake();
        $this->actingAsMarketer();

        Trigger::factory()->create(['kind' => 'win_back', 'offset_days' => 60]);
        Customer::factory()->create(['visits_count' => 5, 'last_visit_at' => now()->subDays(70)]);

        $this->artisan('crm:triggers')->assertSuccessful();

        $this->assertSame(0, TriggerSend::query()->count());
    }

    public function test_a_birthday_message_arrives_three_days_early(): void
    {
        Queue::fake();
        $this->actingAsMarketer();

        Trigger::factory()->active()->birthday(3)->create();

        $inThree = Customer::factory()->create(['birthday' => now()->addDays(3)->subYears(30)]);
        // Today, and in a week. Neither is three days away.
        Customer::factory()->create(['birthday' => now()->subYears(30)]);
        Customer::factory()->create(['birthday' => now()->addDays(7)->subYears(30)]);

        $this->artisan('crm:triggers')->assertSuccessful();

        $this->assertSame(1, TriggerSend::query()->count());
        $this->assertSame($inThree->id, TriggerSend::query()->value('customer_id'));
    }

    public function test_a_firing_becomes_one_campaign_with_delivery_rows(): void
    {
        Queue::fake();
        $this->actingAsMarketer();

        Trigger::factory()->active()->create(['kind' => 'win_back', 'offset_days' => 60]);
        Customer::factory()->count(2)->create(['visits_count' => 5, 'last_visit_at' => now()->subDays(70)]);

        $this->artisan('crm:triggers')->assertSuccessful();

        // One campaign, so there is exactly one place that talks to a gateway,
        // counts parts and can be reported on.
        $this->assertSame(1, Campaign::query()->count());
        $this->assertSame(2, CampaignDelivery::query()->count());
        $this->assertSame('sending', Campaign::query()->value('status'));
    }

    public function test_a_dry_run_writes_nothing(): void
    {
        Queue::fake();
        $this->actingAsMarketer();

        Trigger::factory()->active()->create(['kind' => 'win_back', 'offset_days' => 60]);
        Customer::factory()->create(['visits_count' => 5, 'last_visit_at' => now()->subDays(70)]);

        $this->artisan('crm:triggers', ['--dry-run' => true])->assertSuccessful();

        $this->assertSame(0, TriggerSend::query()->count());
        $this->assertSame(0, Campaign::query()->count());
    }

    // ============ The seeded four are the console's four ============

    public function test_the_seeder_uses_the_keys_the_console_addresses(): void
    {
        $this->actingAsMarketer();
        $this->seed(CrmMarketingSeeder::class);

        // `bday`, `back`, `first`, `sleep` — the fixture's own ids in
        // `marketing-data.ts`, which asked for exactly this: "a real row would
        // be addressed by key".
        $this->assertEqualsCanonicalizing(
            ['bday', 'back', 'first', 'sleep'],
            Trigger::query()->pluck('key')->all(),
        );

        // The fourth is drawn switched off in the design, so the screen has one
        // of each state.
        $this->assertFalse((bool) Trigger::query()->where('key', 'sleep')->value('is_active'));
    }

    public function test_seeding_twice_writes_the_same_rows_once(): void
    {
        $this->actingAsMarketer();

        $this->seed(CrmMarketingSeeder::class);
        $this->seed(CrmMarketingSeeder::class);

        // A demo database is reseeded constantly, and a second pass that
        // produced a fifth business lunch and a second birthday trigger would
        // make every screenshot depend on how many times somebody had run it.
        $this->assertSame(4, Trigger::query()->count());
        $this->assertSame(4, Promotion::query()->count());
        $this->assertSame(5, Campaign::query()->count());
    }

    // ============ Tenant isolation ============

    public function test_one_restaurant_never_sees_another_restaurants_automations(): void
    {
        $a = Tenant::query()->create([
            'name' => 'Osh Markazi', 'slug' => 'osh-markazi', 'country_code' => 'UZ',
            'locale' => 'uz', 'timezone' => 'Asia/Tashkent', 'status' => 'active',
        ]);
        Tenant::query()->create([
            'name' => 'City Cafe', 'slug' => 'city-cafe', 'country_code' => 'UZ',
            'locale' => 'uz', 'timezone' => 'Asia/Tashkent', 'status' => 'active',
        ]);

        Trigger::factory()->count(2)->create(['tenant_id' => $a->id]);

        $user = User::factory()->create(['tenant_id' => $a->id]);
        $user->assignRole('owner');
        $this->actingAs($user);

        $this->withHeader('X-Tenant', 'osh-markazi')
            ->getJson('/api/v1/crm/triggers')->assertOk()->assertJsonCount(2, 'data');

        // Asking for another restaurant is refused outright: an empty list
        // would read as "no data" and hide the attempt entirely.
        $this->withHeader('X-Tenant', 'city-cafe')
            ->getJson('/api/v1/crm/triggers')
            ->assertStatus(403)
            ->assertApiError('tenant.mismatch');
    }
}
