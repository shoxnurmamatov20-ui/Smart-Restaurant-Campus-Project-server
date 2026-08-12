<?php

declare(strict_types=1);

namespace App\Http\Controllers;

use App\Http\Resources\ActivityResource;
use App\Models\Activity;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\ResourceCollection;
use Spatie\QueryBuilder\AllowedFilter;
use Spatie\QueryBuilder\QueryBuilder;

/**
 * The audit trail — GET /api/v1/audit.
 *
 * Twenty models across eleven modules record every change through
 * spatie/laravel-activitylog, and until now nothing could read any of it. In a
 * restaurant this is not a compliance box: it is how an owner answers "who
 * reduced that bill", "who took the dish off the menu at 8pm on Friday", and
 * "who let 40 kg of meat leave the store".
 *
 * Read-only by design. The log is evidence; an endpoint that could edit it
 * would make it worthless.
 */
final class AuditController extends Controller
{
    private const MAX_PER_PAGE = 100;

    public function index(Request $request): ResourceCollection
    {
        $perPage = min($request->integer('per_page', 25), self::MAX_PER_PAGE);

        $records = QueryBuilder::for(Activity::class)
            ->allowedFilters([
                // `menu.item`, `orders.order`, … — the log name each model sets
                // in its getActivitylogOptions().
                AllowedFilter::exact('log_name'),
                AllowedFilter::exact('event'),
                AllowedFilter::exact('causer', 'causer_id'),
                AllowedFilter::exact('subject_id'),
                AllowedFilter::exact('batch_uuid'),

                // Matched on the class's short name so a client never has to
                // know, or hard-code, a PHP namespace.
                AllowedFilter::callback('subject', static function (Builder $query, mixed $value): void {
                    $query->where('subject_type', 'like', '%\\'.$value);
                }),

                AllowedFilter::callback('from', static function (Builder $query, mixed $value): void {
                    $query->where('created_at', '>=', $value);
                }),
                AllowedFilter::callback('to', static function (Builder $query, mixed $value): void {
                    $query->where('created_at', '<=', $value);
                }),

                AllowedFilter::callback('search', static function (Builder $query, mixed $value): void {
                    $query->where(static function (Builder $inner) use ($value): void {
                        $inner->where('description', 'like', "%{$value}%")
                            ->orWhere('log_name', 'like', "%{$value}%");
                    });
                }),

                // Anything a person did, as opposed to what the system did on
                // its own — the usual first question after an incident.
                AllowedFilter::callback('by_people', static function (Builder $query, mixed $value): void {
                    filter_var($value, FILTER_VALIDATE_BOOLEAN)
                        ? $query->whereNotNull('causer_id')
                        : $query->whereNull('causer_id');
                }),
            ])
            ->allowedSorts(['created_at', 'log_name', 'event'])
            ->defaultSort('-created_at')
            ->with(['causer', 'subject'])
            ->paginate($perPage)
            ->withQueryString();

        return ActivityResource::collection($records);
    }

    public function show(Activity $audit): ActivityResource
    {
        return new ActivityResource($audit->load(['causer', 'subject']));
    }

    /**
     * What can be filtered on — GET /api/v1/audit/facets.
     *
     * The UI builds its dropdowns from this instead of shipping a hard-coded
     * list that drifts every time a module adds a model.
     */
    public function facets(): JsonResponse
    {
        $logNames = Activity::query()
            ->select('log_name')
            ->distinct()
            ->whereNotNull('log_name')
            ->orderBy('log_name')
            ->pluck('log_name');

        $events = Activity::query()
            ->select('event')
            ->distinct()
            ->whereNotNull('event')
            ->orderBy('event')
            ->pluck('event');

        $subjects = Activity::query()
            ->select('subject_type')
            ->distinct()
            ->whereNotNull('subject_type')
            ->pluck('subject_type')
            ->map(static function (string $type): string {
                $parts = explode('\\', $type);

                return (string) end($parts);
            })
            ->sort()
            ->values();

        return response()->json([
            'log_names' => $logNames,
            'events' => $events,
            'subjects' => $subjects,
            'total' => Activity::query()->count(),
        ]);
    }
}
