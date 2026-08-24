<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Models\Branch;
use App\Models\Tenant;
use Illuminate\Foundation\Testing\RefreshDatabase;
use PHPUnit\Framework\Attributes\Test;
use Tests\TestCase;

/**
 * The venues a stranger may order from: open, tenant-scoped, and nothing more
 * than a guest needs.
 *
 * The second test is the one that matters commercially. This list is a QUOTE
 * and `PublicOrderController` is the CHARGE, and the two used to read different
 * paths out of the same JSON column — `delivery.fee_tiyin` here,
 * `delivery_fee_tiyin` there. A guest was quoted free delivery and billed for
 * it, or handed a basket the order endpoint then refused as under a minimum the
 * storefront had reported as zero. Both figures are read from one branch row
 * below, so the day they drift apart again this fails.
 */
final class PublicBranchesTest extends TestCase
{
    use RefreshDatabase;

    #[Test]
    public function it_lists_active_venues_of_this_restaurant_only(): void
    {
        $mine = Tenant::factory()->create();
        $theirs = Tenant::factory()->create();

        Branch::factory()->for($mine)->create([
            'name' => 'Chilonzor',
            'status' => 'active',
            'settings' => [
                'hours' => ['opens' => '09:00', 'closes' => '23:00'],
                'delivery_fee_tiyin' => 1_500_000,
            ],
        ]);
        Branch::factory()->for($mine)->create(['name' => 'Yopiq', 'status' => 'closed']);
        Branch::factory()->for($theirs)->create(['name' => 'Boshqa restoran', 'status' => 'active']);

        $response = $this->withHeader('X-Tenant', $mine->slug)->getJson('/api/v1/public/branches')->assertOk();

        $names = array_column($response->json('data'), 'name');

        $this->assertSame(['Chilonzor'], $names);
        $this->assertSame('09:00', $response->json('data.0.opens'));
        $this->assertSame(1_500_000, $response->json('data.0.delivery_fee_tiyin'));
        // Nothing a guest has no business with.
        $this->assertArrayNotHasKey('tenant_id', $response->json('data.0'));
    }

    /**
     * The week the console writes, read back as today's pair.
     *
     * `hours.{day} => [open, close]` is the shape the settings schema declares
     * and the only one a restaurant can actually write. This endpoint read
     * `hours.opens`, which is declared nowhere, so every venue answered null and
     * the restaurant's own website printed no opening times at all.
     */
    #[Test]
    public function it_reads_todays_hours_out_of_the_week(): void
    {
        $tenant = Tenant::factory()->create();
        $today = strtolower(now('Asia/Tashkent')->format('D'));

        Branch::factory()->for($tenant)->create([
            'status' => 'active',
            'timezone' => 'Asia/Tashkent',
            'settings' => ['hours' => [$today => ['10:00', '23:30']]],
        ]);

        $response = $this->withHeader('X-Tenant', $tenant->slug)->getJson('/api/v1/public/branches');

        $this->assertSame('10:00', $response->json('data.0.opens'));
        $this->assertSame('23:30', $response->json('data.0.closes'));
    }

    /**
     * What the storefront quotes is what the order endpoint charges.
     *
     * Read out of ONE branch row: the quote comes from this endpoint and the
     * charge from `PublicOrderController::deliveryFee()`, and if the two ever
     * read different keys again the numbers below stop matching.
     */
    #[Test]
    public function the_quoted_delivery_terms_are_the_ones_the_order_enforces(): void
    {
        $tenant = Tenant::factory()->create();
        $branch = Branch::factory()->for($tenant)->create([
            'status' => 'active',
            'settings' => [
                'delivery_fee_tiyin' => 1_200_000,
                'free_delivery_over_tiyin' => 20_000_000,
                'min_order_tiyin' => 3_000_000,
            ],
        ]);

        $quoted = $this->withHeader('X-Tenant', $tenant->slug)
            ->getJson('/api/v1/public/branches')
            ->assertOk()
            ->json('data.0');

        // The same paths the order endpoint reads, named here so a rename on
        // either side is a failing test rather than a wrong receipt.
        $this->assertSame((int) $branch->setting('delivery_fee_tiyin'), $quoted['delivery_fee_tiyin']);
        $this->assertSame((int) $branch->setting('min_order_tiyin'), $quoted['min_order_tiyin']);
        $this->assertSame(
            (int) $branch->setting('free_delivery_over_tiyin'),
            $quoted['free_delivery_over_tiyin'],
        );
        $this->assertSame(1_200_000, $quoted['delivery_fee_tiyin']);
    }

    #[Test]
    public function it_needs_no_session(): void
    {
        $tenant = Tenant::factory()->create();
        Branch::factory()->for($tenant)->create(['status' => 'active']);

        $this->withHeader('X-Tenant', $tenant->slug)->getJson('/api/v1/public/branches')->assertOk();
    }
}
