<?php

declare(strict_types=1);

namespace Modules\Finance\Http\Controllers;

use App\Http\Controllers\Controller;
use App\Support\Errors\ApiException;
use App\Support\Tenancy\BusinessDay;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Modules\Finance\Http\Requests\CloseAccountingPeriodRequest;
use Modules\Finance\Http\Resources\AccountingPeriodResource;
use Modules\Finance\Models\AccountingPeriod;
use Modules\Finance\Models\Expense;
use Modules\Finance\Models\Payment;
use Modules\Finance\Services\PeriodLock;

/**
 * Shutting a month's books, and the one thing that makes shutting them mean
 * something.
 *
 * Mounted under /api/v1/finance/periods.
 *
 * ---------------------------------------------------------------------------
 * A running month cannot be closed
 *
 * The screen does not draw the button for it, and this refuses it anyway. The
 * two are not redundant: a screen decides what a person can press, and an API
 * decides what can happen — and the offline queue, a script and a second console
 * all reach this without passing through that screen.
 *
 * ---------------------------------------------------------------------------
 * The figures are frozen, and the freeze is the point
 *
 * `revenue_tiyin` and `expenses_tiyin` are computed once, at the close, and
 * never again. Recomputing them on read would be the obvious thing and it is
 * wrong: a refund booked next week reaches back into the same rows, so the
 * number an accountant signed would quietly become a different number, and the
 * question six months later — what did I sign — would have no answer.
 *
 * ---------------------------------------------------------------------------
 * Reopening exists, and it is loud
 *
 * `finance.manage`, a mandatory reason, its own timestamp and its own activity
 * row. A platform with no way to reopen a month would meet its first genuine
 * correction by having somebody edit the database, which is the outcome an audit
 * trail exists to prevent.
 */
final class AccountingPeriodController extends Controller
{
    public function __construct(
        private readonly BusinessDay $businessDay,
        private readonly PeriodLock $lock,
    ) {}

    /**
     * The months this restaurant has, most recent first.
     *
     * Rows the restaurant has never touched are synthesised as `open` — the same
     * arrangement the other two configuration screens use, and for the same
     * reason: a ledger that listed nothing until somebody closed something would
     * have no way to close the first month.
     *
     * @return array<string, mixed>
     */
    public function index(Request $request): array
    {
        $months = max(1, min($request->integer('months', 12), 36));
        $stored = AccountingPeriod::query()->get()->keyBy('period');

        $cursor = Carbon::parse($this->businessDay->dateFor())->startOfMonth();
        $rows = [];

        for ($step = 0; $step < $months; $step++) {
            $period = $cursor->format('Y-m');
            $row = $stored->get($period);

            if ($row instanceof AccountingPeriod) {
                $rows[] = (new AccountingPeriodResource($row))->toArray($request);
            } else {
                [$from, $to] = AccountingPeriod::bounds($period);

                $rows[] = [
                    'id' => null,
                    'period' => $period,
                    'starts_on' => $from,
                    'ends_on' => $to,
                    'status' => 'open',
                    /*
                     * A running total, and it is honest that it moves. An open
                     * month has no signature on it, so nothing is being
                     * contradicted when a refund changes it tomorrow.
                     */
                    'revenue_tiyin' => $this->revenueBetween($from, $to),
                    'expenses_tiyin' => $this->spentBetween($from, $to),
                    'closed_at' => null,
                    'closed_by_user_id' => null,
                    'reopened_at' => null,
                    'note' => null,
                    'created_at' => null,
                    'updated_at' => null,
                ];
            }

            $cursor->subMonth();
        }

        return ['data' => $rows];
    }

    /**
     * Shut a month.
     *
     * `{period}` is the `YYYY-MM` rather than an id, because the caller is a
     * screen listing months and half of them have no row yet.
     */
    public function close(CloseAccountingPeriodRequest $request, string $period): JsonResponse
    {
        $this->refuseMalformed($period);

        [$from, $to] = AccountingPeriod::bounds($period);

        // The venue's own trading day, not the server's calendar: a restaurant
        // whose day ends at 06:00 is still trading the 31st at 02:00 on the 1st,
        // and closing the month out from under it would seal a shift mid-count.
        if ($to >= $this->businessDay->dateFor()) {
            throw ApiException::of('finance.period_still_running', meta: ['period' => $period]);
        }

        $record = DB::transaction(function () use ($period, $from, $to, $request): AccountingPeriod {
            $record = AccountingPeriod::query()->where('period', $period)->lockForUpdate()->first();

            if ($record !== null && $record->isClosed()) {
                throw ApiException::of('finance.period_already_closed', meta: ['period' => $period]);
            }

            $figures = [
                'starts_on' => $from,
                'ends_on' => $to,
                'status' => 'closed',
                'revenue_tiyin' => $this->revenueBetween($from, $to),
                'expenses_tiyin' => $this->spentBetween($from, $to),
                'closed_at' => now(),
                'closed_by_user_id' => $request->user()?->getAuthIdentifier(),
                'note' => $request->input('note'),
            ];

            if ($record === null) {
                return AccountingPeriod::create(['period' => $period] + $figures);
            }

            $record->update($figures);

            return $record;
        });

        // The lock caches per request, and this request is the one that changed
        // the answer. Without this, a close followed by a write in the same
        // request would be allowed by a cached "open".
        $this->lock->forget();

        /*
         * 200, not 201. Closing a month is an ACT on a period that already
         * exists as far as anybody outside is concerned — the list answers every
         * month whether or not it has a row — so whether this write had to
         * create one is an implementation detail a client must not branch on.
         */
        return (new AccountingPeriodResource($record->refresh()))
            ->response()
            ->setStatusCode(Response::HTTP_OK);
    }

    /** Open a signed-off month back up. Loud on purpose — see the class docblock. */
    public function reopen(CloseAccountingPeriodRequest $request, string $period): AccountingPeriodResource
    {
        $this->refuseMalformed($period);

        $record = AccountingPeriod::query()->where('period', $period)->first();

        if ($record === null || ! $record->isClosed()) {
            throw ApiException::of('finance.period_not_closed', meta: ['period' => $period]);
        }

        $record->update([
            'status' => 'open',
            'reopened_at' => now(),
            'reopened_by_user_id' => $request->user()?->getAuthIdentifier(),
            'note' => $request->input('note'),
        ]);

        $this->lock->forget();

        return new AccountingPeriodResource($record->refresh());
    }

    // ============ Internals ============

    private function refuseMalformed(string $period): void
    {
        // The route pattern already refuses anything else; this is what stops a
        // hand-built request reaching `Carbon::createFromFormat` with rubbish.
        if (preg_match('/^\d{4}-(0[1-9]|1[0-2])$/', $period) !== 1) {
            throw ApiException::of('finance.unknown_period', meta: ['period' => $period]);
        }
    }

    /** Captured takings inside a window, in tiyin. */
    private function revenueBetween(string $from, string $to): int
    {
        return (int) Payment::query()
            ->where('status', 'captured')
            ->whereBetween('business_date', [$from, $to])
            ->sum('amount');
    }

    /** Money out inside a window, in tiyin. */
    private function spentBetween(string $from, string $to): int
    {
        return (int) Expense::query()
            ->whereBetween('business_date', [$from, $to])
            ->sum('amount');
    }
}
