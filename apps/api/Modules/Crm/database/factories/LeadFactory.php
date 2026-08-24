<?php

declare(strict_types=1);

namespace Modules\Crm\Database\Factories;

use Illuminate\Database\Eloquent\Factories\Factory;
use Modules\Crm\Models\Lead;

/**
 * @extends Factory<Lead>
 */
final class LeadFactory extends Factory
{
    protected $model = Lead::class;

    public function definition(): array
    {
        return [
            'name' => $this->faker->name(),
            'phone' => '+998'.$this->faker->unique()->numerify('9########'),
            'email' => $this->faker->safeEmail(),
            'restaurant' => $this->faker->company(),
            'city' => 'Toshkent',
            'message' => $this->faker->sentence(),
            'source' => 'site',
            'status' => 'new',
            // Today, because the duplicate window is a calendar day and a
            // factory scattering dates would make that rule untestable.
            'captured_on' => now()->startOfDay()->toDateString(),
        ];
    }

    public function contacted(): static
    {
        return $this->state(['status' => 'contacted', 'contacted_at' => now()->subHour()]);
    }
}
