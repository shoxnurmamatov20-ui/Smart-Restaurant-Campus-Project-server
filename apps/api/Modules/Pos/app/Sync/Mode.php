<?php

declare(strict_types=1);

namespace Modules\Pos\Sync;

/**
 * What actually happens to a conflicted entry once it has been answered.
 *
 * Three, and the third is the one that would not have been guessed. Most
 * resolutions are the queued write with something corrected, and a few are the
 * write dropped — but `refund_duplicate` is neither: the bill is already
 * settled, so there is no settlement to apply, and the money still has to be
 * recorded and reversed so the books show both halves of what physically
 * happened at two tills.
 */
enum Mode
{
    /** Hand the entry, rewritten, to `SyncDispatcher::apply()`. */
    case Apply;

    /** Write nothing, and tell the queue it is finished with this entry. */
    case Discard;

    /** Capture the tenders against the bill and reverse them in the same request. */
    case RecordAndReverse;
}
