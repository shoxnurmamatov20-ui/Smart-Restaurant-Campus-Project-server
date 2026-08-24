<?php

declare(strict_types=1);

namespace Modules\Board\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

/**
 * One ordered list of ids, for one write.
 *
 * Reordering by N PATCHes is N chances to end up with two rows at position 3 —
 * a tab closed halfway through, a lost response, a second manager dragging the
 * same list at the same moment. Whichever of those happens, the wall draws two
 * headings in an order nobody chose and the console shows the arrows working.
 * So the whole list travels together and the controller assigns 0..n-1 inside
 * one transaction.
 *
 * The list must be COMPLETE — every row this venue has, exactly once. That is
 * not strictness for its own sake: a partial list means the rows it does not
 * name keep positions the named ones are now being assigned, which is the same
 * two-rows-at-3 the single write exists to prevent. The client holding the
 * arrows already has the whole list; sending a subset is a bug, and it should
 * fail where the bug is rather than at the wall.
 *
 * Shared by columns and the playlist. Both are ordered lists of the same shape,
 * and the argument above does not change between them.
 */
final class ReorderBoardRequest extends FormRequest
{
    /**
     * Route middleware (`permission:board.update`) enforces authorisation.
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
        return [
            'ids' => ['required', 'array', 'min:1'],
            'ids.*' => ['required', 'integer', 'min:1', 'distinct'],
        ];
    }

    /**
     * The ids in the order they should be drawn.
     *
     * @return array<int, int>
     */
    public function ids(): array
    {
        /** @var array<int, mixed> $ids */
        $ids = $this->input('ids', []);

        return array_values(array_map(static fn ($id): int => (int) $id, $ids));
    }

    /**
     * @return array<string, string>
     */
    public function messages(): array
    {
        return [
            'ids.required' => "Tartib ro'yxati bo'sh bo'lishi mumkin emas.",
            'ids.*.distinct' => "Bitta qator ro'yxatda ikki marta.",
        ];
    }
}
