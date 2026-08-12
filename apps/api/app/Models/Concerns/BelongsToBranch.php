<?php

declare(strict_types=1);

namespace App\Models\Concerns;

use App\Models\Branch;
use App\Support\Tenancy\BranchContext;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * For rows that belong to one venue rather than to the business as a whole.
 *
 * A table, an order, a kitchen ticket, a till shift and a stock movement all
 * happen somewhere. A menu item and a customer do not — those belong to the
 * restaurant and are shared by every branch, so they use BelongsToTenant alone.
 *
 * The scope only narrows when a branch is actually set. With no branch the row
 * set is every venue of the current tenant, which is what an owner's dashboard
 * and every cross-branch report want; the tenant scope is still doing its job
 * underneath. This is deliberately unlike BelongsToTenant, where an empty
 * context is a hole rather than a roll-up.
 *
 * Use together with BelongsToTenant, not instead of it: a query filtered only
 * by branch id would read another restaurant's rows the moment two tenants
 * happen to hold branches with the same id — and they will.
 */
trait BelongsToBranch
{
    protected static function bootBelongsToBranch(): void
    {
        static::creating(static function (Model $model): void {
            $context = app(BranchContext::class);

            if ($context->hasBranch() && $model->getAttribute('branch_id') === null) {
                $model->setAttribute('branch_id', $context->id());
            }
        });

        static::addGlobalScope('branch', static function (Builder $builder): void {
            $branchId = app(BranchContext::class)->id();

            if ($branchId !== null) {
                $builder->where($builder->getModel()->getTable().'.branch_id', $branchId);
            }
        });
    }

    public function branch(): BelongsTo
    {
        return $this->belongsTo(Branch::class);
    }
}
