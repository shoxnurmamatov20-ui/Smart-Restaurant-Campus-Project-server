<?php

declare(strict_types=1);

namespace Modules\Marketplace\Database\Factories;

use Illuminate\Database\Eloquent\Factories\Factory;
use Illuminate\Support\Str;
use Modules\Marketplace\Models\Store;

/**
 * @extends Factory<Store>
 */
final class StoreFactory extends Factory
{
    protected $model = Store::class;

    /**
     * A storefront that is live and taking orders, because that is the state
     * every test wants and the one the directory can see. A factory whose
     * default row is invisible to the endpoint under test is a factory that
     * makes every test start with a `->live()` call.
     *
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        $name = $this->faker->randomElement(['Osh Xona', 'Choyxona Navruz', 'Lavash Baraka', 'Burger Xona', 'Pizza Roma']);

        return [
            // Suffixed, because the slug is unique across the whole platform —
            // it is a public URL — and a factory that reuses names would
            // collide on the second call.
            'slug' => Str::slug($name).'-'.Str::lower(Str::random(6)),
            'name' => $name,
            'kind' => ['uz' => 'Milliy taomlar', 'ru' => 'Национальная кухня', 'en' => 'Uzbek food'],
            'cuisine' => 'osh',
            'vertical' => 'food',
            // Tenths of a star: 47 is 4.7.
            'rating_tenths' => $this->faker->numberBetween(40, 50),
            'reviews_count' => $this->faker->numberBetween(50, 3_000),
            'delivery_fee_tiyin' => 1_200_000,
            'min_order_tiyin' => 0,
            'minutes_from' => 25,
            'minutes_to' => 35,
            'commission_percent' => Store::DEFAULT_COMMISSION_PERCENT,
            'status' => 'live',
            'is_open' => true,
            'initials' => mb_strtoupper(mb_substr($name, 0, 2)),
            'tint' => '#2E74EA',
            // Tashkent, in microdegrees — so `?near=` has something to measure
            // against in a test without inventing a coordinate system.
            'latitude_e6' => 41_311_081,
            'longitude_e6' => 69_240_562,
        ];
    }

    /** Pulled from the market by the platform: still a row, never in the directory. */
    public function paused(): self
    {
        return $this->state(fn (): array => ['status' => 'paused']);
    }

    /** Live on the market, but the kitchen is shut — the dimmed card. */
    public function closed(): self
    {
        return $this->state(fn (): array => ['is_open' => false]);
    }
}
