<?php

declare(strict_types=1);

namespace App\Support\Tenancy;

use App\Models\Branch;

/**
 * Which venue the current request is operating in.
 *
 * Sits one level below TenantContext and differs from it in one important way:
 * having no branch is a legitimate state, not a misconfiguration. An owner
 * looking at the group's revenue is deliberately unscoped across venues, while
 * the tenant scope still holds. TenantContext being empty is a hole; this one
 * being empty is a roll-up.
 */
final class BranchContext
{
    private ?Branch $branch = null;

    public function set(?Branch $branch): void
    {
        $this->branch = $branch;
    }

    public function branch(): ?Branch
    {
        return $this->branch;
    }

    public function id(): ?int
    {
        return $this->branch?->id;
    }

    public function hasBranch(): bool
    {
        return $this->branch !== null;
    }

    public function clear(): void
    {
        $this->branch = null;
    }
}
