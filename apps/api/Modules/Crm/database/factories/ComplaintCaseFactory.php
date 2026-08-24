<?php

declare(strict_types=1);

namespace Modules\Crm\Database\Factories;

use Illuminate\Database\Eloquent\Factories\Factory;
use Modules\Crm\Models\ComplaintCase;

/**
 * @extends Factory<ComplaintCase>
 */
final class ComplaintCaseFactory extends Factory
{
    protected $model = ComplaintCase::class;

    public function definition(): array
    {
        return [
            'number' => 'SH-'.$this->faker->unique()->numberBetween(1000, 9999),
            'channel' => 'web',
            'kind' => 'missing',
            'guest_name' => 'Nilufar Yusupova',
            'guest_phone' => '+998901234567',
            /*
             * 24 000 so'm — below the auto-refund ceiling on purpose. The
             * default case is the one anybody may answer, so a test that wants
             * the manager path has to ask for it and says so by asking.
             */
            'amount_tiyin' => 2400000,
            'amount_note' => "3 × Ko'k choy",
            'quote' => 'Uch choy buyurtma qildim, ikkitasi keldi.',
            'photos' => null,
            'status' => 'open',
            'due_at' => now()->addHours(4),
        ];
    }

    /** Above the ceiling: the answer that needs somebody senior. */
    public function expensive(): static
    {
        return $this->state(['amount_tiyin' => 8800000]);
    }

    public function decided(string $outcome = 'refunded'): static
    {
        return $this->state([
            'outcome' => $outcome,
            'outcome_tiyin' => 2400000,
            'decided_at' => now(),
            'status' => 'resolved',
        ]);
    }

    public function overdue(): static
    {
        return $this->state(['due_at' => now()->subHour()]);
    }
}
