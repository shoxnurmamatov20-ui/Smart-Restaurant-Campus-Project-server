<?php

declare(strict_types=1);

namespace Modules\Finance\Http\Requests;

/**
 * Passing the till to the next person without emptying it.
 *
 * Everything a close needs, plus who is taking over. The notes stay in the
 * drawer and become that person's float — so there is deliberately no field
 * here for the incoming float. A second number for the same drawer could only
 * ever be a second opinion about it.
 */
final class HandOverShiftRequest extends CloseShiftRequest
{
    /**
     * @return array<string, array<int, mixed>>
     */
    public function rules(): array
    {
        return parent::rules() + [
            'to_user_id' => ['required', 'integer', 'exists:users,id'],
        ];
    }
}
