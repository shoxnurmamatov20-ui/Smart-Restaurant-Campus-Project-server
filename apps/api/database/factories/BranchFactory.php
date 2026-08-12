<?php

declare(strict_types=1);

namespace Database\Factories;

use App\Models\Branch;
use Illuminate\Database\Eloquent\Factories\Factory;
use Illuminate\Support\Str;

/**
 * @extends Factory<Branch>
 */
final class BranchFactory extends Factory
{
    protected $model = Branch::class;

    /**
     * Real Tashkent districts and a second city, so demo data reads like a
     * chain rather than "Branch 1, Branch 2". These are the venues the design's
     * sample data names.
     *
     * @var array<int, array{name: string, code: string, city: string}>
     */
    private const VENUES = [
        ['name' => 'Chilonzor', 'code' => 'CHZ', 'city' => 'Toshkent'],
        ['name' => 'Yunusobod', 'code' => 'YUN', 'city' => 'Toshkent'],
        ['name' => 'Sergeli', 'code' => 'SRG', 'city' => 'Toshkent'],
        ['name' => "Mirzo Ulug'bek", 'code' => 'MUB', 'city' => 'Toshkent'],
        ['name' => 'Termiz', 'code' => 'TRM', 'city' => 'Termiz'],
    ];

    public function definition(): array
    {
        /** @var array{name: string, code: string, city: string} $venue */
        $venue = fake()->randomElement(self::VENUES);
        $name = $venue['name'].' '.fake()->unique()->numberBetween(1, 9999);

        return [
            /*
             * Left to BelongsToTenant, which stamps it from the active
             * TenantContext. There is no Tenant factory to fall back on — the
             * model has no HasFactory — and inventing a restaurant here would
             * hide the fact that a branch cannot exist without one. A caller
             * with no tenant context must pass tenant_id, and the NOT NULL
             * column says so if they forget.
             */
            'name' => $name,
            'slug' => Str::slug($name),
            'code' => $venue['code'],
            'city' => $venue['city'],
            'address' => fake()->streetAddress(),
            'phone' => '+998 '.fake()->numberBetween(90, 99).' '.fake()->numerify('### ## ##'),
            'timezone' => 'Asia/Tashkent',
            'status' => 'active',
            'opened_at' => fake()->dateTimeBetween('-4 years', '-1 month'),
            'settings' => null,
        ];
    }

    /**
     * A named venue, for seeders and tests that care which branch they got.
     */
    public function named(string $name, ?string $code = null, string $city = 'Toshkent'): self
    {
        return $this->state(fn (): array => [
            'name' => $name,
            'slug' => Str::slug($name),
            'code' => $code,
            'city' => $city,
        ]);
    }

    public function suspended(): self
    {
        return $this->state(fn (): array => ['status' => 'suspended']);
    }
}
