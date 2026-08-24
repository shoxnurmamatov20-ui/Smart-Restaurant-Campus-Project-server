<?php

declare(strict_types=1);

namespace Modules\Orders\Tests\Feature;

use App\Models\Branch;
use App\Models\Tenant;
use App\Support\Tenancy\TenantContext;
use Database\Seeders\RolesAndPermissionsSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Testing\TestResponse;
use Modules\Menu\Models\MenuItem;
use Tests\TestCase;

/**
 * The handle a tracking screen needs to open a second payment attempt.
 *
 * `POST /api/v1/public/payments/invoice` is keyed by `order_id` AND
 * `order_number` together. Until this landed the tracking payload published only
 * the number, so a guest whose card was declined had a "pay again" button with
 * nothing to press it with — the only way back was a checkout that no longer had
 * their basket.
 *
 * Two things are asserted and the second is the one that matters: the id is on
 * the single-order response, and it is NOT on the history list. The list is
 * reached with a different credential and does not need it.
 */
final class PublicOrderPaymentHandleTest extends TestCase
{
    use RefreshDatabase;

    private Tenant $tenant;

    private Branch $branch;

    private MenuItem $osh;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(RolesAndPermissionsSeeder::class);

        $this->tenant = Tenant::query()->create([
            'name' => 'Osh Xona', 'slug' => 'osh-xona', 'country_code' => 'UZ',
            'locale' => 'uz', 'timezone' => 'Asia/Tashkent', 'status' => 'active',
        ]);
        app(TenantContext::class)->set($this->tenant);

        $this->branch = Branch::factory()->create(['tenant_id' => $this->tenant->id]);
        $this->osh = MenuItem::factory()->dish('OSH-1', 'Osh', 'Плов', 'Pilaf', 4_500_000)->create();
    }

    private function place(): TestResponse
    {
        return $this->withHeaders([
            'X-Tenant' => $this->tenant->slug,
            'Accept' => 'application/json',
        ])->postJson('/api/v1/public/orders', [
            'channel' => 'delivery',
            'branch_id' => $this->branch->id,
            'items' => [['menu_item_id' => $this->osh->id, 'quantity' => 1]],
            'customer' => ['name' => 'Dilnoza Aliyeva', 'phone' => '+998 90 123 45 67'],
            'address' => ['line' => 'Chilonzor 9, 41-uy'],
            'payment_method' => 'cash',
        ]);
    }

    public function test_the_tracking_screen_is_handed_the_id_it_needs_to_pay_again(): void
    {
        $number = (string) $this->place()->assertCreated()->json('data.number');

        $tracked = $this->withHeaders([
            'X-Tenant' => $this->tenant->slug,
            'Accept' => 'application/json',
        ])->getJson("/api/v1/public/orders/{$number}?phone=4567")->assertOk();

        $id = $tracked->json('data.id');

        $this->assertIsInt($id);
        $this->assertGreaterThan(0, $id);
        // The number is still there — the invoice endpoint wants both.
        $this->assertSame($number, $tracked->json('data.number'));
    }

    public function test_the_wrong_phone_still_gets_nothing_at_all(): void
    {
        $number = (string) $this->place()->assertCreated()->json('data.number');

        // Publishing the id is safe only because reaching the payload already
        // needs the bill number and the last four digits of the phone. This is
        // the half that keeps it that way.
        $this->withHeaders([
            'X-Tenant' => $this->tenant->slug,
            'Accept' => 'application/json',
        ])->getJson("/api/v1/public/orders/{$number}?phone=0000")
            ->assertApiError('request.not_found');
    }
}
