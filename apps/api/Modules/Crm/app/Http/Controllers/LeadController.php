<?php

declare(strict_types=1);

namespace Modules\Crm\Http\Controllers;

use App\Http\Controllers\Controller;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\ResourceCollection;
use Modules\Crm\Http\Requests\UpdateLeadRequest;
use Modules\Crm\Http\Resources\LeadResource;
use Modules\Crm\Models\Lead;
use Spatie\QueryBuilder\AllowedFilter;
use Spatie\QueryBuilder\QueryBuilder;

/**
 * The enquiry list — who filled in the contact form and what happened next.
 *
 * Read and move, never create and never delete. A lead is written by the person
 * it is about (`PublicLeadController`) and what a console does with it is
 * decide who rings back and record that they did. There is no `store` because
 * an enquiry somebody typed on behalf of a restaurant is not an enquiry, and no
 * `destroy` because a lead that can be deleted is a pipeline that can be made
 * to look better than it is.
 */
final class LeadController extends Controller
{
    private const MAX_PER_PAGE = 100;

    public function index(Request $request): ResourceCollection
    {
        $perPage = min($request->integer('per_page', 25), self::MAX_PER_PAGE);

        $records = QueryBuilder::for(Lead::class)
            ->allowedFilters([
                AllowedFilter::exact('status'),
                AllowedFilter::exact('source'),
                AllowedFilter::exact('assigned', 'assigned_to_user_id'),
                AllowedFilter::partial('phone'),
                AllowedFilter::partial('restaurant'),
                AllowedFilter::callback('open', function ($query, $value): void {
                    if (filter_var($value, FILTER_VALIDATE_BOOLEAN)) {
                        $query->open();
                    }
                }),
            ])
            ->allowedSorts(['created_at', 'status'])
            // Newest first: an enquiry is worth most on the day it arrives.
            ->defaultSort('-created_at')
            ->paginate($perPage)
            ->withQueryString();

        return LeadResource::collection($records);
    }

    public function show(Lead $lead): LeadResource
    {
        return new LeadResource($lead);
    }

    public function update(UpdateLeadRequest $request, Lead $lead): LeadResource
    {
        $changes = $request->validated();

        /*
         * Moving a lead off `new` stamps when it happened, once.
         *
         * The timestamp is what "we ring back within a day" is measured
         * against, and leaving it to whoever is typing means it is filled in
         * from memory a week later. Only the first move sets it — a lead that
         * goes contacted → qualified → contacted was not contacted twice for
         * the purposes of that promise.
         */
        if (($changes['status'] ?? $lead->status) !== 'new' && $lead->contacted_at === null) {
            $changes['contacted_at'] = now();
        }

        $lead->update($changes);

        return new LeadResource($lead->refresh());
    }
}
