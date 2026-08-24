<?php

declare(strict_types=1);

namespace Modules\TelegramBots\Tests\Feature;

use App\Models\Tenant;
use App\Models\User;
use App\Support\Events\ReceivedEvent;
use App\Support\Tenancy\TenantContext;
use Carbon\CarbonImmutable;
use Database\Seeders\RolesAndPermissionsSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Modules\TelegramBots\Models\Bot;
use Modules\TelegramBots\Models\NotificationRule;
use Modules\TelegramBots\Services\TelegramNotifier;
use Tests\TestCase;

/**
 * Which chat hears about what.
 *
 * The settings panel has been drawing six switches and a chat id since the
 * console was built, and none of them was attached to anything — the toggle
 * flipped, the chat id validated, and the manager's phone stayed silent for
 * every void and every shift close.
 *
 * Nothing here talks to Telegram: `Http::fake()` throughout. The assertions
 * that matter are about WHO gets told and WHETHER a failure to tell them can
 * take a sale down with it.
 */
final class NotificationRuleTest extends TestCase
{
    use RefreshDatabase;

    private Tenant $tenant;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(RolesAndPermissionsSeeder::class);

        $this->tenant = Tenant::query()->create([
            'name' => 'Osh Xona', 'slug' => 'osh-xona-tg', 'country_code' => 'UZ',
            'locale' => 'uz', 'timezone' => 'Asia/Tashkent', 'status' => 'active',
        ]);

        app(TenantContext::class)->set($this->tenant);
    }

    private function signIn(string $role): User
    {
        $user = User::factory()->create(['tenant_id' => $this->tenant->id]);
        $user->assignRole($role);
        $this->actingAs($user);

        return $user->fresh();
    }

    private function bot(): Bot
    {
        $bot = Bot::query()->create([
            'key' => 'ops', 'telegram_username' => '@smartrestaurant_ops_bot',
            'name_uz' => 'Ops', 'name_ru' => 'Ops', 'name_en' => 'Ops',
            'purpose' => 'operations', 'audience' => 'staff', 'enabled' => true,
            'tenant_id' => $this->tenant->id,
        ]);

        // Assigned rather than mass-assigned: `token` is an accessor pair, not
        // a column, and it is deliberately absent from `$fillable` so a request
        // body can never set one.
        $bot->token = '123456:AAEFAKE-TOKEN';
        $bot->save();

        return $bot->fresh();
    }

    // ============ The console ============

    public function test_a_manager_saves_a_rule_and_a_waiter_cannot(): void
    {
        $this->signIn('waiter');
        $this->postJson('/api/v1/telegram/notification-rules', [
            'event' => 'pos.bill_voided', 'chat_id' => '-1001847392015',
        ])->assertStatus(403);

        $this->signIn('owner');
        $this->postJson('/api/v1/telegram/notification-rules', [
            'event' => 'pos.bill_voided', 'chat_id' => '-1001847392015',
        ])->assertCreated();

        $this->assertSame(1, NotificationRule::query()->count());
    }

    public function test_saving_the_same_switch_twice_is_one_rule(): void
    {
        $this->signIn('owner');

        // The panel is a switch per event, not a list. A second row would mean
        // two messages for every void from then on.
        foreach ([1, 2] as $ignored) {
            $this->postJson('/api/v1/telegram/notification-rules', [
                'event' => 'finance.shift_closed', 'chat_id' => '-1001847392015',
            ])->assertCreated();
        }

        $this->assertSame(1, NotificationRule::query()->count());
    }

    public function test_an_event_the_platform_does_not_publish_is_refused(): void
    {
        $this->signIn('owner');

        // A typo saved here is a switch that looks on and waits forever for a
        // message that was never coming.
        $this->postJson('/api/v1/telegram/notification-rules', [
            'event' => 'orders.plased', 'chat_id' => '-1001847392015',
        ])->assertStatus(422);
    }

    public function test_a_chat_id_that_is_not_a_chat_id_is_refused(): void
    {
        $this->signIn('owner');

        $this->postJson('/api/v1/telegram/notification-rules', [
            'event' => 'orders.placed', 'chat_id' => '@smartrestaurant',
        ])->assertStatus(422);
    }

    public function test_the_test_button_says_so_when_the_message_does_not_land(): void
    {
        Http::fake(['*' => Http::response(['ok' => false, 'description' => 'chat not found'], 400)]);

        $this->signIn('owner');
        $bot = $this->bot();

        $rule = NotificationRule::query()->create([
            'tenant_id' => $this->tenant->id, 'event' => 'orders.placed',
            'chat_id' => '-1009999999999', 'bot_id' => $bot->id,
        ]);

        // The only way to find out a chat id is wrong. A rule saved without
        // this is a rule nobody discovers is broken until the night something
        // actually goes wrong.
        $this->postJson("/api/v1/telegram/notification-rules/{$rule->id}/test")
            ->assertStatus(422)
            ->assertJsonPath('error.field', 'chat_id');
    }

    public function test_the_test_button_reports_success_when_it_lands(): void
    {
        Http::fake(['*' => Http::response(['ok' => true, 'result' => []], 200)]);

        $this->signIn('owner');
        $bot = $this->bot();

        $rule = NotificationRule::query()->create([
            'tenant_id' => $this->tenant->id, 'event' => 'orders.placed',
            'chat_id' => '-1001847392015', 'bot_id' => $bot->id,
        ]);

        $this->postJson("/api/v1/telegram/notification-rules/{$rule->id}/test")
            ->assertOk()
            ->assertJsonPath('sent', true);
    }

    // ============ The notifier ============

    private function event(string $name, array $payload): ReceivedEvent
    {
        return new ReceivedEvent(
            eventId: 'evt-1',
            name: $name,
            module: 'Pos',
            schemaVersion: 1,
            tenantId: $this->tenant->id,
            actorId: null,
            aggregateType: null,
            aggregateId: null,
            payload: $payload,
            occurredAt: CarbonImmutable::now(),
        );
    }

    public function test_a_subscribed_chat_is_told(): void
    {
        Http::fake(['*' => Http::response(['ok' => true], 200)]);

        $bot = $this->bot();
        NotificationRule::query()->create([
            'tenant_id' => $this->tenant->id, 'event' => 'finance.shift_closed',
            'chat_id' => '-1001847392015', 'bot_id' => $bot->id,
        ]);

        $sent = app(TelegramNotifier::class)->dispatch(
            $this->event('finance.shift_closed', ['amount_tiyin' => 1_840_000_00]),
        );

        $this->assertSame(1, $sent);
        Http::assertSent(static fn ($request): bool => str_contains($request->url(), '/sendMessage')
            && $request['chat_id'] === '-1001847392015');
    }

    public function test_a_threshold_keeps_the_rule_worth_reading(): void
    {
        Http::fake(['*' => Http::response(['ok' => true], 200)]);

        $bot = $this->bot();
        NotificationRule::query()->create([
            'tenant_id' => $this->tenant->id, 'event' => 'pos.bill_voided',
            'chat_id' => '-1001847392015', 'bot_id' => $bot->id,
            // 100 000 so'm.
            'min_amount_tiyin' => 10_000_000,
        ]);

        // A rule that fires on every void is muted within a week, and a muted
        // rule is worse than none because everyone believes it is working.
        $this->assertSame(0, app(TelegramNotifier::class)->dispatch(
            $this->event('pos.bill_voided', ['amount_tiyin' => 4_000_000]),
        ));

        $this->assertSame(1, app(TelegramNotifier::class)->dispatch(
            $this->event('pos.bill_voided', ['amount_tiyin' => 40_000_000]),
        ));
    }

    public function test_a_branch_rule_hears_only_its_own_branch(): void
    {
        Http::fake(['*' => Http::response(['ok' => true], 200)]);

        $bot = $this->bot();
        NotificationRule::query()->create([
            'tenant_id' => $this->tenant->id, 'branch_id' => 7,
            'event' => 'orders.placed', 'chat_id' => '-1001847392015', 'bot_id' => $bot->id,
        ]);

        $this->assertSame(0, app(TelegramNotifier::class)->dispatch(
            $this->event('orders.placed', ['branch_id' => 9, 'number' => 'A-1']),
        ));

        $this->assertSame(1, app(TelegramNotifier::class)->dispatch(
            $this->event('orders.placed', ['branch_id' => 7, 'number' => 'A-2']),
        ));
    }

    public function test_another_restaurants_rule_never_fires(): void
    {
        Http::fake(['*' => Http::response(['ok' => true], 200)]);

        $other = Tenant::query()->create([
            'name' => 'Boshqa', 'slug' => 'boshqa-tg', 'country_code' => 'UZ',
            'locale' => 'uz', 'timezone' => 'Asia/Tashkent', 'status' => 'active',
        ]);

        $bot = $this->bot();
        NotificationRule::query()->create([
            'tenant_id' => $other->id, 'event' => 'orders.placed',
            'chat_id' => '-1000000000001', 'bot_id' => $bot->id,
        ]);

        $this->assertSame(0, app(TelegramNotifier::class)->dispatch(
            $this->event('orders.placed', ['number' => 'A-3']),
        ));
        Http::assertNothingSent();
    }

    public function test_telegram_being_down_never_takes_the_sale_with_it(): void
    {
        // A void is recorded, a shift is closed, an order is placed — and THEN
        // somebody is told. Letting a timeout roll that back would be a
        // restaurant unable to trade because a chat app was down.
        Http::fake(['*' => Http::response('gateway timeout', 504)]);

        $bot = $this->bot();
        NotificationRule::query()->create([
            'tenant_id' => $this->tenant->id, 'event' => 'orders.placed',
            'chat_id' => '-1001847392015', 'bot_id' => $bot->id,
        ]);

        $sent = app(TelegramNotifier::class)->dispatch($this->event('orders.placed', ['number' => 'A-4']));

        $this->assertSame(0, $sent);
    }

    public function test_a_dish_name_cannot_smuggle_markup_into_a_chat(): void
    {
        Http::fake(['*' => Http::response(['ok' => true], 200)]);

        $bot = $this->bot();
        NotificationRule::query()->create([
            'tenant_id' => $this->tenant->id, 'event' => 'orders.placed',
            'chat_id' => '-1001847392015', 'bot_id' => $bot->id,
        ]);

        // `parse_mode` is HTML, so an order number carrying a tag would either
        // arrive as bold text or make Telegram reject the whole message.
        app(TelegramNotifier::class)->dispatch(
            $this->event('orders.placed', ['number' => '<b>A-5</b>', 'channel' => 'dine_in']),
        );

        Http::assertSent(static fn ($request): bool => is_string($request['text'])
            && ! str_contains($request['text'], '<b>')
            && str_contains($request['text'], '&lt;b&gt;'));
    }
}
