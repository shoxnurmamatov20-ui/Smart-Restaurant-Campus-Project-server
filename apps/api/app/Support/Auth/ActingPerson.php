<?php

declare(strict_types=1);

namespace App\Support\Auth;

use App\Models\User;
use Illuminate\Support\Facades\Auth;

/**
 * Which human is behind this request, if any.
 *
 * `Auth::id()` answers a different question than it appears to, and the difference
 * is silent. Sanctum authenticates a *tokenable*, and this platform has two kinds:
 * a `User`, and — for a paired till holding a device token — a
 * `Modules\Pos\Models\Terminal`. On a terminal-authenticated request `Auth::id()`
 * returns a terminal id: a number from a different table, in the same range, with
 * nothing to mark it as foreign.
 *
 * Written into a column that means "person", the results run from bad to worse:
 *
 *   With a foreign key, it throws. That is the lucky outcome, and it is how this
 *   was found — an insert into `menu.menu_stop_list` refused because a terminal id
 *   was not present in `users`.
 *
 *   Without one — `domain_events.actor_id` has no constraint — it is accepted. If
 *   the terminal id happens to match a real user id, and in a small deployment it
 *   usually will, the audit trail then says a named employee did something they
 *   were not in the building for. Nothing anywhere reports it, and the record looks
 *   exactly like a true one.
 *
 * So the principal is checked rather than trusted, and anything that is not a
 * person answers null. That is not a loss of information: "a till did this, and we
 * do not know who was standing at it" is the honest record, and every column that
 * takes this value is nullable precisely because system-driven and device-driven
 * writes exist. Who was signed in at a till is a separate fact, held by the
 * terminal session, and a caller that needs it should read it from there.
 */
final class ActingPerson
{
    /** The signed-in person's id, or null when the principal is not a person. */
    public static function id(): ?int
    {
        $principal = Auth::user();

        return $principal instanceof User ? (int) $principal->getKey() : null;
    }
}
