<?php

declare(strict_types=1);

namespace Database\Factories;

use App\Models\Tenant;
use App\Models\User;
use App\Support\Tenancy\TenantContext;
use Illuminate\Database\Eloquent\Factories\Factory;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;

/**
 * @extends Factory<User>
 */
class UserFactory extends Factory
{
    /**
     * The current password being used by the factory.
     */
    protected static ?string $password;

    /**
     * Define the model's default state.
     *
     * Every user belongs to a restaurant, and this default used to say the
     * opposite — "deliberately no tenant, so the tenant middleware stays out of
     * the way". That was true while tenancy was advisory. It is not any more:
     * production refuses a tenantless non-operator request outright
     * (TENANCY_REQUIRE_TENANT), and row-level security lets them read nothing
     * and write nothing. The factory was modelling somebody who cannot exist,
     * and 156 tests were quietly built on them.
     *
     * The ambient restaurant wins when there is one — most module tests set a
     * TenantContext in setUp and expect their user to be part of it — and one
     * is created otherwise. A test that genuinely wants the tenantless case,
     * the platform operator, still says so with ['tenant_id' => null].
     *
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        return [
            'tenant_id' => fn (): int => app(TenantContext::class)->id()
                ?? Tenant::factory()->create()->id,
            'name' => fake()->name(),
            'email' => fake()->unique()->safeEmail(),
            'phone' => '+998'.fake()->unique()->numerify('9########'),
            'locale' => 'uz',
            'is_active' => true,
            'email_verified_at' => now(),
            'password' => static::$password ??= Hash::make('password'),
            'remember_token' => Str::random(10),
        ];
    }

    /**
     * Indicate that the model's email address should be unverified.
     */
    public function unverified(): static
    {
        return $this->state(fn (array $attributes) => [
            'email_verified_at' => null,
        ]);
    }

    /** A suspended employee: history kept, sign-in refused. */
    public function inactive(): static
    {
        return $this->state(['is_active' => false]);
    }

    public function forTenant(Tenant|int $tenant): static
    {
        return $this->state([
            'tenant_id' => $tenant instanceof Tenant ? $tenant->id : $tenant,
        ]);
    }
}
