<?php

declare(strict_types=1);

namespace Modules\Crm\Http\Controllers;

use App\Http\Controllers\Controller;
use App\Support\Errors\ApiException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\ResourceCollection;
use Illuminate\Http\Response;
use Modules\Crm\Http\Requests\StoreCampaignRequest;
use Modules\Crm\Http\Requests\UpdateCampaignRequest;
use Modules\Crm\Http\Resources\CampaignDeliveryResource;
use Modules\Crm\Http\Resources\CampaignResource;
use Modules\Crm\Models\Campaign;
use Modules\Crm\Models\CampaignDelivery;
use Modules\Crm\Services\CampaignDispatcher;
use Modules\Crm\Services\SmsCost;
use Spatie\QueryBuilder\AllowedFilter;
use Spatie\QueryBuilder\QueryBuilder;

/**
 * The marketing composer's server half — /api/v1/crm/campaigns.
 *
 * Three things here are not CRUD and each closes something the console could
 * only pretend to do:
 *
 *   `estimate` prices a body against a segment before anything is written. The
 *   composer has always shown a cost while somebody typed; until now that
 *   number was computed only in the browser, which means the tariff lived in
 *   two places and the recipient count was a fixture.
 *
 *   `send` freezes the list and queues one job per person. It is a POST rather
 *   than a PATCH on `status` because it is not a state change with a side
 *   effect — it IS the side effect, and it costs money.
 *
 *   `deliveries` is the report behind a row: who it went to, what the gateway
 *   said, and what each one was billed at. Without it the cost column is a
 *   number nobody can check.
 */
final class CampaignController extends Controller
{
    private const MAX_PER_PAGE = 100;

    public function __construct(private readonly CampaignDispatcher $dispatcher) {}

    public function index(Request $request): ResourceCollection
    {
        $perPage = min($request->integer('per_page', 25), self::MAX_PER_PAGE);

        $records = QueryBuilder::for(Campaign::class)
            ->allowedFilters([
                AllowedFilter::exact('status'),
                AllowedFilter::exact('segment'),
                AllowedFilter::partial('name'),
            ])
            ->allowedSorts(['name', 'created_at', 'scheduled_for', 'recipients', 'cost_tiyin'])
            ->defaultSort('-created_at')
            ->paginate($perPage)
            ->withQueryString();

        return CampaignResource::collection($records);
    }

    public function store(StoreCampaignRequest $request): CampaignResource
    {
        $payload = $request->validated();

        /*
         * The estimate is stamped by the server, from the body the server was
         * given. A client-supplied figure would let the composer's promise and
         * the record disagree about the very thing the record exists to make
         * checkable.
         */
        $payload['estimated_cost_tiyin'] = SmsCost::tiyin(
            (string) $payload['body'],
            $this->reach((string) ($payload['segment'] ?? 'all')),
        );
        $payload['created_by_user_id'] = $request->user()?->getAuthIdentifier();

        // refresh() so database defaults (counters, timestamps) reach the
        // client; without it the response reports null for every column the
        // request did not send.
        $campaign = Campaign::create($payload)->refresh();

        return new CampaignResource($campaign);
    }

    public function show(Campaign $campaign): CampaignResource
    {
        return new CampaignResource($campaign);
    }

    public function update(UpdateCampaignRequest $request, Campaign $campaign): CampaignResource
    {
        if (! $campaign->isEditable()) {
            throw ApiException::of('crm.campaign_already_sent');
        }

        $campaign->update($request->validated());

        return new CampaignResource($campaign->refresh());
    }

    public function destroy(Campaign $campaign): Response
    {
        /*
         * A campaign that has left cannot be deleted, only kept.
         *
         * Soft delete would hide it from the list, and the list is what a
         * marketer reconciles the SMS invoice against — a month whose campaigns
         * can be tidied away is a month whose bill cannot be explained.
         */
        if ($campaign->hasLeft()) {
            throw ApiException::of('crm.campaign_already_sent');
        }

        $campaign->delete();

        return response()->noContent();
    }

    /**
     * What this body would cost this segment, before anything is written.
     *
     * A POST rather than a GET because the body travels in it: a message with a
     * guest's name and an apostrophe in a query string is a message somebody's
     * proxy logs. It writes nothing, which is why it needs no idempotency
     * beyond the global middleware's.
     */
    public function estimate(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'body' => ['required', 'string', 'max:640'],
            'segment' => ['nullable', 'string', 'max:32'],
        ]);

        $body = (string) $validated['body'];
        $segment = (string) ($validated['segment'] ?? 'all');
        $reach = $this->reach($segment);

        return response()->json([
            'data' => [
                'segment' => $segment,
                'recipients' => $reach,
                'parts' => SmsCost::parts($body),
                'cyrillic' => SmsCost::isCyrillic($body),
                'part_tiyin' => (int) config('crm.campaigns.sms_part_tiyin'),
                'cost_tiyin' => SmsCost::tiyin($body, $reach),
            ],
        ]);
    }

    /**
     * Send it. Idempotent by the unique index behind the delivery rows.
     *
     * The response is the campaign rather than the count, because the console
     * replaces the row it just pressed and needs the new status on it — a
     * screen that showed `draft` for the twenty minutes a send takes is a
     * screen somebody presses twice.
     */
    public function send(Campaign $campaign): CampaignResource
    {
        $this->dispatcher->send($campaign);

        return new CampaignResource($campaign->refresh());
    }

    /** Who it went to and what the gateway said. */
    public function deliveries(Request $request, Campaign $campaign): ResourceCollection
    {
        $perPage = min($request->integer('per_page', 50), self::MAX_PER_PAGE);

        $records = QueryBuilder::for(
            CampaignDelivery::query()->where('campaign_id', $campaign->id)
        )
            ->allowedFilters([AllowedFilter::exact('status')])
            ->allowedSorts(['sent_at', 'id'])
            ->defaultSort('id')
            ->paginate($perPage)
            ->withQueryString();

        return CampaignDeliveryResource::collection($records);
    }

    /** How many guests a segment reaches right now. */
    private function reach(string $segment): int
    {
        $campaign = new Campaign;
        $campaign->segment = $segment;

        return $this->dispatcher->recipients($campaign)->count();
    }
}
