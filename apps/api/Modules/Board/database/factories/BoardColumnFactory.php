<?php

declare(strict_types=1);

namespace Modules\Board\Database\Factories;

use Illuminate\Database\Eloquent\Factories\Factory;
use Modules\Board\Models\BoardColumn;

/**
 * @extends Factory<BoardColumn>
 */
final class BoardColumnFactory extends Factory
{
    protected $model = BoardColumn::class;

    /**
     * The board's own palette, straight off the design.
     *
     * Not tokens, and not random hexes either: these three are the colours the
     * wall screen was drawn with, and a factory inventing `#3F51B5` would put a
     * heading on a demo board that nobody chose and everybody would assume was
     * deliberate.
     *
     * @var array<int, string>
     */
    private const ACCENTS = ['#7FB0FF', '#5EE9B5', '#FFC46B'];

    public function definition(): array
    {
        return [
            /*
             * A category id with no category behind it by default.
             *
             * Board never imports Menu — `ModuleBoundaryTest` refuses it — so a
             * factory here cannot say `MenuCategory::factory()`. There is no
             * foreign key either (the migration says why), so an id that points
             * at nothing is a legal row: it draws an empty column, which is
             * exactly what a section somebody deleted from the menu looks like.
             * Tests and seeders that want a real section pass one in.
             */
            'menu_category_id' => $this->faker->numberBetween(1, 10_000),
            'accent' => $this->faker->randomElement(self::ACCENTS),
            'position' => 0,
            'is_visible' => true,
        ];
    }

    /** A column pointing at a section the menu actually has. */
    public function forSection(int $menuCategoryId, int $position = 0, ?string $accent = null): static
    {
        return $this->state([
            'menu_category_id' => $menuCategoryId,
            'position' => $position,
            'accent' => $accent ?? self::ACCENTS[$position % count(self::ACCENTS)],
        ]);
    }

    public function hidden(): static
    {
        return $this->state(['is_visible' => false]);
    }

    /** Already on the wall, as it would be after a push. */
    public function published(): static
    {
        return $this->state(['published_at' => now()]);
    }
}
