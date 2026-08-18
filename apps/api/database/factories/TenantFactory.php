<?php

declare(strict_types=1);

namespace Database\Factories;

use App\Models\Tenant;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * A restaurant business.
 *
 * Written because UserFactory needs one: with row-level security live, a user
 * who belongs to no restaurant can read nothing and write nothing, and in
 * production TENANCY_REQUIRE_TENANT refuses their requests outright. A factory
 * that produced such a user was modelling somebody who cannot exist.
 *
 * @extends Factory<Tenant>
 */
final class TenantFactory extends Factory
{
    protected $model = Tenant::class;

    /**
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        $name = fake()->unique()->company();

        return [
            'name' => $name,
            'slug' => str($name)->slug()->limit(40, '')->toString().'-'.fake()->unique()->numberBetween(1, 999999),
            'country_code' => 'UZ',
            'locale' => 'uz',
            'timezone' => 'Asia/Tashkent',
            'status' => 'active',
        ];
    }
}
