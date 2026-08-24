<?php

declare(strict_types=1);

namespace Modules\Crm\Http\Controllers;

use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\ResourceCollection;
use Illuminate\Http\Response;
use Illuminate\Validation\Rule;
use Modules\Crm\Http\Requests\StoreCustomerRequest;
use Modules\Crm\Http\Requests\UpdateCustomerRequest;
use Modules\Crm\Http\Resources\CustomerAddressResource;
use Modules\Crm\Http\Resources\CustomerResource;
use Modules\Crm\Http\Resources\LoyaltyTransactionResource;
use Modules\Crm\Models\Customer;
use Modules\Crm\Models\LoyaltyTransaction;
use Spatie\QueryBuilder\AllowedFilter;
use Spatie\QueryBuilder\QueryBuilder;

/**
 * REST API for customers.
 *
 * Mounted under /api/v1/crm/customers and gated by Spatie permission
 * middleware on the route definition (Modules/Crm/routes/api.php).
 */
final class CustomerController extends Controller
{
    private const MAX_PER_PAGE = 100;

    public function index(Request $request): ResourceCollection
    {
        $perPage = min($request->integer('per_page', 25), self::MAX_PER_PAGE);

        $records = QueryBuilder::for(Customer::class)
            ->allowedFilters([
                AllowedFilter::exact('phone'),
                AllowedFilter::exact('tier'),
                AllowedFilter::exact('segment'),
                AllowedFilter::exact('is_active'),
                AllowedFilter::partial('name'),
                AllowedFilter::callback('birthday_today', function ($query, $value): void {
                    if (filter_var($value, FILTER_VALIDATE_BOOLEAN)) {
                        $query->birthdayToday();
                    }
                }),
            ])
            /*
             * `last_visit_at` is sortable and it is the sort the console's guest
             * list actually opens on — "who have we not seen" is the question
             * the screen exists to answer, and answering it by lifetime spend
             * puts the best customer at the top whether or not they still come.
             */
            ->allowedSorts(['name', 'points', 'total_spent', 'visits_count', 'last_visit_at', 'created_at'])
            ->allowedIncludes(['loyaltyTransactions', 'feedbacks'])
            ->defaultSort('-total_spent')
            ->paginate($perPage)
            ->withQueryString();

        return CustomerResource::collection($records);
    }

    /**
     * How many guests are in each segment, right now.
     *
     * One grouped query rather than five counts, and it exists because of the
     * screen it feeds: the marketing composer's audience picker draws five
     * numbers side by side, and five separate requests would report five
     * slightly different moments — a guest crossing the thirty-day line between
     * two of them appears in neither total or in both.
     *
     * `all` is included and is deliberately not the sum of the other four: it is
     * everyone reachable, which excludes the guests with no phone number that a
     * campaign could never have been sent to anyway.
     */
    public function segments(): JsonResponse
    {
        $reachable = fn () => Customer::query()->active()
            ->whereNotNull('phone')->where('phone', '!=', '');

        /** @var array<int, object{segment: ?string, total: int}> $rows */
        $rows = $reachable()
            ->selectRaw('segment, count(*) as total')
            ->groupBy('segment')
            ->get()
            ->all();

        $counts = [];

        foreach ($rows as $row) {
            // A guest nobody has classified yet is drawn with the occasional
            // ones, exactly as the console maps a null segment.
            $counts[$row->segment ?? 'occasional'] = ($counts[$row->segment ?? 'occasional'] ?? 0) + (int) $row->total;
        }

        $segments = [['id' => 'all', 'count' => $reachable()->count()]];

        foreach (Customer::SEGMENTS as $segment) {
            $segments[] = ['id' => $segment, 'count' => $counts[$segment] ?? 0];
        }

        /*
         * Two counts the console's own header needs, beside the segments.
         *
         * `total` is every guest on file — the segment rows count only the
         * reachable ones, and a header that said "312 known guests" while the
         * list showed 400 would be read as a bug. `loyalty_members` is guests
         * holding points, which is what "member" means here: a tier is
         * recalculated from lifetime spend and every guest has one, so tiers
         * cannot answer it.
         *
         * In `meta` rather than as two more `data` rows: `data` is the
         * composer's segment picker, and an id it has no name for is drawn as
         * a chip nobody can send to.
         */
        return response()->json([
            'data' => $segments,
            'meta' => [
                'total' => Customer::query()->active()->count(),
                'loyalty_members' => Customer::query()->active()->where('points', '>', 0)->count(),
            ],
        ]);
    }

    /**
     * Where a courier is sent, the guest's default first.
     *
     * A separate read rather than an `?include=` on the customer, and the
     * reason is who asks. The order operator's caller card wants one line —
     * where to send the food — while somebody is on the telephone; the guest
     * list wants a hundred customers and none of their addresses. Folding an
     * address list into `CustomerResource` would put four addresses each into
     * every page of a hundred, on the read that has to be quick.
     *
     * `crm.view` and nothing more: an operator correcting an address while the
     * caller is still on the line writes through the guest's own app, not
     * through here. There is deliberately no staff-side write — an address
     * belongs to the person who lives at it.
     */
    public function addresses(Customer $customer): ResourceCollection
    {
        return CustomerAddressResource::collection($customer->addresses);
    }

    public function store(StoreCustomerRequest $request): CustomerResource
    {
        // refresh() so database defaults (status, timestamps) reach the client;
        // without it the response reports null for every column the request
        // did not send.
        $record = Customer::create($request->validated())->refresh();

        return new CustomerResource($record->load('loyaltyTransactions'));
    }

    public function show(Customer $customer): CustomerResource
    {
        return new CustomerResource($customer->load('loyaltyTransactions'));
    }

    public function update(UpdateCustomerRequest $request, Customer $customer): CustomerResource
    {
        $customer->update($request->validated());

        return new CustomerResource($customer->refresh()->load('loyaltyTransactions'));
    }

    public function destroy(Customer $customer): Response
    {
        $customer->delete();

        return response()->noContent();
    }

    /** Earn or redeem loyalty points. */
    public function adjustPoints(Request $request, Customer $customer): JsonResponse
    {
        $validated = $request->validate([
            'kind' => ['required', Rule::in(LoyaltyTransaction::KINDS)],
            'points' => ['required', 'integer', 'min:1'],
            'order_id' => ['nullable', 'integer', 'min:1'],
            'note' => ['nullable', 'string', 'max:255'],
        ]);

        $transaction = $customer->adjustPoints(
            $validated['kind'],
            (int) $validated['points'],
            $validated['order_id'] ?? null,
            $validated['note'] ?? null,
        );

        abort_if($transaction === null, 422, 'Mijozda yetarli bonus yo\'q.');

        return response()->json([
            'transaction' => new LoyaltyTransactionResource($transaction),
            'customer' => new CustomerResource($customer->refresh()),
        ], 201);
    }
}
