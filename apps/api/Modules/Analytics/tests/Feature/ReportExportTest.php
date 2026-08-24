<?php

declare(strict_types=1);

namespace Modules\Analytics\Tests\Feature;

use App\Contracts\Messaging\ChatNotifier;
use App\Models\Tenant;
use App\Models\User;
use App\Support\Tenancy\TenantContext;
use Database\Seeders\RolesAndPermissionsSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Mail;
use Modules\Orders\Models\Order;
use Modules\Orders\Models\OrderItem;
use Tests\TestCase;

/**
 * Taking a standard report off the screen: as a file, as a mail, as a chat.
 *
 * The download half has existed since the endpoint did. What is new is the
 * other three quarters of the export dialog — the 1C dialect and the two
 * destinations — and each of them has a specific way of being wrong that a
 * "returns 200" test would not see:
 *
 *  - a 1C file with this platform's own column keys in the header is a file 1C
 *    refuses at the import dialog;
 *  - a destination that answers `delivered: 0` under a green toast is the
 *    version of this feature that costs somebody their month end;
 *  - and a chat id defaulted from nowhere sends a restaurant's takings to
 *    whichever chat happened to be first in the table.
 */
final class ReportExportTest extends TestCase
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

    private function actingAsOwner(?string $email = null): User
    {
        $user = User::factory()->create([
            'tenant_id' => $this->tenant->id,
            'email' => $email ?? 'rustam@smartrestaurant.uz',
        ]);
        $user->assignRole('owner');
        $this->actingAs($user);

        return $user;
    }

    /** One paid bill with one line on it, so a report has something to say. */
    private function oneSale(): void
    {
        $order = Order::factory()->paid()->create(['total' => 4_500_000]);

        OrderItem::factory()->for($order)->create([
            'title' => 'Osh',
            'sku' => 'OSH-1',
            'quantity' => 3,
            'unit_price' => 1_500_000,
            'total_price' => 4_500_000,
        ]);
    }

    // ============ The file ============

    public function test_a_report_comes_back_as_a_csv_named_after_its_window(): void
    {
        $this->actingAsOwner();
        $this->oneSale();

        $response = $this->postJson('/api/v1/reports/export', ['kind' => 'dishes', 'period' => 'today']);

        $response->assertOk();
        $response->assertHeader('Content-Type', 'text/csv; charset=UTF-8');
        $this->assertStringContainsString('attachment; filename="dishes-', (string) $response->headers->get('Content-Disposition'));

        // This platform's own column keys, which is what every other client of
        // this file reads.
        $this->assertStringContainsString('title', (string) $response->getContent());
    }

    public function test_the_1c_dialect_renames_the_header_and_keeps_the_rows(): void
    {
        $this->actingAsOwner();
        $this->oneSale();

        $response = $this->postJson('/api/v1/reports/export', [
            'kind' => 'dishes', 'period' => 'today', 'format' => '1c',
        ]);

        $response->assertOk();
        $csv = (string) $response->getContent();

        // The header is 1C's vocabulary...
        $this->assertStringContainsString('Номенклатура', $csv);
        $this->assertStringContainsString('Количество', $csv);
        $this->assertStringContainsString('Сумма', $csv);
        // ...and the rows are still the restaurant's own data. A rename that
        // also renamed the row keys would produce perfect Russian headings over
        // a table of empty cells, which is the bug this asserts against.
        $this->assertStringContainsString('Osh', $csv);
        // So'm with two decimals, not tiyin: 4 500 000 tiyin is 45 000 so'm.
        $this->assertStringContainsString('45000.00', $csv);
        // UTF-8, not cp1251 — 1C 8.3 reads UTF-8 and a code page chosen for a
        // 2005 build mangles every Uzbek name on the way in.
        $this->assertStringStartsWith("\xEF\xBB\xBF", $csv);
        // Semicolons, because a comma file lands in one column in this market.
        $this->assertStringContainsString(';', $csv);
        $this->assertStringContainsString('-1c-', (string) $response->headers->get('Content-Disposition'));
    }

    public function test_a_format_nobody_can_produce_is_refused_rather_than_renamed(): void
    {
        $this->actingAsOwner();

        // PDF is drawn in the dialog and is printed from the documents surface,
        // never here. A CSV answered under a `.pdf` name is the failure that
        // gets a file mailed back a week later.
        $this->postJson('/api/v1/reports/export', ['kind' => 'dishes', 'format' => 'pdf'])
            ->assertApiValidationErrors('format');
    }

    // ============ Where it goes ============

    public function test_email_goes_to_the_reader_when_nobody_typed_an_address(): void
    {
        Mail::fake();
        $this->actingAsOwner('nilufar@smartrestaurant.uz');
        $this->oneSale();

        $this->postJson('/api/v1/reports/export', [
            'kind' => 'dishes', 'period' => 'today', 'deliver' => 'email',
        ])
            ->assertOk()
            ->assertJsonPath('data.delivered', 1)
            ->assertJsonPath('data.to', 'nilufar@smartrestaurant.uz');

        Mail::assertSentCount(1);
    }

    public function test_email_goes_where_it_was_told_when_somebody_did(): void
    {
        Mail::fake();
        $this->actingAsOwner();
        $this->oneSale();

        $this->postJson('/api/v1/reports/export', [
            'kind' => 'cashflow', 'deliver' => 'email', 'to' => 'buxgalter@osh-xona.uz',
        ])
            ->assertOk()
            ->assertJsonPath('data.to', 'buxgalter@osh-xona.uz');

        Mail::assertSentCount(1);
    }

    public function test_an_address_that_is_not_an_address_is_refused_before_anything_is_built(): void
    {
        Mail::fake();
        $this->actingAsOwner();

        $this->postJson('/api/v1/reports/export', [
            'kind' => 'cashflow', 'deliver' => 'email', 'to' => 'not-an-address',
        ])->assertApiError('report.no_destination');

        Mail::assertNothingSent();
    }

    public function test_telegram_uses_the_chat_the_restaurant_already_hears_from(): void
    {
        $this->actingAsOwner();
        $this->oneSale();

        $chats = new RecordingChatNotifier(defaultChat: '-100234567');
        $this->app->instance(ChatNotifier::class, $chats);

        $this->postJson('/api/v1/reports/export', [
            'kind' => 'dishes', 'period' => 'today', 'deliver' => 'telegram',
        ])
            ->assertOk()
            ->assertJsonPath('data.delivered', 1)
            ->assertJsonPath('data.to', '-100234567');

        $this->assertSame('-100234567', $chats->sentTo);
        // The file travels with it. A chat message saying a report exists is
        // the thing an export is supposed to replace.
        $this->assertNotNull($chats->document);
        $this->assertStringContainsString('Osh', $chats->document['contents']);
    }

    public function test_telegram_with_no_chat_configured_says_so(): void
    {
        $this->actingAsOwner();

        $this->app->instance(ChatNotifier::class, new RecordingChatNotifier(defaultChat: null));

        $this->postJson('/api/v1/reports/export', ['kind' => 'cashflow', 'deliver' => 'telegram'])
            ->assertApiError('report.no_destination');
    }

    public function test_a_send_that_reached_nobody_is_not_reported_as_sent(): void
    {
        $this->actingAsOwner();

        $this->app->instance(ChatNotifier::class, new RecordingChatNotifier(
            defaultChat: '-100234567',
            accepts: false,
        ));

        $this->postJson('/api/v1/reports/export', ['kind' => 'cashflow', 'deliver' => 'telegram'])
            ->assertApiError('report.not_delivered');
    }

    // ============ Who may ============

    public function test_a_waiter_may_not_mail_the_venue_takings_to_themselves(): void
    {
        Mail::fake();

        $user = User::factory()->create(['tenant_id' => $this->tenant->id]);
        $user->assignRole('waiter');
        $this->actingAs($user);

        $this->postJson('/api/v1/reports/export', ['kind' => 'cashflow', 'deliver' => 'email'])
            ->assertStatus(403);

        Mail::assertNothingSent();
    }
}

/**
 * A chat that remembers what it was handed.
 *
 * The real one talks to api.telegram.org; `Http::fake()` would test Laravel's
 * client rather than this endpoint's decisions, and the decisions are the whole
 * question here — which chat, with what attached, and what happens when the
 * send does not land.
 */
final class RecordingChatNotifier implements ChatNotifier
{
    public ?string $sentTo = null;

    /** @var array{name: string, contents: string}|null */
    public ?array $document = null;

    public function __construct(
        private readonly ?string $defaultChat,
        private readonly bool $accepts = true,
    ) {}

    public function notify(int $tenantId, string $chatId, string $text, ?array $document = null): bool
    {
        $this->sentTo = $chatId;
        $this->document = $document;

        return $this->accepts;
    }

    public function defaultChat(int $tenantId): ?string
    {
        return $this->defaultChat;
    }
}
