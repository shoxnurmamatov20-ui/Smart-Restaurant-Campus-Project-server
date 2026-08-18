<?php

declare(strict_types=1);

namespace App\Contracts\Staff;

/**
 * What the rest of the platform may ask about who is at work.
 *
 * One number on purpose. The POS idle screen prints "Smenada 8"; the KDS
 * header will want the same. Anything richer — names, roles, lateness — is
 * personnel data and stays behind the Staff module's own permissions.
 */
interface Roster
{
    /** People checked in and not yet checked out. Null branch = everywhere. */
    public function onShiftCount(?int $branchId = null): int;
}
