<?php

declare(strict_types=1);

namespace Modules\Staff\Database\Factories;

use App\Models\User;
use Illuminate\Database\Eloquent\Factories\Factory;
use Modules\Staff\Models\StaffDevice;

/**
 * @extends Factory<StaffDevice>
 */
final class StaffDeviceFactory extends Factory
{
    protected $model = StaffDevice::class;

    /**
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        return [
            'user_id' => User::factory(),
            'label' => 'iPhone 13',
            'branch_code' => 'CHILONZOR',
            'status' => 'active',
        ];
    }

    public function forUser(User $user): static
    {
        return $this->state(fn (): array => [
            'user_id' => $user->id,
            'tenant_id' => $user->tenant_id,
        ]);
    }

    /** Already enrolled — the state a phone spends its whole life in. */
    public function paired(): static
    {
        return $this->state(fn (): array => [
            'paired_at' => now(),
            'device_fingerprint' => 'fixture-device',
            'last_seen_at' => now(),
        ]);
    }

    public function revoked(): static
    {
        return $this->state(fn (): array => ['status' => 'revoked']);
    }
}
