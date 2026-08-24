<?php

declare(strict_types=1);

namespace Modules\Board\Http\Requests;

use App\Contracts\Menu\MenuCatalog;
use App\Contracts\Menu\Section;
use App\Support\Tenancy\BranchContext;
use App\Support\Tenancy\TenantContext;
use Closure;
use Illuminate\Database\Query\Builder;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;
use Modules\Board\Models\BoardColumn;

final class StoreBoardColumnRequest extends FormRequest
{
    /**
     * Route middleware (`permission:board.create`) enforces authorisation.
     */
    public function authorize(): bool
    {
        return true;
    }

    /**
     * @return array<string, array<int, mixed>>
     */
    public function rules(): array
    {
        $tenantId = app(TenantContext::class)->id();
        $branchId = app(BranchContext::class)->id();

        return [
            /*
             * A pointer into Menu, checked through the contract.
             *
             * NOT `exists:menu.menu_categories,id`. That rule would read another
             * module's table from a string, which is the same coupling as an
             * import with none of the visibility — and `ModuleBoundaryTest`
             * would have missed it, because it matches bare table names and the
             * schema prefix slips past the pattern. Passing a rule on a
             * technicality is worse than failing it.
             *
             * `MenuCatalog::board()` is the sanctioned door and it answers a
             * better question than existence: a section with nothing sellable
             * under it draws an empty heading on a wall, which reads as a broken
             * board rather than an empty category.
             */
            'menu_category_id' => [
                'required', 'integer', 'min:1',
                $this->mustBeASectionOfThisMenu(),
                // One heading per section on one wall. Two rows for the same
                // category is the same dishes printed twice under two headings.
                Rule::unique(BoardColumn::class, 'menu_category_id')
                    ->where(fn (Builder $query) => $query
                        ->where('tenant_id', $tenantId)
                        ->where('branch_id', $branchId)),
            ],

            // `#RRGGBB`, uppercase or lower. The board's own palette rather than
            // a console token — see BoardColumn.
            'accent' => ['nullable', 'string', 'regex:/^#[0-9A-Fa-f]{6}$/'],

            'position' => ['nullable', 'integer', 'min:0', 'max:65535'],
            'is_visible' => ['nullable', 'boolean'],
        ];
    }

    /**
     * The section has to be one this restaurant's menu actually offers.
     *
     * A closure rather than a rule object: it is one condition used in one
     * place, and a `SectionOfThisMenu` class would be a file whose whole content
     * is the four lines below plus a namespace.
     */
    private function mustBeASectionOfThisMenu(): Closure
    {
        return static function (string $attribute, mixed $value, Closure $fail): void {
            $sections = array_map(
                static fn (Section $section): int => $section->id,
                app(MenuCatalog::class)->board(),
            );

            if (! in_array((int) $value, $sections, true)) {
                $fail("Bunday menyu bo'limi yo'q yoki unda sotuvdagi taom yo'q.");
            }
        };
    }

    /**
     * @return array<string, string>
     */
    public function messages(): array
    {
        return [
            'menu_category_id.required' => "Ustun uchun menyu bo'limi tanlanishi kerak.",
            'menu_category_id.unique' => "Bu bo'lim tabloda allaqachon bor.",
            'accent.regex' => 'Rang #RRGGBB ko\'rinishida bo\'lishi kerak.',
        ];
    }
}
