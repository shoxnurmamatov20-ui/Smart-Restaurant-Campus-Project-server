<?php

declare(strict_types=1);

namespace Modules\Tables\Database\Factories;

use App\Models\Branch;
use Illuminate\Database\Eloquent\Factories\Factory;
use Modules\Tables\Models\BookingWindow;

/**
 * @extends Factory<BookingWindow>
 */
final class BookingWindowFactory extends Factory
{
    protected $model = BookingWindow::class;

    public function definition(): array
    {
        return [
            'branch_id' => Branch::factory(),
            // Monday, so a test that does not care about the day still lands on
            // a real one. Weekday is the field tests override most often.
            'weekday' => 1,
            'opens_at' => '12:00',
            'closes_at' => '23:00',
            'slot_minutes' => 30,
            'capacity' => 20,
            'is_active' => true,
        ];
    }

    /** Every day of the week, for a venue that never shuts. */
    public function onWeekday(int $weekday): static
    {
        return $this->state(['weekday' => $weekday]);
    }

    /** A window drawn on the chooser that takes no more bookings. */
    public function full(): static
    {
        return $this->state(['capacity' => 0]);
    }
}
