<?php

declare(strict_types=1);

namespace Modules\Menu\Services;

use App\Contracts\Menu\Dish;
use App\Contracts\Menu\MenuCatalog;
use App\Contracts\Menu\ModifierChoice;
use App\Contracts\Menu\ModifierQuestion;
use App\Contracts\Menu\Section;
use Illuminate\Database\Eloquent\Collection;
use Modules\Menu\Models\MenuCategory;
use Modules\Menu\Models\MenuItem;
use Modules\Menu\Models\ModifierGroup;
use Modules\Menu\Models\ModifierOption;
use RuntimeException;

/**
 * Menu's side of the read contract.
 *
 * The only place in the codebase where another module's request for a dish
 * meets Eloquent. Everything crossing the boundary leaves as a
 * {@see Dish} — a value object with no relations, no lazy loads, and nothing
 * a caller could accidentally save.
 *
 * Tenant scoping is not applied here: MenuItem carries the BelongsToTenant
 * global scope already, so a caller can only ever see its own restaurant.
 */
final class EloquentMenuCatalog implements MenuCatalog
{
    public function __construct(private readonly EloquentStopList $stops) {}

    public function find(int $id): ?Dish
    {
        $item = MenuItem::query()->find($id);

        return $item === null ? null : $this->toDish($item);
    }

    public function findBySku(string $sku): ?Dish
    {
        $item = MenuItem::query()->where('sku', $sku)->first();

        return $item === null ? null : $this->toDish($item);
    }

    /**
     * @return array<int, Section>
     */
    public function sellable(string $channel = 'dine_in'): array
    {
        /*
         * The board, minus what this kitchen has run out of.
         *
         * Expressed in terms of `board()` rather than as a second query, so the two
         * cannot answer differently about the same menu. The subtraction is the
         * whole difference between them, and it is one line here instead of a
         * condition duplicated into four callers — three of which would eventually
         * forget it, and the way that shows up is a guest ordering something the
         * kitchen cannot cook.
         */
        return array_values(array_filter(array_map(
            static function (Section $section): ?Section {
                $available = array_values(array_filter(
                    $section->dishes,
                    static fn (Dish $dish): bool => ! $dish->isStopped,
                ));

                // A section whose every dish is off disappears rather than sitting
                // there empty. A heading with nothing under it is noise on a phone.
                return $available === [] ? null : new Section(
                    id: $section->id,
                    slug: $section->slug,
                    title: $section->title,
                    dishes: $available,
                );
            },
            $this->board($channel),
        )));
    }

    /**
     * @return array<int, Section>
     */
    public function board(string $channel = 'dine_in'): array
    {
        /*
         * What this kitchen has run out of. Ids, not dishes — the catalogue is
         * already in hand and this only marks it up.
         *
         * Empty when the request has no branch, which is honest rather than
         * convenient: somebody reading across the whole business is not standing in
         * a kitchen, and no single 86 sheet applies to them.
         */
        $stopped = $this->stops->stoppedItemIds();

        return MenuCategory::query()
            ->active()
            ->root()
            ->with([
                'items' => fn ($query) => $query->orderable()->forChannel($channel)->orderBy('sort_order'),
            ])
            ->orderBy('sort_order')
            ->get()
            ->reject(fn (MenuCategory $category): bool => $category->items->isEmpty())
            ->map(fn (MenuCategory $category): Section => new Section(
                id: $category->id,
                slug: $category->slug,
                title: $category->title ?? $category->slug,
                dishes: $category->items
                    ->map(fn (MenuItem $item): Dish => $this->toDish(
                        $item,
                        isStopped: in_array((int) $item->id, $stopped, true),
                    ))
                    ->all(),
            ))
            ->values()
            ->all();
    }

    /**
     * @return array<int, ModifierQuestion>
     */
    public function questionsFor(int $dishId): array
    {
        /** @var MenuItem|null $item */
        $item = MenuItem::query()
            ->with(['modifierGroups' => fn ($query) => $query->active()->with(
                ['options' => fn ($options) => $options->active()],
            )])
            ->find($dishId);

        if ($item === null) {
            return [];
        }

        return $item->modifierGroups
            // A question with no answers left cannot be asked. It happens when
            // every option in a group is switched off rather than the group.
            ->reject(fn (ModifierGroup $group): bool => $group->options->isEmpty())
            ->map(fn (ModifierGroup $group): ModifierQuestion => new ModifierQuestion(
                id: $group->id,
                // Already resolved for the request locale by HasTranslations.
                title: $group->title ?? '',
                isMulti: $group->is_multi,
                minChoices: $group->min_choices,
                maxChoices: $group->max_choices,
                choices: $group->options
                    ->map(fn (ModifierOption $option): ModifierChoice => new ModifierChoice(
                        id: $option->id,
                        title: $option->title ?? '',
                        priceDelta: $option->price_delta,
                    ))
                    ->all(),
            ))
            ->values()
            ->all();
    }

    public function prepMinutes(int $dishId): int
    {
        /*
         * One column, no model. `find()` would hydrate a dish, its casts and its
         * translation map to read a smallint, and Orders asks this once per line
         * of a basket.
         */
        $minutes = MenuItem::query()
            ->whereKey($dishId)
            ->value('cook_time_minutes');

        // A dish this restaurant does not have, or one somebody saved with a
        // zero. Both answer the configured default rather than "immediately".
        return $minutes === null || (int) $minutes <= 0
            ? (int) config('menu.default_prep_minutes', 15)
            : (int) $minutes;
    }

    /**
     * @param array<int, int> $choiceIds
     *
     * @return array<int, ModifierChoice>
     */
    public function priceChoices(int $dishId, array $choiceIds): array
    {
        if ($choiceIds === []) {
            // Still checked: a group with min_choices >= 1 makes "no answers" a
            // refusal rather than a shortcut.
            $this->assertRulesHold($dishId, []);

            return [];
        }

        $wanted = array_values(array_unique(array_map('intval', $choiceIds)));

        /** @var Collection<int, ModifierOption> $options */
        $options = ModifierOption::query()
            ->active()
            ->whereIn('id', $wanted)
            // Scoped to this dish through the pivot, which is the check that
            // stops "extra meat" being added to a cup of tea because both live
            // in the same restaurant.
            ->whereIn('modifier_group_id', function ($query) use ($dishId): void {
                $query->select('modifier_group_id')
                    ->from('menu_item_modifier_group')
                    ->where('menu_item_id', $dishId);
            })
            ->get();

        if ($options->count() !== count($wanted)) {
            // Refuse rather than take the ones we recognise. A kitchen ticket
            // that quietly lost "no onion" is worse than an order that failed.
            throw new RuntimeException('Tanlangan qo\'shimchalardan biri bu taomga tegishli emas.');
        }

        $this->assertRulesHold($dishId, $options->all());

        return $options
            ->map(fn (ModifierOption $option): ModifierChoice => new ModifierChoice(
                id: $option->id,
                title: $option->title ?? '',
                priceDelta: $option->price_delta,
            ))
            ->all();
    }

    /**
     * Every group's min and max, against what was actually chosen.
     *
     * Enforced here and not only in the client because a rule a client enforces
     * is a rule an offline queue, an aggregator and a stale bundle do not.
     *
     * @param array<int, ModifierOption> $chosen
     */
    private function assertRulesHold(int $dishId, array $chosen): void
    {
        $countByGroup = [];

        foreach ($chosen as $option) {
            $countByGroup[$option->modifier_group_id] = ($countByGroup[$option->modifier_group_id] ?? 0) + 1;
        }

        /** @var MenuItem|null $item */
        $item = MenuItem::query()
            ->with(['modifierGroups' => fn ($query) => $query->active()])
            ->find($dishId);

        if ($item === null) {
            // No dish, no rules to break. The caller's own "unknown dish" check
            // is what refuses; this one just has nothing to say.
            return;
        }

        foreach ($item->modifierGroups as $group) {
            $picked = $countByGroup[$group->id] ?? 0;

            if ($picked < $group->min_choices) {
                throw new RuntimeException(sprintf(
                    '"%s" uchun kamida %d variant tanlanishi kerak.',
                    $group->title ?? '',
                    $group->min_choices,
                ));
            }

            if ($picked > $group->max_choices) {
                throw new RuntimeException(sprintf(
                    '"%s" uchun ko\'pi bilan %d variant tanlash mumkin.',
                    $group->title ?? '',
                    $group->max_choices,
                ));
            }
        }
    }

    private function toDish(MenuItem $item, bool $isStopped = false): Dish
    {
        return new Dish(
            id: $item->id,
            sku: $item->sku,
            // `title` is already resolved for the request locale, so a Russian
            // guest's bill prints Russian dish names.
            title: $item->title ?? $item->sku,
            description: $item->translate('description'),
            station: $item->station,
            price: $item->price,
            currency: $item->currency ?? 'UZS',
            isOrderable: $item->is_orderable,
            cookTimeMinutes: $item->cook_time_minutes,
            allergens: $item->allergens ?? [],
            kind: $item->kind,
            imageUrl: $item->imageUrl(),
            // Defaults false, so `find()` and `findBySku()` — which answer about
            // one dish for a bill line — stay unchanged. The line is refused by
            // the registry, which checks the sheet itself; a flag here would be a
            // second place to keep the same rule.
            isStopped: $isStopped,
            // Inert until a fiscal driver reads it, and null on most of a menu.
            // See the migration that added the column.
            plu: $item->plu,
            image: $item->imageSet()?->toArray(),
        );
    }
}
