<?php

declare(strict_types=1);

namespace Modules\Crm\Http\Controllers;

use App\Http\Controllers\Controller;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\ResourceCollection;
use Illuminate\Http\Response;
use Illuminate\Support\Collection;
use Modules\Crm\Http\Requests\StoreTriggerRequest;
use Modules\Crm\Http\Requests\UpdateTriggerRequest;
use Modules\Crm\Http\Resources\TriggerResource;
use Modules\Crm\Models\Customer;
use Modules\Crm\Models\Trigger;
use Modules\Crm\Models\TriggerSend;
use Spatie\QueryBuilder\AllowedFilter;
use Spatie\QueryBuilder\QueryBuilder;

/**
 * Automated messages — /api/v1/crm/triggers.
 *
 * The three figures on each card are counted here rather than in the resource,
 * once for the whole page. A resource that counted per row would turn a list of
 * four cards into twelve round trips, and the two month-bounded counts are the
 * expensive ones.
 *
 * `audience` deliberately means "how many guests this restaurant has who could
 * ever match", not "how many are due today" — the card's label is *Auditoriya*
 * and the number under it should not drop to nought on a day with no birthdays.
 * Who is due today is `crm:triggers --dry-run`, which is a different question.
 */
final class TriggerController extends Controller
{
    private const MAX_PER_PAGE = 100;

    public function index(Request $request): ResourceCollection
    {
        $perPage = min($request->integer('per_page', 25), self::MAX_PER_PAGE);

        $records = QueryBuilder::for(Trigger::class)
            ->allowedFilters([
                AllowedFilter::exact('kind'),
                AllowedFilter::exact('is_active'),
                AllowedFilter::exact('key'),
            ])
            ->allowedSorts(['key', 'created_at'])
            ->defaultSort('id')
            ->paginate($perPage)
            ->withQueryString();

        $this->stampCounters($records->getCollection());

        return TriggerResource::collection($records);
    }

    public function store(StoreTriggerRequest $request): TriggerResource
    {
        // refresh() so database defaults (is_active, timestamps) reach the
        // client; without it the response reports null for every column the
        // request did not send.
        $trigger = Trigger::create($request->validated())->refresh();

        return new TriggerResource($trigger);
    }

    public function show(Trigger $trigger): TriggerResource
    {
        $this->stampCounters(collect([$trigger]));

        return new TriggerResource($trigger);
    }

    public function update(UpdateTriggerRequest $request, Trigger $trigger): TriggerResource
    {
        $trigger->update($request->validated());

        return new TriggerResource($trigger->refresh());
    }

    public function destroy(Trigger $trigger): Response
    {
        $trigger->delete();

        return response()->noContent();
    }

    /**
     * The switch, on its own route.
     *
     * Same reasoning as the promotions pause: the console's control is one tap
     * and a PATCH assembled from a stale card could rewrite the message while
     * doing nothing but switching it off — and this message goes out to guests
     * with nobody watching.
     */
    public function toggle(Request $request, Trigger $trigger): TriggerResource
    {
        $on = $request->boolean('is_active', ! $trigger->is_active);

        $trigger->forceFill(['is_active' => $on])->save();

        return new TriggerResource($trigger->refresh());
    }

    /**
     * Put the three card figures onto the models the resource will render.
     *
     * Two grouped queries for the whole page rather than two per row.
     *
     * @param  Collection<int, Trigger>  $triggers
     */
    private function stampCounters(Collection $triggers): void
    {
        if ($triggers->isEmpty()) {
            return;
        }

        $ids = $triggers->pluck('id')->all();
        $since = now()->startOfMonth();

        /** @var Collection<int, object{trigger_id: int, sent: int, converted: int}> $counts */
        $counts = TriggerSend::query()
            ->selectRaw('trigger_id, count(*) as sent, count(*) filter (where converted) as converted')
            ->whereIn('trigger_id', $ids)
            ->where('created_at', '>=', $since)
            ->groupBy('trigger_id')
            ->get()
            ->keyBy('trigger_id');

        // One number for the whole page: every guest who could ever be reached.
        // Per-kind audiences would be four more queries for a figure the card
        // uses as a denominator rather than as a list.
        $audience = Customer::query()->active()
            ->whereNotNull('phone')->where('phone', '!=', '')
            ->count();

        foreach ($triggers as $trigger) {
            $row = $counts->get($trigger->id);

            $trigger->setAttribute('audience', $audience);
            $trigger->setAttribute('sent_this_month', (int) ($row->sent ?? 0));
            $trigger->setAttribute('converted_this_month', (int) ($row->converted ?? 0));
        }
    }
}
