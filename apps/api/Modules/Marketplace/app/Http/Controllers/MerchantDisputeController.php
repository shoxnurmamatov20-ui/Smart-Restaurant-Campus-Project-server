<?php

declare(strict_types=1);

namespace Modules\Marketplace\Http\Controllers;

use App\Http\Controllers\Controller;
use App\Support\Errors\ApiException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Modules\Marketplace\Http\Requests\AnswerDisputeRequest;
use Modules\Marketplace\Http\Resources\DisputeResource;
use Modules\Marketplace\Models\Dispute;

/**
 * Complaints, and the two hours the restaurant has to answer one.
 *
 * A merchant may accept or contest, and only while it is open. An automatic
 * credit — a delivery half an hour late, a missing item under twenty thousand —
 * arrives already settled: the restaurant is being told, not asked, and letting
 * them "contest" it would be a button that does nothing.
 */
final class MerchantDisputeController extends Controller
{
    /** GET /api/v1/marketplace/disputes */
    public function index(Request $request): JsonResponse
    {
        $disputes = Dispute::query()
            ->with('order')
            // Open ones first and by deadline, because the one about to expire
            // is the one that costs money. Then the settled ones, newest first.
            ->orderByRaw("case when state = 'open' then 0 else 1 end")
            ->orderBy('deadline_at')
            ->orderByDesc('created_at')
            ->limit(60)
            ->get();

        return response()->json(['data' => DisputeResource::collection($disputes)->resolve($request)]);
    }

    /**
     * PATCH /api/v1/marketplace/disputes/{dispute}
     *
     * `accepted` refunds the guest; `contested` sends it to the platform, which
     * is a person rather than a rule. Either way the row stops counting down.
     */
    public function update(AnswerDisputeRequest $request, Dispute $dispute): JsonResponse
    {
        if ($dispute->state !== 'open') {
            // Already answered, or settled by rule. Refused rather than
            // overwritten: the first answer is the one the guest was told.
            throw ApiException::of('marketplace.dispute_closed', meta: ['state' => $dispute->state]);
        }

        $dispute->forceFill([
            'state' => (string) $request->string('state'),
            'resolution' => $request->filled('resolution') ? (string) $request->string('resolution') : null,
            'resolved_at' => now(),
        ])->save();

        return response()->json(['data' => (new DisputeResource($dispute->load('order')))->resolve($request)]);
    }
}
