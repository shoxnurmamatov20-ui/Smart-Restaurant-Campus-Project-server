<?php

declare(strict_types=1);

namespace App\Http\Controllers\Platform;

use App\Contracts\Pos\TerminalRegistry;
use App\Http\Controllers\Controller;
use App\Models\PlatformInvoice;
use App\Models\PlatformIssue;
use App\Models\PlatformPlan;
use App\Models\Tenant;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\DB;

/**
 * The platform console's front page: four figures and the list behind them.
 *
 * `platform-data.ts` calls this "the one endpoint on the product that must run
 * outside the tenant scope, and therefore the one that needs its own
 * authorisation test: a request carrying an owner's token must be refused here
 * even though that owner is an admin of their own restaurant." That test is
 * `PlatformConsoleTest`.
 *
 * Every figure is counted, not stored. A cached KPI on an operator's dashboard
 * is a number that stays wrong through the whole incident it was supposed to
 * warn about.
 */
final class OverviewController extends Controller
{
    public function __construct(private readonly TerminalRegistry $terminals) {}

    public function __invoke(): JsonResponse
    {
        $tenants = Tenant::query()->orderBy('name')->get();
        $devices = $this->terminals->across();

        $branchCounts = DB::table('public.branches')
            ->whereNull('deleted_at')
            ->selectRaw('tenant_id, count(*) as total, count(*) filter (where status = ?) as active', ['active'])
            ->groupBy('tenant_id')
            ->get()
            ->keyBy('tenant_id');

        $userCounts = User::query()
            ->whereNotNull('tenant_id')
            ->selectRaw('tenant_id, count(*) as total')
            ->groupBy('tenant_id')
            ->pluck('total', 'tenant_id');

        /*
         * Who to ring, and which address they sign in with.
         *
         * One query for every restaurant rather than one per row: the list is
         * every tenant on the platform, and a lookup inside the loop is the
         * shape that is fine at forty customers and a page timeout at four
         * hundred.
         *
         * Grouped rather than keyed, and taken `->first()` below, because a
         * business can promote a second owner and the account the platform is
         * answerable for is the one it created — the oldest. `keyBy` would
         * silently hand back the newest instead.
         */
        $owners = User::query()
            ->whereNotNull('tenant_id')
            ->whereHas('roles', fn ($roles) => $roles->where('name', 'owner'))
            ->orderBy('id')
            ->get(['id', 'tenant_id', 'name', 'email', 'phone'])
            ->groupBy('tenant_id');

        $invoices = PlatformInvoice::query()
            ->whereIn('status', ['due', 'overdue'])
            ->get()
            ->groupBy('tenant_id');

        $plans = PlatformPlan::query()->orderBy('position')->orderBy('price_tiyin')->get();
        $planPrices = $plans->pluck('price_tiyin', 'key');

        /*
         * Paired tills per restaurant.
         *
         * A trial that has a terminal paired has already been set up by
         * somebody; one that has none never got past the wizard. The trials
         * screen used to score that as a "likelihood" percentage taken from a
         * fixture — a number nothing measured, printed beside a real customer's
         * name. This is the fact the number was pretending to summarise.
         */
        $terminalsByTenant = array_count_values(array_column($devices, 'tenant_id'));

        $list = [];
        $mrr = 0;
        $failing = 0;

        foreach ($tenants as $tenant) {
            $owner = $owners->get($tenant->id)?->first();
            $branches = $branchCounts[$tenant->id] ?? null;
            $activeBranches = (int) ($branches->active ?? 0);

            /*
             * The monthly figure is the plan multiplied by the venues it is
             * charged per — the same arithmetic the invoice uses, computed in
             * one place so the dashboard and the bill cannot disagree.
             */
            $price = (int) ($planPrices[$tenant->plan_key] ?? 0);
            $tenantMrr = $price * max($activeBranches, 1);

            $outstanding = $invoices[$tenant->id] ?? collect();
            $overdue = $outstanding->firstWhere('status', 'overdue') !== null;

            if ($overdue) {
                $failing++;
            }

            $mrr += $tenantMrr;

            $list[] = [
                'id' => $tenant->slug,
                'tenant_id' => $tenant->id,
                'name' => $tenant->name,
                'city' => $this->city($tenant->id),
                'plan' => $tenant->plan_key,
                'branches' => $activeBranches,
                'users' => (int) ($userCounts[$tenant->id] ?? 0),
                'mrr_tiyin' => $tenantMrr,
                // Three states, in the order the operator triages them.
                'pay' => $overdue ? 'failing' : ($outstanding->isNotEmpty() ? 'late' : 'paid'),
                'seen_minutes' => $this->lastSeenMinutes($tenant->id),
                'state' => $this->state($tenant),
                // What the trials screen counts down to, and what an operator
                // reads as "has anybody actually set this up yet".
                'trial_ends_at' => $tenant->trial_ends_at?->toIso8601String(),
                'since' => $tenant->created_at?->toDateString(),
                'terminals' => (int) ($terminalsByTenant[$tenant->id] ?? 0),
                /*
                 * The owner as the console prints them, and the address they
                 * sign in with.
                 *
                 * The email is the point. The card used to read its owner name
                 * and phone out of `TENANT_DETAIL` — a fixture keyed by the
                 * demo slugs — so every restaurant actually onboarded here drew
                 * an em dash where its contact should be, and the one field an
                 * operator is asked for on the phone ("what address do they log
                 * in with?") was on no screen at all.
                 *
                 * The password is deliberately not here and never will be. It
                 * is a hash; the answer to a lost one is
                 * `POST tenants/{tenant}/owner-password`.
                 */
                'owner' => $owner === null ? null : [
                    'name' => $owner->name,
                    'email' => $owner->email,
                    'phone' => $owner->phone,
                ],
            ];
        }

        return response()->json([
            'data' => [
                'tenants' => $tenants->count(),
                'branches_active' => (int) $branchCounts->sum('active'),
                'branches_total' => (int) $branchCounts->sum('total'),
                'mrr_tiyin' => $mrr,
                // "Open problems" is the length of the support queue, not a
                // second count that can drift from the list behind it.
                'issues_open' => PlatformIssue::query()->where('status', 'open')->count(),
                'failing' => $failing,
                'terminals_online' => count(array_filter($devices, static fn (array $d): bool => $d['online'])),
                'terminals_total' => count($devices),
                'list' => $list,
                'plans' => $plans->map(static fn (PlatformPlan $plan): array => [
                    'id' => $plan->key,
                    'price_tiyin' => (int) $plan->price_tiyin,
                    'tenants' => Tenant::query()->where('plan_key', $plan->key)->count(),
                ])->all(),
            ],
        ]);
    }

    /**
     * Where a restaurant is, taken from its busiest venue.
     *
     * A tenant has no city of its own — a business is not an address — so the
     * console's column is the city of the branch it has most of. Better than
     * inventing a field somebody then has to keep in step with five venues.
     */
    private function city(int $tenantId): ?string
    {
        /** @var object{city: string|null, total: int}|null $row */
        $row = DB::table('public.branches')
            ->where('tenant_id', $tenantId)
            ->whereNull('deleted_at')
            ->whereNotNull('city')
            ->selectRaw('city, count(*) as total')
            ->groupBy('city')
            ->orderByDesc('total')
            ->first();

        return $row?->city;
    }

    /**
     * Minutes since anybody in this restaurant did anything.
     *
     * Read from the audit trail rather than from `users.last_login_at`: a
     * restaurant where the owner has not signed in for a week but the tills
     * have been selling all day is not dormant, and the operator's follow-up
     * list should not say it is.
     */
    private function lastSeenMinutes(int $tenantId): ?int
    {
        /** @var object{at: string|null}|null $row */
        $row = DB::table('activity_log')
            ->where('tenant_id', $tenantId)
            ->selectRaw('max(created_at) as at')
            ->first();

        if ($row?->at === null) {
            return null;
        }

        return (int) now()->diffInMinutes($row->at, absolute: true);
    }

    private function state(Tenant $tenant): string
    {
        if ($tenant->status !== 'active') {
            return $tenant->status;
        }

        return $tenant->trial_ends_at !== null && $tenant->trial_ends_at->isFuture()
            ? 'trial'
            : 'live';
    }
}
