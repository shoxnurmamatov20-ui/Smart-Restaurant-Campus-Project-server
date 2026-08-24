<?php

declare(strict_types=1);

namespace Modules\Crm\Http\Controllers;

use App\Http\Controllers\Controller;
use App\Support\Counters\BranchCounters;
use App\Support\Errors\ApiException;
use App\Support\Tenancy\BranchContext;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\ResourceCollection;
use Illuminate\Http\Response;
use Illuminate\Support\Facades\DB;
use Modules\Crm\Http\Requests\DecideCaseRequest;
use Modules\Crm\Http\Requests\StoreCaseRequest;
use Modules\Crm\Http\Requests\UpdateCaseRequest;
use Modules\Crm\Http\Resources\CaseResource;
use Modules\Crm\Models\CaseEvent;
use Modules\Crm\Models\ComplaintCase;
use Modules\Crm\Models\Feedback;
use Modules\Crm\Services\CaseOutcomes;
use Spatie\QueryBuilder\AllowedFilter;
use Spatie\QueryBuilder\QueryBuilder;

/**
 * The complaints desk — /api/v1/crm/cases.
 *
 * Four writes, and only one of them moves money. `decide` is where the design's
 * four buttons land, and it is the reason this controller exists rather than a
 * `status` column on `crm.feedbacks`: an outcome, an amount, a name and a
 * timestamp have to be written together or the row afterwards cannot say what
 * anybody was told.
 *
 * ---------------------------------------------------------------------------
 * The ceiling is enforced here, not drawn here
 *
 * Below `crm.cases.auto_refund_ceiling_tiyin` whoever picks the complaint up
 * may answer it — that is what `crm.update` buys. Above it the request needs
 * `crm.manage` as well, which is the same split the tab already uses between
 * taking money in and moving a credit limit: the person standing in front of
 * the problem must not be the person who authorises the expensive answer to it.
 *
 * The console draws the sentence saying no manager is needed; this is what
 * makes it true.
 */
final class CaseController extends Controller
{
    private const MAX_PER_PAGE = 100;

    public function __construct(
        private readonly BranchCounters $counters,
        private readonly BranchContext $branches,
        private readonly CaseOutcomes $outcomes,
    ) {}

    public function index(Request $request): ResourceCollection
    {
        $perPage = min($request->integer('per_page', 25), self::MAX_PER_PAGE);

        // The relations are eager-loaded on the subject rather than after
        // `for()`, because the resource reads a guest's name, the assignee's and
        // the decider's on every row — three queries per complaint otherwise.
        $records = QueryBuilder::for(ComplaintCase::query()->with(['customer', 'assignee', 'decidedBy']))
            ->allowedFilters([
                AllowedFilter::exact('status'),
                AllowedFilter::exact('kind'),
                AllowedFilter::exact('channel'),
                AllowedFilter::exact('outcome'),
                AllowedFilter::exact('branch', 'branch_id'),
                AllowedFilter::exact('assignee', 'assigned_to_user_id'),
                AllowedFilter::callback('open', function ($query, $value): void {
                    if (filter_var($value, FILTER_VALIDATE_BOOLEAN)) {
                        $query->open();
                    }
                }),
            ])
            ->allowedSorts(['created_at', 'amount_tiyin', 'due_at'])
            /*
             * Oldest first, and only for the open ones this default reaches.
             *
             * The queue is worked from the top and lateness is what makes a
             * complaint expensive — newest-first would put this morning's
             * grumble above the one that has been waiting since Friday.
             */
            ->defaultSort('created_at')
            ->paginate($perPage)
            ->withQueryString();

        return CaseResource::collection($records);
    }

    public function store(StoreCaseRequest $request): CaseResource
    {
        $case = $this->open($request->validated(), $request->user()?->getAuthIdentifier());

        return new CaseResource($case->load(['customer', 'events.user']));
    }

    public function show(ComplaintCase $case): CaseResource
    {
        return new CaseResource($case->load(['customer', 'assignee', 'decidedBy', 'events.user']));
    }

    /**
     * Working the complaint: hand it to somebody, move it along, add what was
     * learned.
     *
     * Every one of those is a history line as well as a column, which is why
     * this is not `$case->update(...)`. A queue that records the final state and
     * nothing else cannot answer the question asked when the same guest
     * complains for the fourth time.
     */
    public function update(UpdateCaseRequest $request, ComplaintCase $case): CaseResource
    {
        $payload = $request->validated();
        $note = $payload['note'] ?? null;
        unset($payload['note']);

        $userId = $request->user()?->getAuthIdentifier();

        DB::transaction(function () use ($case, $payload, $note, $userId): void {
            if (array_key_exists('assigned_to_user_id', $payload)
                && (int) $payload['assigned_to_user_id'] !== (int) $case->assigned_to_user_id) {
                $this->log($case, $userId, 'assigned', (string) $case->assigned_to_user_id, (string) $payload['assigned_to_user_id']);
            }

            if (isset($payload['status']) && $payload['status'] !== $case->status) {
                $this->log($case, $userId, 'status', $case->status, (string) $payload['status']);
            }

            if (is_string($note) && trim($note) !== '') {
                $this->log($case, $userId, 'note', null, null, $note);
            }

            if ($payload !== []) {
                $case->update($payload);
            }
        });

        return new CaseResource($case->refresh()->load(['customer', 'assignee', 'decidedBy', 'events.user']));
    }

    public function destroy(ComplaintCase $case): Response
    {
        $case->delete();

        return response()->noContent();
    }

    /**
     * One of the four answers, and whatever it costs.
     *
     * Idempotent by refusal rather than by replay: a complaint that has already
     * been answered cannot be answered again, because the second answer would
     * pay the guest twice. Changing a decision is a new conversation and a new
     * line in the history, which is what `update` and a note are for.
     */
    public function decide(DecideCaseRequest $request, ComplaintCase $case): CaseResource
    {
        if ($case->outcome !== null) {
            throw ApiException::of('crm.case_already_decided', meta: [
                'outcome' => $case->outcome,
                'decided_at' => $case->decided_at?->toIso8601String(),
            ]);
        }

        $outcome = (string) $request->validated('outcome');
        $amount = $this->amountFor($case, $outcome, $request->validated('amount_tiyin'));

        $user = $request->user();

        if ($amount > (int) config('crm.cases.auto_refund_ceiling_tiyin')
            && ($user === null || ! $user->can('crm.manage'))) {
            throw ApiException::of('crm.case_needs_manager', meta: [
                'amount_tiyin' => $amount,
                'ceiling_tiyin' => (int) config('crm.cases.auto_refund_ceiling_tiyin'),
            ]);
        }

        $note = $request->validated('note');

        DB::transaction(function () use ($case, $outcome, $amount, $note, $user): void {
            $this->outcomes->apply($case, $outcome, $amount, $user?->getAuthIdentifier());

            $case->forceFill([
                'outcome' => $outcome,
                'outcome_tiyin' => $amount,
                'decided_by_user_id' => $user?->getAuthIdentifier(),
                'decided_at' => now(),
                'status' => 'resolved',
            ])->save();

            $this->log($case, $user?->getAuthIdentifier(), 'decided', null, $outcome, is_string($note) ? $note : null);
        });

        return new CaseResource($case->refresh()->load(['customer', 'assignee', 'decidedBy', 'events.user']));
    }

    /**
     * Open a desk on a review somebody left.
     *
     * The seam the CRM screen's review queue asked for. The review's own words,
     * the guest it came from and the order it names all move across, because
     * asking somebody to retype a complaint they can already read is how the
     * quote — which is evidence — gets paraphrased.
     *
     * Pressing it twice returns the case that already exists rather than
     * refusing: two people looking at the same one-star both press it, and a
     * 409 in front of the second one is a second complaint desk opened by hand.
     */
    public function fromFeedback(Request $request, Feedback $feedback): JsonResponse
    {
        $existing = ComplaintCase::query()->where('feedback_id', $feedback->id)->first();

        if ($existing !== null) {
            return (new CaseResource($existing->load(['customer', 'events.user'])))
                ->response()
                ->setStatusCode(Response::HTTP_OK);
        }

        $case = $this->open([
            'channel' => $this->channelFor($feedback->source),
            // A review has a score and an aspect, not a cause. `quality` is the
            // honest default and the desk's first job is to correct it.
            'kind' => 'quality',
            'customer_id' => $feedback->customer_id,
            'guest_name' => $feedback->guest_name,
            'guest_phone' => $feedback->guest_phone,
            'order_id' => $feedback->order_id,
            'order_number' => $feedback->order_number,
            'quote' => $feedback->comment,
            'feedback_id' => $feedback->id,
        ], $request->user()?->getAuthIdentifier());

        /*
         * The review moves out of the queue in the same breath.
         *
         * A one-star sitting in "new" while somebody is already working the
         * complaint is how two people ring the same guest.
         */
        $feedback->forceFill(['status' => 'in_review'])->save();

        return (new CaseResource($case->load(['customer', 'events.user'])))
            ->response()
            ->setStatusCode(Response::HTTP_CREATED);
    }

    /**
     * The month, in four grouped queries: causes, answers, a count and a clock.
     *
     * One endpoint rather than four, because the console's whole right-hand
     * column and its KPI strip are the same window over the same table — and a
     * screen that asked four times would report four slightly different months
     * as the clock moved between the requests.
     *
     * Grouped in the database rather than counted in the client for the obvious
     * reason: the window is a month of complaints and the panel is a dozen
     * numbers.
     */
    public function causes(Request $request): JsonResponse
    {
        $days = min(max($request->integer('days', 30), 1), 365);
        $since = now()->subDays($days);

        /** @var array<int, object{kind: string, total: int, cost: int}> $kinds */
        $kinds = ComplaintCase::query()
            ->selectRaw('kind, count(*) as total, coalesce(sum(outcome_tiyin), 0) as cost')
            ->where('created_at', '>=', $since)
            ->groupBy('kind')
            ->orderByDesc('total')
            ->get()
            ->all();

        /** @var array<int, object{outcome: string, total: int, cost: int}> $outcomes */
        $outcomes = ComplaintCase::query()
            ->selectRaw('outcome, count(*) as total, coalesce(sum(outcome_tiyin), 0) as cost')
            ->whereNotNull('outcome')
            ->where('created_at', '>=', $since)
            ->groupBy('outcome')
            ->get()
            ->all();

        /*
         * How long an answer took, in minutes, over the ones that got one.
         *
         * Averaged in PostgreSQL rather than over a page of rows: the console
         * lists fifty complaints and the month has hundreds, so an average
         * computed client-side would be an average of whatever happened to be
         * on screen — and it would move every time somebody changed the filter.
         */
        $minutes = ComplaintCase::query()
            ->whereNotNull('decided_at')
            ->where('created_at', '>=', $since)
            ->selectRaw('avg(extract(epoch from (decided_at - created_at)) / 60) as m')
            ->value('m');

        return response()->json([
            'data' => [
                'days' => $days,
                'total' => array_sum(array_map(static fn (object $row): int => (int) $row->total, $kinds)),
                // `null` rather than zero for a month nobody has answered
                // anything in: zero minutes would read as instant service.
                'answer_minutes' => $minutes === null ? null : (int) round((float) $minutes),
                'kinds' => array_map(static fn (object $row): array => [
                    'kind' => $row->kind,
                    'count' => (int) $row->total,
                    'cost_tiyin' => (int) $row->cost,
                ], $kinds),
                'outcomes' => array_map(static fn (object $row): array => [
                    'outcome' => $row->outcome,
                    'count' => (int) $row->total,
                    'cost_tiyin' => (int) $row->cost,
                ], $outcomes),
            ],
        ]);
    }

    /**
     * Write the row, stamp the number and the deadline, and open the history.
     *
     * @param array<string, mixed> $payload
     */
    private function open(array $payload, ?int $userId): ComplaintCase
    {
        return DB::transaction(function () use ($payload, $userId): ComplaintCase {
            $branchId = isset($payload['branch_id']) ? (int) $payload['branch_id'] : $this->branches->id();

            /*
             * The counter is taken last, next to the insert it numbers: the
             * caller inside a transaction holds its row lock until commit, and
             * a number taken at the top of a long transaction serialises every
             * other complaint being opened in the building.
             */
            $sequence = $this->counters->next('case.number', $branchId);

            $case = new ComplaintCase;

            $case->forceFill(array_merge($payload, [
                'branch_id' => $branchId,
                // `SH` for shikoyat — what a guest is asked to quote on the
                // telephone, so it has to be short and unambiguous out loud.
                'number' => sprintf('SH-%04d', $sequence),
                'status' => 'open',
                'due_at' => now()->addHours((int) config('crm.cases.sla_hours')),
            ]))->save();

            $this->log($case, $userId, 'opened', null, $case->channel);

            return $case;
        });
    }

    /**
     * What this outcome costs, when the client did not say.
     *
     * The defaults are the design's buttons: the whole disputed sum, half of it
     * rounded to the nearest thousand so'm, and nothing. A client MAY send its
     * own figure — a manager settling on 30 000 of a disputed 88 000 is a real
     * conversation — and then that figure is what is recorded.
     */
    private function amountFor(ComplaintCase $case, string $outcome, mixed $asked): int
    {
        if (is_int($asked)) {
            return max(0, $asked);
        }

        return match ($outcome) {
            'refunded' => $case->amount_tiyin,
            'partly' => $case->halfOfAmount(),
            // Points are a loyalty grant rather than a refund, and their size is
            // the disputed amount so the guest is made whole in a currency that
            // brings them back. `declined` costs nothing by definition.
            'points' => $case->amount_tiyin,
            default => 0,
        };
    }

    /** A review's source, as a complaint channel. */
    private function channelFor(?string $source): string
    {
        return match ($source) {
            'bot' => 'bot',
            'web' => 'web',
            'qr' => 'table',
            'aggregator' => 'aggregator',
            default => 'web',
        };
    }

    private function log(
        ComplaintCase $case,
        ?int $userId,
        string $kind,
        ?string $from = null,
        ?string $to = null,
        ?string $note = null,
    ): void {
        CaseEvent::query()->create([
            'tenant_id' => $case->tenant_id,
            'case_id' => $case->id,
            'user_id' => $userId,
            'kind' => $kind,
            'from_value' => $from,
            'to_value' => $to,
            'note' => $note,
        ]);
    }
}
