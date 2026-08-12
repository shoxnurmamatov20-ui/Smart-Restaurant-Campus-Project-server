<?php

declare(strict_types=1);

namespace App\Rules;

use App\Contracts\Menu\MenuCatalog;
use Closure;
use Illuminate\Contracts\Validation\ValidationRule;

/**
 * "This dish is on our menu" — without naming another module's table.
 *
 * `exists:menu_items,id` reads harmlessly but is the same coupling as an import
 * with none of the visibility: it hard-codes Menu's table name into Orders, and
 * a reviewer skimming the use statements would never see it. It is also subtly
 * wrong on a multi-tenant platform, because the rule matches any restaurant's
 * dish unless every call site remembers to add the tenant condition.
 *
 * The catalogue answers per restaurant by construction.
 */
final readonly class DishExists implements ValidationRule
{
    public function __construct(private MenuCatalog $menu) {}

    public function validate(string $attribute, mixed $value, Closure $fail): void
    {
        if ($value === null || $value === '') {
            return;
        }

        if (! is_numeric($value) || $this->menu->find((int) $value) === null) {
            $fail('Bunday taom menyuda topilmadi.');
        }
    }
}
