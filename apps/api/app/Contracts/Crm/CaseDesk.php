<?php

declare(strict_types=1);

namespace App\Contracts\Crm;

/**
 * What the rest of the platform may ask the complaints desk.
 *
 * The console's sidebar carries a count beside "Complaints" on every screen
 * — for a week it carried the design's "3", to every restaurant. A count and
 * not a list, for the usual reason: a caller that wants the cases is
 * handling guests and belongs behind `/api/v1/crm/cases` with its checks.
 */
interface CaseDesk
{
    /** Cases still somebody's problem — open or in progress. Null branch = the whole restaurant. */
    public function openCount(?int $branchId = null): int;
}
