<?php

declare(strict_types=1);

namespace Modules\Crm\Tests\Feature;

use App\Contracts\Messaging\SmsDelivery;
use App\Contracts\Messaging\SmsSender;
use App\Models\Tenant;
use App\Models\User;
use App\Support\Tenancy\DatabaseTenancy;
use Carbon\CarbonImmutable;
use Database\Seeders\RolesAndPermissionsSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Queue;
use Modules\Crm\Jobs\SendCampaignMessage;
use Modules\Crm\Models\Campaign;
use Modules\Crm\Models\CampaignDelivery;
use Modules\Crm\Models\Customer;
use Modules\Crm\Services\CampaignDispatcher;
use Modules\Crm\Services\SmsCost;
use Tests\TestCase;

/**
 * The marketing composer, end to end.
 *
 * The costs are asserted as literal tiyin rather than recomputed from
 * `SmsCost`, deliberately. The composer in `marketing-data.ts` prices the same
 * message in the browser while somebody types it, and a test that derived its
 * expectation from the implementation would pass just as happily if both sides
 * moved apart — which is exactly the drift a marketer sees as an estimate that
 * never matches the invoice.
 */
final class CampaignTest extends TestCase
{
    use RefreshDatabase;

    /** The seeded tariff: 55 so'm a part. */
    private const PART = 5500;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(RolesAndPermissionsSeeder::class);
    }

    private function actingAsMarketer(): User
    {
        $user = User::factory()->create();
        $user->assignRole('marketer');
        $this->actingAs($user);

        return $user;
    }

    /** A gateway that accepts everything, so the ladder can be watched. */
    private function gatewayAccepts(): void
    {
        $this->app->bind(SmsSender::class, fn (): SmsSender => new class implements SmsSender
        {
            public function send(string $phone, string $text): SmsDelivery
            {
                return SmsDelivery::accepted('ref-'.$phone);
            }
        });
    }

    /** A gateway with no balance. Every message is refused, none is billed. */
    private function gatewayRefuses(): void
    {
        $this->app->bind(SmsSender::class, fn (): SmsSender => new class implements SmsSender
        {
            public function send(string $phone, string $text): SmsDelivery
            {
                return SmsDelivery::refused('no_balance');
            }
        });
    }

    // ============ Auth & RBAC ============

    public function test_unauthenticated_user_cannot_read_campaigns(): void
    {
        $this->getJson('/api/v1/crm/campaigns')->assertStatus(401);
    }

    public function test_a_cook_cannot_read_campaigns(): void
    {
        // A waiter deliberately CAN — they hold `crm.view` so they can look a
        // guest up at a table. A cook holds nothing in this module at all, and
        // is the honest test of the guard.
        $user = User::factory()->create();
        $user->assignRole('cook');
        $this->actingAs($user);

        $this->getJson('/api/v1/crm/campaigns')->assertStatus(403);
    }

    public function test_a_cashier_cannot_spend_the_sms_budget(): void
    {
        $user = User::factory()->create();
        $user->assignRole('cashier');
        $this->actingAs($user);

        $campaign = Campaign::factory()->create();

        // `crm.manage`, and a cashier holds view, create and update only.
        $this->postJson("/api/v1/crm/campaigns/{$campaign->id}/send")->assertStatus(403);
    }

    // ============ The composer ============

    public function test_the_estimate_prices_the_body_against_the_segment(): void
    {
        $this->actingAsMarketer();

        Customer::factory()->count(3)->create(['segment' => 'regular']);
        Customer::factory()->count(2)->create(['segment' => 'at_risk']);

        // 45 Latin characters — one GSM-7 part at 160.
        $this->postJson('/api/v1/crm/campaigns/estimate', [
            'body' => 'Salom! Bugun barcha lavashlarga 20% chegirma.',
            'segment' => 'regular',
        ])
            ->assertOk()
            ->assertJsonPath('data.recipients', 3)
            ->assertJsonPath('data.parts', 1)
            ->assertJsonPath('data.cyrillic', false)
            ->assertJsonPath('data.cost_tiyin', 3 * self::PART);
    }

    public function test_one_cyrillic_letter_more_than_doubles_the_bill(): void
    {
        $this->actingAsMarketer();
        Customer::factory()->count(10)->create();

        // 100 characters: one part in GSM-7, two in UCS-2 at 70.
        $latin = str_repeat('a', 100);
        $cyrillic = str_repeat('a', 99).'ф';

        $this->postJson('/api/v1/crm/campaigns/estimate', ['body' => $latin])
            ->assertOk()->assertJsonPath('data.parts', 1);

        $this->postJson('/api/v1/crm/campaigns/estimate', ['body' => $cyrillic])
            ->assertOk()
            ->assertJsonPath('data.parts', 2)
            ->assertJsonPath('data.cyrillic', true)
            ->assertJsonPath('data.cost_tiyin', 2 * 10 * self::PART);
    }

    public function test_the_estimate_writes_nothing(): void
    {
        $this->actingAsMarketer();
        Customer::factory()->count(2)->create();

        $this->postJson('/api/v1/crm/campaigns/estimate', ['body' => 'Salom'])->assertOk();

        $this->assertSame(0, Campaign::query()->count());
    }

    // ============ Writing one ============

    public function test_a_marketer_can_draft_a_campaign_and_the_server_prices_it(): void
    {
        $this->actingAsMarketer();
        Customer::factory()->count(4)->create(['segment' => 'regular']);

        $this->postJson('/api/v1/crm/campaigns', [
            'name' => 'Payshanba lavash aksiyasi',
            'body' => 'Salom! Bugun barcha lavashlarga 20% chegirma.',
            'segment' => 'regular',
        ])
            ->assertCreated()
            ->assertJsonPath('data.status', 'draft')
            ->assertJsonPath('data.parts', 1)
            // The estimate is the server's, from the body the server was given.
            ->assertJsonPath('data.estimated_cost_tiyin', 4 * self::PART);
    }

    public function test_a_campaign_cannot_be_posted_already_sent(): void
    {
        $this->actingAsMarketer();

        $this->postJson('/api/v1/crm/campaigns', [
            'name' => 'X', 'body' => 'Salom', 'status' => 'sent',
        ])->assertStatus(422)->assertApiValidationErrors('status');
    }

    public function test_a_body_longer_than_four_parts_is_refused(): void
    {
        $this->actingAsMarketer();

        $this->postJson('/api/v1/crm/campaigns', [
            'name' => 'X', 'body' => str_repeat('a', 641),
        ])->assertStatus(422)->assertApiValidationErrors('body');
    }

    // ============ Sending ============

    public function test_sending_freezes_the_list_and_queues_one_job_per_person(): void
    {
        Queue::fake();
        $this->actingAsMarketer();

        Customer::factory()->count(3)->create(['segment' => 'regular']);
        // Not in the segment, and one with no number at all.
        Customer::factory()->create(['segment' => 'at_risk']);
        Customer::factory()->create(['segment' => 'regular', 'phone' => '']);

        $campaign = Campaign::factory()->forSegment('regular')->create();

        $this->postJson("/api/v1/crm/campaigns/{$campaign->id}/send")
            ->assertOk()
            ->assertJsonPath('data.status', 'sending')
            ->assertJsonPath('data.recipients', 3);

        $this->assertSame(3, CampaignDelivery::query()->where('campaign_id', $campaign->id)->count());
        Queue::assertPushed(SendCampaignMessage::class, 3);
    }

    public function test_pressing_send_twice_does_not_message_anybody_twice(): void
    {
        Queue::fake();
        $this->actingAsMarketer();

        Customer::factory()->count(2)->create(['segment' => 'regular']);
        $campaign = Campaign::factory()->forSegment('regular')->create();

        $this->postJson("/api/v1/crm/campaigns/{$campaign->id}/send")->assertOk();

        // The second press is refused outright — the campaign has left.
        $this->postJson("/api/v1/crm/campaigns/{$campaign->id}/send")
            ->assertApiError('crm.campaign_already_sent');

        $this->assertSame(2, CampaignDelivery::query()->where('campaign_id', $campaign->id)->count());
    }

    public function test_a_dispatcher_replay_writes_no_second_row(): void
    {
        Queue::fake();
        $this->actingAsMarketer();

        Customer::factory()->count(2)->create();
        $campaign = Campaign::factory()->create();

        $dispatcher = app(CampaignDispatcher::class);
        $dispatcher->send($campaign);

        // The belt under a retried batch rather than under a second press: the
        // campaign is put back to `scheduled` as a queue replay would find it.
        $campaign->forceFill(['status' => 'scheduled'])->save();
        $dispatcher->send($campaign->refresh());

        $this->assertSame(2, CampaignDelivery::query()->where('campaign_id', $campaign->id)->count());
    }

    public function test_a_segment_with_nobody_in_it_is_refused_rather_than_sent(): void
    {
        Queue::fake();
        $this->actingAsMarketer();

        $campaign = Campaign::factory()->forSegment('at_risk')->create();

        $this->postJson("/api/v1/crm/campaigns/{$campaign->id}/send")
            ->assertApiError('crm.campaign_no_recipients');

        $this->assertSame('draft', $campaign->refresh()->status);
    }

    public function test_a_sent_campaign_cannot_be_edited_or_deleted(): void
    {
        // An owner rather than a marketer: `crm.delete` is not a marketer's,
        // and a 403 from the route guard would hide the refusal being tested.
        $user = User::factory()->create();
        $user->assignRole('owner');
        $this->actingAs($user);

        $campaign = Campaign::factory()->sent()->create();

        $this->patchJson("/api/v1/crm/campaigns/{$campaign->id}", ['name' => 'Boshqa'])
            ->assertApiError('crm.campaign_already_sent');

        // Kept rather than tidied away: the campaign list is what a marketer
        // reconciles the SMS invoice against.
        $this->deleteJson("/api/v1/crm/campaigns/{$campaign->id}")
            ->assertApiError('crm.campaign_already_sent');
    }

    // ============ The job ============

    public function test_the_job_bills_what_the_gateway_accepted(): void
    {
        $this->gatewayAccepts();
        $this->actingAsMarketer();

        $tenant = Tenant::query()->firstOrFail();
        Customer::factory()->count(2)->create();
        $campaign = Campaign::factory()->create();

        app(CampaignDispatcher::class)->send($campaign);

        foreach (CampaignDelivery::query()->where('campaign_id', $campaign->id)->pluck('id') as $id) {
            (new SendCampaignMessage((int) $tenant->id, (int) $id))->handle(
                app(DatabaseTenancy::class),
                app(SmsSender::class),
            );
        }

        $campaign->refresh();

        $this->assertSame('sent', $campaign->status);
        $this->assertSame(2, $campaign->delivered);
        $this->assertSame(0, $campaign->failed);
        $this->assertSame(2 * self::PART, $campaign->cost_tiyin);
        $this->assertNotNull($campaign->finished_at);
    }

    public function test_a_refused_message_is_not_billed_and_the_campaign_says_so(): void
    {
        $this->gatewayRefuses();
        $this->actingAsMarketer();

        $tenant = Tenant::query()->firstOrFail();
        Customer::factory()->create();
        $campaign = Campaign::factory()->create();

        app(CampaignDispatcher::class)->send($campaign);

        $delivery = CampaignDelivery::query()->where('campaign_id', $campaign->id)->firstOrFail();

        (new SendCampaignMessage((int) $tenant->id, (int) $delivery->id))->handle(
            app(DatabaseTenancy::class),
            app(SmsSender::class),
        );

        $delivery->refresh();
        $campaign->refresh();

        $this->assertSame('failed', $delivery->status);
        $this->assertSame('no_balance', $delivery->reason);
        $this->assertSame(0, $delivery->cost_tiyin);

        // Every message refused is a campaign that failed, not one that was
        // sent — the distinction a marketer needs before concluding nobody
        // reads their SMS.
        $this->assertSame('failed', $campaign->status);
        $this->assertSame(0, $campaign->cost_tiyin);
    }

    public function test_the_message_body_never_reaches_the_failure_reason(): void
    {
        $this->app->bind(SmsSender::class, fn (): SmsSender => new class implements SmsSender
        {
            public function send(string $phone, string $text): SmsDelivery
            {
                return SmsDelivery::refused('gateway_timeout');
            }
        });

        $this->actingAsMarketer();
        $tenant = Tenant::query()->firstOrFail();
        Customer::factory()->create();
        $campaign = Campaign::factory()->create(['body' => 'Maxfiy matn 12345']);

        app(CampaignDispatcher::class)->send($campaign);
        $delivery = CampaignDelivery::query()->where('campaign_id', $campaign->id)->firstOrFail();

        (new SendCampaignMessage((int) $tenant->id, (int) $delivery->id))->handle(
            app(DatabaseTenancy::class),
            app(SmsSender::class),
        );

        $this->assertStringNotContainsString('Maxfiy', (string) $delivery->refresh()->reason);
    }

    // ============ Quiet hours ============

    public function test_messages_wait_until_nine_when_the_law_says_they_must(): void
    {
        $dispatcher = app(CampaignDispatcher::class);

        // Inside the window: no delay at all.
        $this->assertNull($dispatcher->delayUntilAllowed(
            CarbonImmutable::parse('2026-08-22 14:00:00'),
        ));

        // Before the morning boundary waits until this morning.
        $this->assertSame(
            '2026-08-22 09:00',
            $dispatcher->delayUntilAllowed(CarbonImmutable::parse('2026-08-22 07:30:00'))?->format('Y-m-d H:i'),
        );

        // After the evening one waits until tomorrow. A campaign queued at
        // 22:50 must land at nine the next morning, not ten hours after
        // whenever a worker happened to pick it up.
        $this->assertSame(
            '2026-08-23 09:00',
            $dispatcher->delayUntilAllowed(CarbonImmutable::parse('2026-08-22 22:50:00'))?->format('Y-m-d H:i'),
        );
    }

    // ============ The arithmetic the browser copies ============

    public function test_the_part_counts_match_the_composers_own(): void
    {
        // `marketing-data.ts`: GSM7_PER_PART = 160, UCS2_PER_PART = 70, and at
        // least one part for anything. If these move, move them there too.
        $this->assertSame(1, SmsCost::parts(''));
        $this->assertSame(1, SmsCost::parts(str_repeat('a', 160)));
        $this->assertSame(2, SmsCost::parts(str_repeat('a', 161)));
        $this->assertSame(1, SmsCost::parts(str_repeat('ф', 70)));
        $this->assertSame(2, SmsCost::parts(str_repeat('ф', 71)));
    }

    // ============ Tenant isolation ============

    public function test_one_restaurant_never_sees_another_restaurants_campaigns(): void
    {
        $a = Tenant::query()->create([
            'name' => 'Osh Markazi', 'slug' => 'osh-markazi', 'country_code' => 'UZ',
            'locale' => 'uz', 'timezone' => 'Asia/Tashkent', 'status' => 'active',
        ]);
        Tenant::query()->create([
            'name' => 'City Cafe', 'slug' => 'city-cafe', 'country_code' => 'UZ',
            'locale' => 'uz', 'timezone' => 'Asia/Tashkent', 'status' => 'active',
        ]);

        Campaign::factory()->count(2)->create(['tenant_id' => $a->id]);

        $user = User::factory()->create(['tenant_id' => $a->id]);
        $user->assignRole('owner');
        $this->actingAs($user);

        $this->withHeader('X-Tenant', 'osh-markazi')
            ->getJson('/api/v1/crm/campaigns')->assertOk()->assertJsonCount(2, 'data');

        // Asking for another restaurant is refused outright: an empty list
        // would read as "no data" and hide the attempt entirely.
        $this->withHeader('X-Tenant', 'city-cafe')
            ->getJson('/api/v1/crm/campaigns')
            ->assertStatus(403)
            ->assertApiError('tenant.mismatch');
    }
}
