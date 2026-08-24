<?php

declare(strict_types=1);

namespace Modules\Crm\Console;

use App\Models\Tenant;
use App\Support\Tenancy\BranchContext;
use App\Support\Tenancy\DatabaseTenancy;
use App\Support\Tenancy\TenantContext;
use Illuminate\Console\Command;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Collection;
use Illuminate\Support\Facades\DB;
use Modules\Crm\Models\Campaign;
use Modules\Crm\Models\Customer;
use Modules\Crm\Models\Trigger;
use Modules\Crm\Models\TriggerSend;
use Modules\Crm\Services\CampaignDispatcher;
use Modules\Crm\Services\SmsCost;
use Throwable;

/**
 * The scheduler behind the automation tab's four switches.
 *
 * Runs every morning. For each active trigger it works out who is due today,
 * drops the people who have had this message inside its cooldown, and — if
 * anybody is left — creates ONE campaign carrying them all.
 *
 * ---------------------------------------------------------------------------
 * Why a trigger creates a campaign instead of sending
 *
 * Because there must be exactly one thing on this platform that talks to an SMS
 * gateway, counts parts, records what it cost and can be reported on. A trigger
 * that sent directly would be a second such path, and the first question a
 * marketer asks — "what did we spend on SMS this month" — would have two
 * answers that disagree.
 *
 * It also makes the automation auditable in the same place as everything else:
 * an automated birthday run appears in the campaign list as a campaign, with a
 * recipient count and an invoice against it.
 *
 * ---------------------------------------------------------------------------
 * The cooldown is checked here and recorded here
 *
 * `crm.trigger_sends` gets its rows the moment the campaign is created, not
 * when the gateway answers. A guard that only closed after a successful send
 * would let a gateway outage put the same win-back on the same phone every
 * morning until the outage ended — which is the exact behaviour that gets a
 * sender name blocked by the regulator.
 */
final class RunTriggers extends Command
{
    protected $signature = 'crm:triggers
                            {--tenant= : Only this restaurant, by id}
                            {--key= : Only this trigger, by key}
                            {--dry-run : Report who is due, write nothing}';

    protected $description = 'Fire the automated messages that are due today';

    /**
     * How many people one trigger may reach in one morning.
     *
     * A guard rather than a policy. A restaurant importing a hundred thousand
     * guests with no `last_visit_at` would, on the first night, decide every one
     * of them is due a win-back — a hundred thousand paid messages before
     * anybody was awake to stop it. The ceiling turns that into a number
     * somebody notices.
     */
    private const MAX_PER_RUN = 2000;

    public function handle(DatabaseTenancy $tenancy, TenantContext $tenants, BranchContext $branches): int
    {
        $restaurants = Tenant::query()
            ->when($this->option('tenant') !== null, fn ($query) => $query->whereKey((int) $this->option('tenant')))
            ->orderBy('id')
            ->get();

        $sent = 0;
        $failed = 0;

        foreach ($restaurants as $restaurant) {
            try {
                $sent += $tenancy->focusDuring((int) $restaurant->getKey(), function () use (
                    $restaurant, $tenants, $branches
                ): int {
                    $previousTenant = $tenants->tenant();
                    $previousBranch = $branches->branch();

                    $tenants->set($restaurant);
                    $branches->clear();

                    try {
                        return $this->runFor();
                    } finally {
                        $tenants->set($previousTenant);
                        $branches->set($previousBranch);
                    }
                });
            } catch (Throwable $failure) {
                $failed++;
                $this->error(sprintf('#%d %s — %s', $restaurant->getKey(), $restaurant->slug, $failure->getMessage()));
            }
        }

        $this->info(sprintf(
            '%s: %d mijoz, %d restoran.',
            $this->option('dry-run') ? 'Navbatda (quruq yurish)' : 'Avtomatik xabar yuborildi',
            $sent,
            $restaurants->count() - $failed,
        ));

        return $failed > 0 ? self::FAILURE : self::SUCCESS;
    }

    private function runFor(): int
    {
        $triggers = Trigger::query()
            ->active()
            ->when($this->option('key') !== null, fn ($query) => $query->where('key', (string) $this->option('key')))
            ->orderBy('id')
            ->get();

        $total = 0;

        foreach ($triggers as $trigger) {
            $total += $this->fire($trigger);
        }

        return $total;
    }

    private function fire(Trigger $trigger): int
    {
        $due = $this->due($trigger)->limit(self::MAX_PER_RUN)->get();

        if ($due->isEmpty()) {
            $trigger->forceFill(['last_run_at' => now()])->save();

            return 0;
        }

        if ($this->option('dry-run')) {
            $this->line(sprintf('  %s → %d', $trigger->key, $due->count()));

            return $due->count();
        }

        $campaign = $this->campaignFor($trigger, $due);

        $this->recordSends($trigger, $due, $campaign);

        /*
         * Dispatch through the same path a marketer's own campaign takes, so
         * quiet hours, the delivery rows and the invoice all behave identically.
         * A birthday message that ignored the 21:00 rule because it came from a
         * scheduler rather than a screen would break the same law.
         */
        app(CampaignDispatcher::class)->send($campaign, $due);

        $trigger->forceFill(['last_run_at' => now()])->save();

        return $due->count();
    }

    /**
     * Who this trigger is due to reach today.
     *
     * Each kind is a different question, which is why `kind` is a closed set
     * rather than a stored expression: these are four indexed queries, and a
     * rule language in a column would be four table scans.
     *
     * @return Builder<Customer>
     */
    private function due(Trigger $trigger): Builder
    {
        $query = Customer::query()->active()->whereNotNull('phone')->where('phone', '!=', '');

        $query = match ($trigger->kind) {
            /*
             * Three days BEFORE, so the coupon arrives while it can still be
             * used. `extract` on the stored date rather than a formatted string,
             * so PostgreSQL answers it from the index on `(tenant_id, birthday)`
             * — the same reason `scopeBirthdayToday` is written that way.
             */
            'birthday' => (function (Builder $q) use ($trigger): Builder {
                $target = now()->addDays(max(0, $trigger->offset_days));

                return $q->whereNotNull('birthday')
                    ->whereRaw('extract(month from birthday) = ?', [$target->month])
                    ->whereRaw('extract(day from birthday) = ?', [$target->day]);
            })($query),

            // Not seen for N days, and they had a habit worth winning back.
            'win_back' => $query
                ->whereNotNull('last_visit_at')
                ->where('last_visit_at', '<=', now()->subDays(max(1, $trigger->offset_days)))
                ->where('visits_count', '>=', 2),

            // Their first bill settled N hours ago and no second one has.
            'first_visit' => $query
                ->where('visits_count', 1)
                ->whereNotNull('last_visit_at')
                ->where('last_visit_at', '<=', now()->subHours(max(1, $trigger->offset_hours)))
                ->where('last_visit_at', '>=', now()->subHours(max(1, $trigger->offset_hours) + 24)),

            // A balance worth coming back for, about to lapse.
            'points_expiry' => $query->where('points', '>', 0)
                ->whereRaw('points * 100 >= ?', [$trigger->min_tiyin]),

            default => $query->whereRaw('false'),
        };

        /*
         * The cooldown, as a `not exists` rather than a `whereNotIn`.
         *
         * The subquery is bounded by the index on
         * `(tenant_id, trigger_id, customer_id, created_at)`; a `not in` over a
         * list of ids is a list that grows with every morning this has ever run.
         */
        return $query->whereNotExists(function ($sub) use ($trigger): void {
            $sub->select(DB::raw(1))
                ->from('crm.trigger_sends')
                ->whereColumn('crm.trigger_sends.customer_id', 'crm.customers.id')
                ->where('crm.trigger_sends.trigger_id', $trigger->id)
                ->where('crm.trigger_sends.created_at', '>=', now()->subDays(max(0, $trigger->cooldown_days)));
        });
    }

    /**
     * The campaign this morning's firing becomes.
     *
     * Named after the trigger and the day, because a marketer scrolling the
     * campaign list needs to tell "the birthday run" from "the birthday run"
     * without opening either.
     *
     * @param Collection<int, Customer> $due
     */
    private function campaignFor(Trigger $trigger, Collection $due): Campaign
    {
        $campaign = new Campaign;

        $campaign->forceFill([
            'tenant_id' => $trigger->tenant_id,
            'name' => sprintf('%s · %s', $trigger->translate('name') ?? $trigger->key, now()->toDateString()),
            'body' => $trigger->body,
            /*
             * `all` rather than a segment name, and it is the honest answer: the
             * recipient list came from the trigger's own question — birthdays,
             * sixty quiet days — and is not any of the four segments. The
             * dispatcher is handed the list rather than re-deriving it.
             */
            'segment' => 'all',
            'status' => 'draft',
            'estimated_cost_tiyin' => SmsCost::tiyin($trigger->body, $due->count()),
        ])->save();

        return $campaign;
    }

    /**
     * @param Collection<int, Customer> $due
     */
    private function recordSends(Trigger $trigger, Collection $due, Campaign $campaign): void
    {
        $rows = [];

        foreach ($due as $customer) {
            $rows[] = [
                'tenant_id' => $trigger->tenant_id,
                'trigger_id' => $trigger->id,
                'customer_id' => $customer->id,
                'campaign_id' => $campaign->id,
                'converted' => false,
                'created_at' => now(),
                'updated_at' => now(),
            ];
        }

        TriggerSend::query()->insert($rows);
    }
}
