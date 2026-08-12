<?php

declare(strict_types=1);

namespace Modules\Crm\Http\Controllers;

use App\Http\Controllers\Controller;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\ResourceCollection;
use Illuminate\Http\Response;
use Modules\Crm\Http\Requests\StoreFeedbackRequest;
use Modules\Crm\Http\Requests\UpdateFeedbackRequest;
use Modules\Crm\Http\Resources\FeedbackResource;
use Modules\Crm\Models\Feedback;
use Spatie\QueryBuilder\AllowedFilter;
use Spatie\QueryBuilder\QueryBuilder;

/**
 * REST API for feedback entries.
 *
 * Mounted under /api/v1/crm/feedbacks and gated by Spatie permission
 * middleware on the route definition (Modules/Crm/routes/api.php).
 */
final class FeedbackController extends Controller
{
    private const MAX_PER_PAGE = 100;

    public function index(Request $request): ResourceCollection
    {
        $perPage = min($request->integer('per_page', 25), self::MAX_PER_PAGE);

        $records = QueryBuilder::for(Feedback::class)
            ->allowedFilters([
                AllowedFilter::exact('status'),
                AllowedFilter::exact('score'),
                AllowedFilter::exact('is_urgent'),
                AllowedFilter::exact('customer', 'customer_id'),
                AllowedFilter::callback('unresolved', function ($query, $value): void {
                    if (filter_var($value, FILTER_VALIDATE_BOOLEAN)) {
                        $query->unresolved();
                    }
                }),
                AllowedFilter::callback('negative', function ($query, $value): void {
                    if (filter_var($value, FILTER_VALIDATE_BOOLEAN)) {
                        $query->negative();
                    }
                }),
            ])
            ->allowedSorts(['score', 'created_at'])
            ->allowedIncludes(['customer'])
            ->defaultSort('-created_at')
            ->paginate($perPage)
            ->withQueryString();

        return FeedbackResource::collection($records);
    }

    public function store(StoreFeedbackRequest $request): FeedbackResource
    {
        // refresh() so database defaults (status, timestamps) reach the client;
        // without it the response reports null for every column the request
        // did not send.
        $record = Feedback::create($request->validated())->refresh();

        return new FeedbackResource($record->load('customer'));
    }

    public function show(Feedback $feedback): FeedbackResource
    {
        return new FeedbackResource($feedback->load('customer'));
    }

    public function update(UpdateFeedbackRequest $request, Feedback $feedback): FeedbackResource
    {
        $feedback->update($request->validated());

        return new FeedbackResource($feedback->refresh()->load('customer'));
    }

    public function destroy(Feedback $feedback): Response
    {
        $feedback->delete();

        return response()->noContent();
    }

    public function resolve(Feedback $feedback): FeedbackResource
    {
        $feedback->resolve();

        return new FeedbackResource($feedback->refresh());
    }
}
