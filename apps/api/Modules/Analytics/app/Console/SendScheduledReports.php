<?php

declare(strict_types=1);

namespace Modules\Analytics\Console;

use App\Models\Branch;
use App\Models\Tenant;
use App\Support\Tenancy\BranchContext;
use App\Support\Tenancy\DatabaseTenancy;
use App\Support\Tenancy\TenantContext;
use Illuminate\Console\Command;
use Modules\Analytics\Models\ReportSchedule;
use Modules\Analytics\Services\ScheduledDelivery;
use Throwable;

/**
 * Send every report that is due, to everyone who asked for it.
 *
 * The second of the three things the schedule sheet's TODO said were missing:
 * *"A scheduler that fires it… a report at 07:00 on a Monday needs a queued job
 * rather than a command, because building a month of cashflow inside a
 * scheduler tick blocks every other task behind it."*
 *
 * It is a command anyway, and `runInBackground()` is why. Laravel's scheduler
 * forks a background command into its own process, so a slow report blocks
 * nothing — which is the property the note wanted, without a queue worker this
 * deployment does not run. A queued job would ALSO need somebody to be running
 * `queue:work`; a background command needs only the cron entry that already
 * exists. When there is a worker, `handleOne()` is one dispatch away from being
 * a job, because everything it does is in `ScheduledDelivery`.
 *
 * ---------------------------------------------------------------------------
 * One restaurant at a time, like the rollup and for the same reason
 *
 * A console process starts with `app.bypass_tenancy` on. The due list is read
 * under bypass on purpose — it is a cross-tenant question — but every report is
 * BUILT inside `focusDuring()`, because the queries behind it read `payments`,
 * `orders` and `daily_facts` through the tenant scope, and a report built with
 * the connection unfocused would put the whole platform's revenue in one
 * restaurant's inbox.
 */
final class SendScheduledReports extends Command
{
    protected $signature = 'analytics:send-scheduled
                            {--id= : Only this schedule, and regardless of whether it is due}
                            {--dry : Build everything, deliver nothing}';

    protected $description = 'Deliver the report schedules that are due';

    /**
     * How many are sent in one tick.
     *
     * A ceiling rather than a policy. The remainder stays due and goes out on
     * the next tick five minutes later, which is a delay nobody notices; an
     * unbounded loop over a platform-wide backlog is a command that runs for an
     * hour and overlaps itself.
     */
    private const BATCH = 100;

    public function handle(
        DatabaseTenancy $tenancy,
        TenantContext $tenants,
        BranchContext $branches,
        ScheduledDelivery $delivery,
    ): int {
        $only = $this->option('id');

        /** @var list<ReportSchedule> $due */
        $due = ReportSchedule::query()
            ->withoutGlobalScopes()
            ->when($only !== null, fn ($query) => $query->whereKey((int) $only))
            ->when($only === null, fn ($query) => $query->due())
            ->orderBy('next_run_at')
            ->limit(self::BATCH)
            ->get()
            ->all();

        $sent = 0;
        $failed = 0;

        foreach ($due as $schedule) {
            try {
                $sent += $this->handleOne($tenancy, $tenants, $branches, $delivery, $schedule);
            } catch (Throwable $failure) {
                // Loud, named, not fatal — and recorded on the row, because a
                // schedule that has been failing for a fortnight looks exactly
                // like one that is working until something writes it down.
                $failed++;
                $schedule->markRun('failed', $failure->getMessage());
                $this->error(sprintf('#%d %s — %s', $schedule->id, $schedule->kind, $failure->getMessage()));
            }
        }

        $this->info(sprintf('Jadval: %d ta topildi, %d ta yuborildi, %d ta xato.', count($due), $sent, $failed));

        return $failed > 0 ? self::FAILURE : self::SUCCESS;
    }

    /** @return int 1 if anything was delivered */
    private function handleOne(
        DatabaseTenancy $tenancy,
        TenantContext $tenants,
        BranchContext $branches,
        ScheduledDelivery $delivery,
        ReportSchedule $schedule,
    ): int {
        $tenantId = (int) $schedule->tenant_id;

        return $tenancy->focusDuring($tenantId, function () use (
            $tenants, $branches, $delivery, $schedule, $tenantId
        ): int {
            $previousTenant = $tenants->tenant();
            $previousBranch = $branches->branch();

            // The GUC and the two Eloquent scopes are separate belts and all of
            // them have to move. The branch is the schedule's SUBJECT — which
            // venue's figures were asked for — rather than where it was written.
            $tenants->set(Tenant::query()->withoutGlobalScopes()->find($tenantId));
            $branches->set(
                $schedule->branch_id === null
                    ? null
                    : Branch::query()->withoutGlobalScopes()->find($schedule->branch_id),
            );

            try {
                $result = $delivery->run($schedule);

                if ($this->option('dry')) {
                    $this->line(sprintf(
                        '#%d %s — %d qator, %d manzil (dry).',
                        $schedule->id,
                        $schedule->kind,
                        $result['rows'],
                        $result['attempted'],
                    ));

                    return 0;
                }

                /*
                 * Three outcomes, and the middle one is why `empty` exists.
                 *
                 * A venue that sold nothing last week has a report with no
                 * rows; calling that FAILED sends somebody looking for a bug
                 * that is not there. Nothing delivered from a report that DID
                 * have rows is a genuine failure — a blocked chat, a refused
                 * mail server — and has to read as one.
                 */
                $schedule->markRun(match (true) {
                    $result['delivered'] > 0 => 'sent',
                    $result['rows'] === 0 => 'empty',
                    default => 'failed',
                }, $result['delivered'] === 0 && $result['rows'] > 0
                    ? 'No destination accepted the report.'
                    : null);

                return $result['delivered'] > 0 ? 1 : 0;
            } finally {
                $tenants->set($previousTenant);
                $branches->set($previousBranch);
            }
        });
    }
}
