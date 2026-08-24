<?php

declare(strict_types=1);

namespace Modules\Crm\Database\Factories;

use Illuminate\Database\Eloquent\Factories\Factory;
use Modules\Crm\Models\Trigger;

/**
 * @extends Factory<Trigger>
 */
final class TriggerFactory extends Factory
{
    protected $model = Trigger::class;

    public function definition(): array
    {
        return [
            'key' => $this->faker->unique()->lexify('trg???'),
            'kind' => 'win_back',
            'name' => ['uz' => 'Qaytarish xabari', 'ru' => 'Возврат клиента', 'en' => 'Win-back'],
            'rule_text' => null,
            'body' => "Sizni sog'indik. Keyingi tashrifingizga 15% chegirma.",
            'offset_days' => 60,
            'offset_hours' => 0,
            'cooldown_days' => 90,
            'min_tiyin' => 0,
            // Off by default, exactly as the request's own default is: an
            // automation that started sending the moment it existed would send
            // its first run against a rule nobody had read back.
            'is_active' => false,
        ];
    }

    public function active(): static
    {
        return $this->state(['is_active' => true]);
    }

    public function birthday(int $daysBefore = 3): static
    {
        return $this->state(['kind' => 'birthday', 'offset_days' => $daysBefore]);
    }

    public function firstVisit(int $hoursAfter = 2): static
    {
        return $this->state(['kind' => 'first_visit', 'offset_days' => 0, 'offset_hours' => $hoursAfter]);
    }
}
