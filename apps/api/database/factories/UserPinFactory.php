<?php

declare(strict_types=1);

namespace Database\Factories;

use App\Models\User;
use App\Models\UserPin;
use Illuminate\Database\Eloquent\Factories\Factory;
use Illuminate\Support\Facades\Hash;

/**
 * @extends Factory<UserPin>
 */
final class UserPinFactory extends Factory
{
    protected $model = UserPin::class;

    /**
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        return [
            'user_id' => User::factory(),
            'pin_hash' => Hash::make('1234'),
            'failed_attempts' => 0,
        ];
    }

    public function forUser(User $user): static
    {
        return $this->state(fn (): array => ['user_id' => $user->id, 'tenant_id' => $user->tenant_id]);
    }

    public function withPin(string $pin): static
    {
        return $this->state(fn (): array => ['pin_hash' => Hash::make($pin)]);
    }

    public function locked(): static
    {
        return $this->state(fn (): array => [
            'failed_attempts' => 5,
            'locked_until' => now()->addMinutes(15),
        ]);
    }
}
