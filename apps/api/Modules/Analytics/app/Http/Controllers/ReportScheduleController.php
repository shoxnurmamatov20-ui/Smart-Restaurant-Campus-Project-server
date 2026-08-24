<?php

declare(strict_types=1);

namespace Modules\Analytics\Http\Controllers;

use App\Http\Controllers\Controller;
use App\Support\Tenancy\TenantContext;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Modules\Analytics\Http\Requests\CustomReportRequest;
use Modules\Analytics\Http\Requests\StoreReportScheduleRequest;
use Modules\Analytics\Models\ReportSchedule;
use Modules\Analytics\Services\CsvReport;
use Modules\Analytics\Services\CustomReports;
use Modules\Analytics\Services\ReportWindow;
use Modules\Analytics\Services\ScheduledDelivery;

/**
 * The two halves of the reports screen that wrote nothing: the builder and the
 * schedule sheet.
 *
 * Their TODOs between them named six missing things. Five are built here and in
 * `CustomReports`, `ReportSchedule` and `analytics:send-scheduled`; the sixth —
 * saving a built report so it can be run again next month — is this controller's
 * `store`, because a schedule IS a saved definition. A `report_definitions`
 * table beside `report_schedules` would be the same three columns twice, and the
 * builder's own note is what ruled it out: *"a builder whose result cannot be
 * re-run is a query console"* — re-running it is exactly what a schedule does.
 *
 * A one-off run is not saved and is not meant to be. Somebody trying four
 * column combinations before they find the one they want should not leave four
 * rows behind for a manager to tidy up later.
 */
final class ReportScheduleController extends Controller
{
    public function __construct(private readonly TenantContext $tenants) {}

    /**
     * Which columns each base offers.
     *
     * Shipped so the picker draws what the server will actually accept. The
     * same argument `GET /api/v1/settings` makes for the settings schema: two
     * copies of a whitelist drift, and the drift surfaces as a 422 on a column
     * the console itself offered.
     */
    public function catalogue(): JsonResponse
    {
        return response()->json([
            'data' => [
                'bases' => CustomReports::BASES,
                'groups' => CustomReports::GROUPS,
                'columns' => CustomReports::catalogue(),
                'frequencies' => ReportSchedule::FREQUENCIES,
                'channels' => ReportSchedule::CHANNELS,
            ],
        ]);
    }

    /** Run a built report once, without saving it. */
    public function custom(CustomReportRequest $request, CustomReports $reports): JsonResponse
    {
        $data = $request->validated();
        /** @var list<string> $columns */
        $columns = $data['columns'];

        return response()->json([
            'data' => $reports->build(
                $data['base'],
                $columns,
                $data['group_by'],
                ReportWindow::of($data['period'] ?? 'month'),
            ),
        ]);
    }

    /**
     * The same built report, as a file.
     *
     * A separate route rather than a flag on the one above, because the two
     * answer different content types and a client that asked for JSON and got a
     * CSV has to sniff its own response. `POST /reports/export` does the same
     * for the five fixed reports.
     */
    public function customExport(CustomReportRequest $request, CustomReports $reports): Response
    {
        $data = $request->validated();
        /** @var list<string> $columns */
        $columns = $data['columns'];
        $window = ReportWindow::of($data['period'] ?? 'month');
        $report = $reports->build($data['base'], $columns, $data['group_by'], $window);

        return response(CsvReport::from($report), 200, [
            'Content-Type' => 'text/csv; charset=UTF-8',
            'Content-Disposition' => 'attachment; filename="'
                .CsvReport::filename('custom-'.$data['base'], $window->from, $window->to).'"',
        ]);
    }

    // ============ Schedules ============

    /**
     * Every schedule this restaurant has set.
     *
     * The half people forget, and the half that turns an unread weekly report
     * into a rule nobody can find to cancel — the schedule sheet's own words.
     * Which is why `destroy` and the `is_active` switch are on this controller
     * from the first commit rather than "later".
     */
    public function index(): JsonResponse
    {
        $schedules = ReportSchedule::query()
            ->with('branch')
            ->orderBy('next_run_at')
            ->get()
            ->map(fn (ReportSchedule $schedule): array => $this->shape($schedule))
            ->all();

        return response()->json(['data' => $schedules]);
    }

    public function store(StoreReportScheduleRequest $request): JsonResponse
    {
        $data = $request->validated();

        $schedule = ReportSchedule::query()->create([
            'tenant_id' => $this->tenants->id(),
            'branch_id' => $data['branch_id'] ?? null,
            'created_by' => $request->user()?->getAuthIdentifier(),
            'kind' => $data['kind'],
            'period' => $data['period'] ?? 'week',
            'frequency' => $data['frequency'],
            'destinations' => $data['destinations'],
            'definition' => $data['definition'] ?? null,
            'is_active' => true,
            // The next slot from now, never "immediately". A schedule created
            // at four in the afternoon that fired at 16:01 would send a report
            // nobody was expecting and then send the real one at 06:30.
            'next_run_at' => ReportSchedule::slotAfter($data['frequency']),
        ]);

        return response()->json(['data' => $this->shape($schedule)], 201);
    }

    /** Switch one off, or back on. */
    public function update(Request $request, ReportSchedule $schedule): JsonResponse
    {
        $validated = $request->validate(['is_active' => ['required', 'boolean']]);

        $schedule->forceFill([
            'is_active' => $validated['is_active'],
            // Switching back on rebases the next slot rather than firing for
            // every slot missed while it was off.
            'next_run_at' => $validated['is_active']
                ? ReportSchedule::slotAfter($schedule->frequency)
                : $schedule->next_run_at,
        ])->save();

        return response()->json(['data' => $this->shape($schedule)]);
    }

    public function destroy(ReportSchedule $schedule): Response
    {
        // Hard delete, and it is the right one here. A schedule is a rule
        // somebody set, not a record of anything that happened; keeping a
        // tombstone would make "cancel this" leave a row the person can still
        // see on the list they cancelled it from.
        $schedule->delete();

        return response()->noContent();
    }

    /**
     * Send one now.
     *
     * The button that makes a schedule trustworthy: somebody who has just
     * described a destination wants to know a file arrives there before they
     * wait a week to find out it did not. Goes through exactly the same
     * `ScheduledDelivery` the scheduler uses, so a preview that works and a
     * Monday that does not is a difference this cannot produce.
     */
    public function send(ReportSchedule $schedule, ScheduledDelivery $delivery): JsonResponse
    {
        $result = $delivery->run($schedule);

        return response()->json(['data' => [
            'delivered' => $result['delivered'],
            'attempted' => $result['attempted'],
            'rows' => $result['rows'],
        ]]);
    }

    /**
     * @return array<string, mixed>
     */
    private function shape(ReportSchedule $schedule): array
    {
        return [
            'id' => $schedule->id,
            'kind' => $schedule->kind,
            'period' => $schedule->period,
            'frequency' => $schedule->frequency,
            'branch' => $schedule->branch?->name,
            'destinations' => $schedule->destinations,
            'definition' => $schedule->definition,
            'is_active' => $schedule->is_active,
            'next_run_at' => $schedule->next_run_at->toIso8601String(),
            'last_run_at' => $schedule->last_run_at?->toIso8601String(),
            'last_status' => $schedule->last_status,
            'last_error' => $schedule->last_error,
        ];
    }
}
