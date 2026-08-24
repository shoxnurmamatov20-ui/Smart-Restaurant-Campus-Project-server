<?php

declare(strict_types=1);

namespace Modules\Staff\Http\Controllers;

use App\Http\Controllers\Controller;
use App\Support\Errors\ApiException;
use App\Support\Tenancy\BranchContext;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\ResourceCollection;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Modules\Staff\Http\Requests\StorePayrollPeriodRequest;
use Modules\Staff\Http\Requests\UpdatePayrollLineRequest;
use Modules\Staff\Http\Resources\PayrollLineResource;
use Modules\Staff\Http\Resources\PayrollPeriodResource;
use Modules\Staff\Models\PayrollLine;
use Modules\Staff\Models\PayrollPeriod;
use Modules\Staff\Services\PayrollRun;
use Spatie\QueryBuilder\AllowedFilter;
use Spatie\QueryBuilder\QueryBuilder;

/**
 * Payroll: a month, its lines, and the signature that freezes them.
 *
 * Mounted under /api/v1/staff/payroll and gated by Spatie permission middleware
 * on the route definition (Modules/Staff/routes/api.php).
 *
 * Two permissions, and the split is the one that matters here: reading a wage
 * bill is `staff.view` — an accountant and a chef both hold it — while building,
 * editing and signing off are all `staff.manage`, which on this platform means
 * an owner or a branch manager. Nobody who cannot already see what everybody
 * earns can open the screen, and nobody but the manager can move a figure on it.
 */
final class PayrollController extends Controller
{
    private const MAX_PER_PAGE = 100;

    public function __construct(private readonly PayrollRun $run) {}

    public function index(Request $request): ResourceCollection
    {
        $perPage = min($request->integer('per_page', 25), self::MAX_PER_PAGE);

        $records = QueryBuilder::for(PayrollPeriod::class)
            ->allowedFilters([
                AllowedFilter::exact('period'),
                AllowedFilter::exact('status'),
                AllowedFilter::exact('branch', 'branch_id'),
            ])
            ->allowedSorts(['period', 'finalised_at', 'created_at'])
            /*
             * Newest month first, and `period` sorts chronologically for free
             * because it is a fixed-width `YYYY-MM`. That is the whole reason
             * the column is `char(7)` rather than a looser string.
             */
            ->defaultSort('-period')
            // Cheap enough to always send: it is the one figure that tells a
            // list row apart from an empty run somebody opened and abandoned.
            ->withCount('lines')
            ->paginate($perPage)
            ->withQueryString();

        return PayrollPeriodResource::collection($records);
    }

    /**
     * One run with its payslips.
     *
     * `member` is eager-loaded because the resource embeds three of its columns
     * per line, and thirty lines resolved one at a time is thirty statements to
     * draw one table.
     */
    public function show(PayrollPeriod $payrollPeriod): PayrollPeriodResource
    {
        return new PayrollPeriodResource(
            $payrollPeriod->load(['lines' => fn ($lines) => $lines->with('member')->orderBy('id')]),
        );
    }

    /**
     * Open a month, or rebuild one that is already open.
     *
     * The same verb for both, deliberately. A manager who presses "build August"
     * twice means the second press: they have fixed a missing clock-out and want
     * the figures again. A separate `rebuild` endpoint would be a second name
     * for one act, and the first press of the pair would have had to guess
     * whether the run existed.
     *
     * `firstOrNew` rather than `updateOrCreate` because the window has to be
     * stamped only on the way in: re-deriving `starts_on` on a rebuild is
     * harmless today and is exactly the drift the stored window exists to
     * prevent, so it is written once and never touched again.
     *
     * @throws ApiException
     */
    public function store(StorePayrollPeriodRequest $request): PayrollPeriodResource
    {
        $month = (string) $request->string('period');

        /*
         * Which venue's run this is, resolved once and used for both the lookup
         * and the row.
         *
         * The request wins; failing that, the branch the caller is working in.
         * Falling back to the context rather than to null is not a convenience —
         * it is the only answer that agrees with itself. `BelongsToBranch`
         * stamps the context onto a new row and its global scope hides rows from
         * other venues, so a lookup keyed on `null` under an `X-Branch` header
         * would find nothing, create a row the trait then stamped with that
         * branch anyway, and report it as a business-wide run. A manager at
         * Chilonzor would have opened what the screen called the group's August.
         *
         * A genuinely business-wide run is opened with no branch pinned, which
         * is how an owner reads every other cross-venue figure on this platform.
         */
        $branchId = $request->filled('branch_id')
            ? $request->integer('branch_id')
            : app(BranchContext::class)->id();

        /*
         * The window, from the month and nothing else.
         *
         * `endOfMonth()` rather than a hand-rolled "31", because February exists
         * and so do leap years. The first of the month is appended rather than
         * parsing `YYYY-MM` on its own: PHP reads a bare `2026-08` as a time of
         * day on today's date, which is not a mistake anybody would find by
         * reading the code. Safe to parse without a guard because
         * `StorePayrollPeriodRequest` has already held the string to
         * `PayrollPeriod::PERIOD_PATTERN`.
         */
        $starts = Carbon::parse($month.'-01')->startOfMonth();

        /** @var PayrollPeriod $period */
        $period = PayrollPeriod::query()->firstOrNew(
            ['period' => $month, 'branch_id' => $branchId],
            [
                'starts_on' => $starts->toDateString(),
                'ends_on' => $starts->copy()->endOfMonth()->toDateString(),
                'status' => 'draft',
            ],
        );

        /*
         * Refused before the note is written, not after.
         *
         * `build()` would refuse a signed-off run anyway, but by then a request
         * carrying a `note` would already have amended a frozen month — a small
         * write, and exactly the kind that makes "frozen" a word rather than a
         * rule.
         */
        $this->run->refuseIfFinalised($period);

        if ($request->filled('note')) {
            $period->note = (string) $request->string('note');
        }

        $period->save();

        return new PayrollPeriodResource(
            $this->run->build($period)
                ->load(['lines' => fn ($lines) => $lines->with('member')->orderBy('id')]),
        );
    }

    /**
     * The two hand-entered columns, plus the note that explains them.
     *
     * Everything else on a line is computed and is not writable — see
     * `UpdatePayrollLineRequest`. What this endpoint exists for is the part no
     * table on this platform holds: the share of a service-charge pool that is
     * divided on paper, a bonus a manager decided on, and an advance taken
     * mid-month.
     *
     * @throws ApiException
     */
    public function updateLine(
        UpdatePayrollLineRequest $request,
        PayrollPeriod $payrollPeriod,
        PayrollLine $line,
    ): PayrollLineResource {
        // Refused before anything is read, not after it is written: a signed-off
        // month is a figure that has already been paid.
        $this->run->refuseIfFinalised($payrollPeriod);

        /*
         * The line has to belong to the run named in the URL.
         *
         * Route model binding resolves each parameter on its own, so
         * `/payroll/7/lines/93` happily hands over line 93 from run 4 — same
         * restaurant, wrong month. The tenant scope catches a stranger; nothing
         * but this catches a manager who edited the URL, or a client that cached
         * an id from the run it was looking at a minute ago.
         */
        if ($line->payroll_period_id !== $payrollPeriod->id) {
            throw ApiException::of('staff.payroll_line_unknown', meta: [
                'period_id' => $payrollPeriod->id,
            ]);
        }

        /*
         * The line and the run's totals move together or not at all.
         *
         * Two writes with nothing between them looks safe until one of them
         * fails: a bonus that landed on a payslip while the month's total still
         * reports the figure from before it is a run that disagrees with the sum
         * of its own lines, and nothing on any screen would say which of the two
         * to believe.
         */
        DB::transaction(function () use ($request, $line, $payrollPeriod): void {
            $line->fill($request->validated());
            // Recomputed rather than accepted: net is an addition of the other
            // four columns, and a request that could state it could state one
            // that does not follow from its own parts.
            $line->net_tiyin = $line->computedNet();
            $line->save();

            // Same call the builder and the sign-off make, so all three routes
            // agree about what a total is.
            $this->run->recomputeTotals($payrollPeriod);
        });

        return new PayrollLineResource($line->refresh()->load('member'));
    }

    /**
     * Sign it off.
     *
     * After this the run refuses to be rebuilt and its lines refuse to be
     * edited. There is no verb to undo it: a month that turns out to be wrong
     * after it was signed is corrected by an adjustment in the next run, the way
     * accounting corrects things.
     *
     * @throws ApiException
     */
    public function finalize(Request $request, PayrollPeriod $payrollPeriod): PayrollPeriodResource
    {
        $this->run->refuseIfFinalised($payrollPeriod);

        /*
         * An empty run cannot be signed.
         *
         * A month with no lines is a month nobody worked, which in a restaurant
         * means the run was built against the wrong branch or before the
         * attendance was in — and freezing it would produce a payslip-shaped
         * record of zero that nobody can correct afterwards, because the whole
         * point of the signature is that it does not move.
         */
        if ($payrollPeriod->lines()->count() === 0) {
            throw ApiException::of('staff.payroll_empty', meta: ['period' => $payrollPeriod->period]);
        }

        DB::transaction(function () use ($request, $payrollPeriod): void {
            // Re-summed at the moment of freezing rather than trusted from the
            // last write. This is where the three totals stop being derivable,
            // so it is where they had better be right — and it has to happen
            // inside the same transaction as the signature, or a run could end
            // up frozen around totals that were never recomputed.
            $this->run->recomputeTotals($payrollPeriod);

            $payrollPeriod->update([
                'status' => 'finalised',
                'finalised_at' => now(),
                'finalised_by_user_id' => $request->user()?->getKey(),
            ]);
        });

        return new PayrollPeriodResource(
            $payrollPeriod->refresh()
                ->load(['lines' => fn ($lines) => $lines->with('member')->orderBy('id')]),
        );
    }
}
