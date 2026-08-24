<?php

declare(strict_types=1);

namespace Modules\Menu\Database\Factories;

use Illuminate\Database\Eloquent\Factories\Factory;
use Modules\Menu\Models\MenuItem;
use Modules\Menu\Models\RecipeLine;

/**
 * @extends Factory<RecipeLine>
 */
final class RecipeLineFactory extends Factory
{
    protected $model = RecipeLine::class;

    /**
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        return [
            'menu_item_id' => MenuItem::factory(),
            /*
             * A raw-goods line by default, with the id left to the caller.
             *
             * There is no `Ingredient::factory()` reachable from here — Menu may
             * not import Inventory — and inventing an id would produce a line
             * whose component never resolves. A test that wants a costed card
             * passes the real id it just made; one that only needs a row on the
             * card gets this.
             */
            'ingredient_id' => 1,
            'prep_item_id' => null,
            'quantity' => $this->faker->numberBetween(10, 400),
            'sort' => 0,
        ];
    }

    /** A line that points at something the kitchen made rather than bought. */
    public function prep(int $prepItemId): self
    {
        return $this->state(fn (): array => [
            'ingredient_id' => null,
            'prep_item_id' => $prepItemId,
        ]);
    }
}
