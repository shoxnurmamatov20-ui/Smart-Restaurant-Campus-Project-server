<?php

declare(strict_types=1);

namespace App\Http\Controllers\Platform;

use App\Http\Controllers\Controller;
use App\Http\Requests\Platform\StoreIssueRequest;
use App\Http\Requests\Platform\UpdateIssueRequest;
use App\Models\PlatformIssue;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;

/**
 * The support queue — everything the operator has to answer for.
 *
 * The overview's "open problems" figure is the length of this list rather than
 * a second count, so a dashboard and the screen behind it cannot disagree about
 * how bad the morning is.
 */
final class IssueController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $issues = PlatformIssue::query()
            ->with('tenant:id,name,slug')
            ->when(
                $request->filled('status'),
                fn ($query) => $query->where('status', $request->string('status')),
                // The default is what a support person actually wants to see:
                // what is still open. A queue that opens on "everything ever"
                // is a queue nobody scrolls.
                fn ($query) => $query->where('status', '!=', 'closed'),
            )
            ->orderByRaw("case severity when 'error' then 0 when 'warning' then 1 else 2 end")
            ->orderByDesc('id')
            ->limit(300)
            ->get();

        return response()->json([
            'data' => $issues->map(static fn (PlatformIssue $issue): array => [
                'id' => (int) $issue->id,
                'title' => $issue->title,
                'body' => $issue->body,
                'severity' => $issue->severity,
                'status' => $issue->status,
                'source' => $issue->source,
                'tenant' => $issue->tenant?->slug,
                'tenant_name' => $issue->tenant?->name,
                'at' => $issue->created_at?->toIso8601String(),
                'closed_at' => $issue->closed_at?->toIso8601String(),
            ])->all(),
        ]);
    }

    public function store(StoreIssueRequest $request): JsonResponse
    {
        $issue = PlatformIssue::query()->create($request->validated());

        return response()->json(['data' => ['id' => $issue->id]], Response::HTTP_CREATED);
    }

    public function update(UpdateIssueRequest $request, PlatformIssue $issue): JsonResponse
    {
        $changes = $request->validated();

        // Closing stamps the time. Without it "closed" is a state with no date,
        // and "how long did that take" — the only question anybody asks of a
        // support queue — has no answer.
        if (($changes['status'] ?? null) === 'closed' && $issue->closed_at === null) {
            $changes['closed_at'] = now();
        }

        $issue->fill($changes)->save();

        return response()->json(['data' => ['id' => $issue->id, 'status' => $issue->status]]);
    }
}
