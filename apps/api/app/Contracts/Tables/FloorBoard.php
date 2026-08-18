<?php

declare(strict_types=1);

namespace App\Contracts\Tables;

/**
 * What the rest of the platform may ask the floor plan.
 *
 * The POS idle screen shows "Band 14 · Bo'sh 18" before anyone has signed in,
 * and the manager's phone shows the same pair — neither belongs to the Tables
 * module, and modules do not import each other. This is the read they share.
 *
 * Deliberately a tally and not a list: a caller that needs the actual tables
 * is doing floor work and belongs behind /api/v1/tables, with its permission
 * checks. A count leaks nothing a guest standing in the doorway cannot see.
 */
interface FloorBoard
{
    /** Null branch means the whole restaurant, matching BelongsToBranch. */
    public function tally(?int $branchId = null): FloorTally;
}
