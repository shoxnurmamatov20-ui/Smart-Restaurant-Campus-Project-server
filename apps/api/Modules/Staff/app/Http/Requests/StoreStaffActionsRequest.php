<?php

declare(strict_types=1);

namespace Modules\Staff\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;
use Modules\Staff\Models\StaffAction;

/**
 * A phone handing over everything it did while it had no signal.
 *
 * The shape mirrors `apps/mobile/src/crew/queue.ts`: an ordered list, each
 * entry carrying the phone's own id for it. That id is the whole reason a
 * resend costs nothing — see the migration.
 *
 * Validation here is deliberately shallow. It refuses a batch that is not a
 * batch, and nothing else: a single entry with a nonsense payload comes back
 * `rejected` with a code its owner can read, because failing the request would
 * strand the eleven good entries beside it in a queue that never empties.
 */
final class StoreStaffActionsRequest extends FormRequest
{
    /**
     * Authorisation is per entry, not per request — see
     * StaffActionController::PERMISSION_FOR. A batch is one route carrying
     * eight verbs, and guarding it with one permission would either lock out
     * the waiter it exists for or hand a storekeeper's powers to everybody.
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
            /*
             * A ceiling, because a queue that has been offline for a weekend is
             * still a queue somebody has to wait for. Two hundred entries is
             * more than a double shift produces and small enough to answer
             * inside one request.
             */
            'entries' => ['required', 'array', 'min:1', 'max:200'],

            // The phone's own id. Stable across every retry, unique per person.
            'entries.*.local_id' => ['required', 'string', 'max:64'],
            'entries.*.kind' => ['required', Rule::in(StaffAction::KINDS)],

            /*
             * When the person did it, not when we heard about it. Required, and
             * that is the point of the whole endpoint: defaulting to `now()`
             * would date a night's work to the morning the network came back
             * and put every entry on the wrong trading day.
             */
            'entries.*.at' => ['required', 'date'],
            'entries.*.payload' => ['nullable', 'array'],
        ];
    }
}
