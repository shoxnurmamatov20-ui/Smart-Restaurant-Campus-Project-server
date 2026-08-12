<?php

declare(strict_types=1);

namespace Modules\Pos\Http\Controllers;

use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\ResourceCollection;
use Illuminate\Http\Response;
use Modules\Pos\Http\Requests\PairTerminalRequest;
use Modules\Pos\Http\Requests\StoreTerminalRequest;
use Modules\Pos\Http\Requests\UpdateTerminalRequest;
use Modules\Pos\Http\Resources\TerminalResource;
use Modules\Pos\Models\Terminal;
use Modules\Pos\Services\TerminalPairing;
use Spatie\QueryBuilder\AllowedFilter;
use Spatie\QueryBuilder\QueryBuilder;

/**
 * The terminal registry, and the door a new device comes in through.
 *
 * Query parameters on index:
 *   ?filter[mode]=bar
 *   ?filter[status]=active
 *   ?filter[branch_id]=3
 *   ?filter[search]=kassa
 *   ?sort=code
 */
final class TerminalController extends Controller
{
    private const MAX_PER_PAGE = 100;

    public function __construct(private readonly TerminalPairing $pairing) {}

    public function index(Request $request): ResourceCollection
    {
        $perPage = min($request->integer('per_page', 50), self::MAX_PER_PAGE);

        $terminals = QueryBuilder::for(Terminal::class)
            ->allowedFilters([
                AllowedFilter::exact('mode'),
                AllowedFilter::exact('status'),
                AllowedFilter::exact('branch_id'),
                AllowedFilter::callback('search', function ($query, $value): void {
                    $like = '%'.mb_strtolower((string) $value).'%';
                    $query->where(function ($q) use ($like): void {
                        $q->whereRaw('LOWER(code) LIKE ?', [$like])
                            ->orWhereRaw('LOWER(name) LIKE ?', [$like]);
                    });
                }),
            ])
            ->allowedSorts(['code', 'name', 'last_seen_at', 'created_at'])
            ->defaultSort('code')
            ->paginate($perPage)
            ->withQueryString();

        return TerminalResource::collection($terminals);
    }

    /**
     * Create a till and hand back its first pairing code.
     *
     * The code appears in this response and nowhere else, ever — which is why
     * it is returned alongside the resource rather than being fetchable later.
     */
    public function store(StoreTerminalRequest $request): JsonResponse
    {
        $terminal = Terminal::create($request->validated());
        $code = $this->pairing->issueCode($terminal);

        return (new TerminalResource($terminal))
            ->additional(['pairing' => [
                'code' => $code,
                'expires_at' => $terminal->fresh()?->pairing_expires_at?->toIso8601String(),
            ]])
            ->response()
            ->setStatusCode(Response::HTTP_CREATED);
    }

    public function show(Terminal $terminal): TerminalResource
    {
        return new TerminalResource($terminal);
    }

    public function update(UpdateTerminalRequest $request, Terminal $terminal): TerminalResource
    {
        $terminal->update($request->validated());

        return new TerminalResource($terminal->fresh());
    }

    /**
     * Issue a replacement code — a till was reimaged, or the last one expired.
     */
    public function issueCode(Terminal $terminal): JsonResponse
    {
        $code = $this->pairing->issueCode($terminal);

        return response()->json(['pairing' => [
            'code' => $code,
            'expires_at' => $terminal->fresh()?->pairing_expires_at?->toIso8601String(),
        ]]);
    }

    /**
     * Exchange a code for a device token. No authentication — see PairTerminalRequest.
     */
    public function pair(PairTerminalRequest $request): JsonResponse
    {
        ['terminal' => $terminal, 'token' => $token] = $this->pairing->redeem(
            code: (string) $request->string('code'),
            deviceFingerprint: (string) $request->string('device_fingerprint'),
            appVersion: $request->filled('app_version') ? (string) $request->string('app_version') : null,
        );

        return response()->json([
            'token' => $token->plainTextToken,
            'terminal' => (new TerminalResource($terminal))->resolve($request),
            // The till sends this back as X-Tenant on every later request: a
            // device token is not a user, so ResolveTenant cannot infer the
            // restaurant from it.
            'tenant' => [
                'id' => $terminal->tenant_id,
                'slug' => $terminal->tenant?->slug,
            ],
        ], Response::HTTP_CREATED);
    }

    /**
     * "Still here." Cheap, frequent, and the only thing that makes the manager's
     * terminal-health screen mean anything.
     */
    public function heartbeat(Request $request): JsonResponse
    {
        $terminal = $request->user();

        if (! $terminal instanceof Terminal) {
            return response()->json([
                'message' => 'Bu endpoint faqat terminal tokeni bilan ishlaydi.',
                'code' => 'TERMINAL_TOKEN_REQUIRED',
            ], Response::HTTP_FORBIDDEN);
        }

        $terminal->forceFill([
            'last_seen_at' => now(),
            'app_version' => $request->filled('app_version')
                ? (string) $request->string('app_version')
                : $terminal->app_version,
        ])->save();

        return response()->json([
            'acknowledged_at' => now()->toIso8601String(),
            'terminal' => (new TerminalResource($terminal))->resolve($request),
        ]);
    }
}
