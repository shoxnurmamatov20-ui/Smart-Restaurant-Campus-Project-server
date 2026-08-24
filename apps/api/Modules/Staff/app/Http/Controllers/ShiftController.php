<?php

declare(strict_types=1);

namespace Modules\Staff\Http\Controllers;

use App\Http\Controllers\Controller;
use App\Support\Events\EventBus;
use App\Support\Tenancy\BranchContext;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\ResourceCollection;
use Illuminate\Http\Response;
use Modules\Staff\Events\RotaPublished;
use Modules\Staff\Http\Requests\PublishRotaRequest;
use Modules\Staff\Http\Requests\StoreShiftRequest;
use Modules\Staff\Http\Requests\UpdateShiftRequest;
use Modules\Staff\Http\Resources\ShiftResource;
use Modules\Staff\Models\Shift;
use Spatie\QueryBuilder\AllowedFilter;
use Spatie\QueryBuilder\QueryBuilder;

/**
 * REST API for shifts.
 *
 * Mounted under /api/v1/staff/shifts and gated by Spatie permission
 * middleware on the route definition (Modules/Staff/routes/api.php).
 */
final class ShiftController extends Controller
{
    private const MAX_PER_PAGE = 100;

    public function index(Request $request): ResourceCollection
    {
        $perPage = min($request->integer('per_page', 25), self::MAX_PER_PAGE);

        $records = QueryBuilder::for(Shift::class)
            ->allowedFilters([
                AllowedFilter::exact('member', 'staff_member_id'),
                AllowedFilter::exact('status'),
                AllowedFilter::callback('upcoming', function ($query, $value): void {
                    if (filter_var($value, FILTER_VALIDATE_BOOLEAN)) {
                        $query->upcoming();
                    }
                }),
                /*
                 * The week as everybody but the manager sees it.
                 *
                 * A filter rather than the default, and that is deliberate: the
                 * rota board itself has to show the draft — it is the thing
                 * being built — so the narrowing belongs with the caller who
                 * wants the promise rather than the working copy.
                 */
                AllowedFilter::callback('published', function ($query, $value): void {
                    if (filter_var($value, FILTER_VALIDATE_BOOLEAN)) {
                        $query->published();
                    }
                }),
                AllowedFilter::callback('from', function ($query, $value): void {
                    // A plain comparison, not whereDate(): wrapping the column
                    // in a function loses the index, and ModuleBoundaryTest
                    // refuses it by name.
                    $query->where('starts_at', '>=', $value);
                }),
                AllowedFilter::callback('to', function ($query, $value): void {
                    $query->where('starts_at', '<=', $value);
                }),
            ])
            ->allowedSorts(['starts_at', 'created_at'])
            ->allowedIncludes(['member'])
            ->defaultSort('starts_at')
            ->paginate($perPage)
            ->withQueryString();

        return ShiftResource::collection($records);
    }

    public function store(StoreShiftRequest $request): ShiftResource
    {
        // refresh() so database defaults (status, timestamps) reach the client;
        // without it the response reports null for every column the request
        // did not send.
        $record = Shift::create($request->validated())->refresh();

        return new ShiftResource($record->load('member'));
    }

    public function show(Shift $shift): ShiftResource
    {
        return new ShiftResource($shift->load('member'));
    }

    public function update(UpdateShiftRequest $request, Shift $shift): ShiftResource
    {
        $shift->update($request->validated());

        return new ShiftResource($shift->refresh()->load('member'));
    }

    public function destroy(Shift $shift): Response
    {
        $shift->delete();

        return response()->noContent();
    }

    /**
     * Hand the week over.
     *
     * Until this is called the rota is the manager's working copy: they drag a
     * cook to Thursday, change their mind on Friday, leave two gaps to fill on
     * Monday. Every one of those edits is a real row and every one of them was
     * already visible to the person it named, so a waiter who checked on
     * Tuesday planned around a shift that did not exist by Wednesday.
     *
     * Publishing is therefore not a formality — it is the moment the rows stop
     * being a draft and start being a promise, and the event is what tells
     * anybody.
     *
     * Already-published shifts inside the range are left alone rather than
     * re-stamped. A manager who adds one shift on Thursday and publishes the
     * week again is publishing *that shift*; moving everybody else's
     * `published_at` forward would erase the evidence of when the week was
     * actually promised, which is the one thing a disputed rota turns on.
     */
    public function publish(PublishRotaRequest $request, EventBus $events): JsonResponse
    {
        $from = $request->date('from');
        $to = $request->date('to');

        $pending = Shift::query()
            ->whereNull('published_at')
            ->where('status', '!=', 'cancelled')
            ->where('starts_at', '>=', $from)
            ->where('starts_at', '<=', $to)
            ->get();

        $published = now();

        Shift::query()
            ->whereKey($pending->pluck('id')->all())
            ->update(['published_at' => $published, 'updated_at' => $published]);

        /** @var list<int> $people */
        $people = $pending->pluck('staff_member_id')->unique()->values()->map(
            static fn ($id): int => (int) $id,
        )->all();

        // Nothing to say when nothing changed. An event for an empty publish
        // would notify a kitchen that its rota had been updated, twice a day,
        // because a manager pressed the button to check.
        if ($pending->isNotEmpty()) {
            $events->publish(new RotaPublished(
                from: $from->toDateString(),
                to: $to->toDateString(),
                shiftCount: $pending->count(),
                staffMemberIds: $people,
                branchId: app(BranchContext::class)->id(),
            ));
        }

        return response()->json([
            'data' => [
                'from' => $from->toDateString(),
                'to' => $to->toDateString(),
                'published' => $pending->count(),
                'staff_member_ids' => $people,
                'published_at' => $pending->isEmpty() ? null : $published->toIso8601String(),
            ],
        ]);
    }
}
