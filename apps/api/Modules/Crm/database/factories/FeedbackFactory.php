<?php

declare(strict_types=1);

namespace Modules\Crm\Database\Factories;

use Illuminate\Database\Eloquent\Factories\Factory;
use Modules\Crm\Models\Feedback;

/**
 * @extends Factory<Feedback>
 */
final class FeedbackFactory extends Factory
{
    protected $model = Feedback::class;

    public function definition(): array
    {
        return [
            'score' => $this->faker->numberBetween(1, 5),
            'comment' => $this->faker->sentence(),
            'source' => 'bot',
            'is_urgent' => false,
            'status' => 'new',
        ];
    }

    public function negative(): static
    {
        return $this->state(['score' => 1, 'is_urgent' => true]);
    }

    public function resolved(): static
    {
        return $this->state(['status' => 'resolved', 'resolved_at' => now()]);
    }
}
