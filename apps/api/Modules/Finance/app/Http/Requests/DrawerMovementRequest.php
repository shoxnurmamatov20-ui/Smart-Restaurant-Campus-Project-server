<?php

declare(strict_types=1);

namespace Modules\Finance\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

/**
 * Notes going into or out of the drawer for a reason that is not a sale.
 *
 * `reason` is required and has a minimum length, and both are deliberate: a cash
 * movement with no reason is the record an investigation cannot use, and "x" is
 * the reason somebody types when the field merely exists.
 *
 * The amount may be counted by note. It usually is not — a manager handing over
 * a bundle of small notes says "50 000" — so the breakdown is optional here in a
 * way it is not at closing time.
 */
final class DrawerMovementRequest extends FormRequest
{
    /** Route middleware (`permission:finance.update`) enforces authorisation. */
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
            'amount' => ['required_without:denominations', 'nullable', 'integer', 'min:1'],
            'denominations' => ['sometimes', 'array'],
            'denominations.*' => ['integer', 'min:0'],
            'reason' => ['required', 'string', 'min:3', 'max:255'],
            'witnessed_by_user_id' => ['nullable', 'integer', 'exists:users,id'],
        ];
    }

    /**
     * @return array<array-key, int|string>
     */
    public function denominations(): array
    {
        /** @var array<array-key, int|string> $notes */
        $notes = $this->validated('denominations', []);

        return $notes;
    }
}
