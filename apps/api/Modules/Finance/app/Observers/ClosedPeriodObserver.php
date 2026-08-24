<?php

declare(strict_types=1);

namespace Modules\Finance\Observers;

use Illuminate\Database\Eloquent\Model;
use Modules\Finance\Services\PeriodLock;

/**
 * The gate on every money row in this module.
 *
 * One observer for three models — `Payment`, `Expense`, `CashMovement` — because
 * the rule is about the row's trading day and nothing else, and three copies of
 * it would be three chances for one of them to be forgotten when a fourth money
 * table arrives.
 *
 * ---------------------------------------------------------------------------
 * Creating, updating and deleting, and each for a different reason
 *
 * **Creating** is the obvious one: an invoice dated the 3rd of a closed month,
 * entered on the 20th of this one.
 *
 * **Updating** is the one that would have been missed. Editing a closed month's
 * expense from 400 000 to 4 000 000 changes a signed statement just as much as
 * adding a row does, and it leaves no trace on the period. The ORIGINAL day is
 * what is checked as well as the new one — moving a row OUT of a closed month is
 * as much a rewrite as moving one in.
 *
 * **Deleting** because a soft delete is an amount removed from a total. A
 * payment struck from a closed January makes January's revenue lower than the
 * figure that went to the tax office.
 *
 * ---------------------------------------------------------------------------
 * `HasBusinessDate` stamps first
 *
 * Both traits hook `creating`. `BelongsToTenant` boots from the model's own
 * `use` list and `HasBusinessDate` with it, and an observer registered from a
 * service provider runs after the traits' listeners — so by the time this runs,
 * `business_date` is filled and `tenant_id` is stamped. That ordering is what
 * lets this ask one question instead of re-deriving the trading day.
 */
final class ClosedPeriodObserver
{
    public function __construct(private readonly PeriodLock $lock) {}

    public function creating(Model $model): void
    {
        $this->lock->assertOpen(
            $model->getAttribute('business_date'),
            'create:'.$model->getTable(),
        );
    }

    public function updating(Model $model): void
    {
        // Both ends. See the class docblock: moving a row out of a closed month
        // rewrites that month exactly as much as moving one in.
        $this->lock->assertOpen(
            $model->getOriginal('business_date'),
            'update:'.$model->getTable(),
        );

        $this->lock->assertOpen(
            $model->getAttribute('business_date'),
            'update:'.$model->getTable(),
        );
    }

    public function deleting(Model $model): void
    {
        $this->lock->assertOpen(
            $model->getOriginal('business_date'),
            'delete:'.$model->getTable(),
        );
    }
}
