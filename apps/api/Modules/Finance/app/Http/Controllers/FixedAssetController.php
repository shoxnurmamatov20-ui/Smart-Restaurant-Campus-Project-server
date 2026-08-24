<?php

declare(strict_types=1);

namespace Modules\Finance\Http\Controllers;

use App\Http\Controllers\Controller;
use App\Support\Tenancy\BusinessDay;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Modules\Finance\Http\Requests\StoreFixedAssetRequest;
use Modules\Finance\Http\Requests\UpdateFixedAssetRequest;
use Modules\Finance\Http\Resources\FixedAssetResource;
use Modules\Finance\Models\FixedAsset;
use Modules\Finance\Services\Depreciation;
use Spatie\QueryBuilder\AllowedFilter;
use Spatie\QueryBuilder\QueryBuilder;

/**
 * The register of what the restaurant bought once and uses for years.
 *
 * Mounted under /api/v1/finance/fixed-assets.
 *
 * Every row comes back with what it has written off so far and what it is worth
 * on the books — as of `?month=`, defaulting to the month the venue is trading
 * in. The month is a parameter rather than "now" because the register is printed
 * beside a statement, and a March statement sitting next to April's accumulated
 * figures is the kind of disagreement nobody spots until an audit.
 */
final class FixedAssetController extends Controller
{
    private const MAX_PER_PAGE = 100;

    public function __construct(
        private readonly Depreciation $depreciation,
        private readonly BusinessDay $businessDay,
    ) {}

    /**
     * @return array<string, mixed>
     */
    public function index(Request $request): array
    {
        $month = $this->monthOf($request);
        $perPage = min($request->integer('per_page', 50), self::MAX_PER_PAGE);

        $records = QueryBuilder::for(FixedAsset::class)
            ->allowedFilters([
                AllowedFilter::exact('category'),
                AllowedFilter::exact('branch', 'branch_id'),
                // "Only what we still have". A scope rather than a column
                // filter, because `disposed_on` is a date and a client asking
                // `filter[disposed_on]=null` is a client encoding SQL.
                AllowedFilter::scope('live'),
            ])
            ->allowedSorts(['acquired_on', 'cost', 'name'])
            ->defaultSort('-acquired_on')
            ->paginate($perPage)
            ->withQueryString();

        $rows = [];
        $charge = 0;

        foreach ($records as $asset) {
            $accumulated = $this->accumulated($asset, $month);

            $asset->setAttribute('accumulated', $accumulated);
            $asset->setAttribute('book_value', max(0, $asset->cost - $accumulated));

            $rows[] = (new FixedAssetResource($asset))->toArray($request);
            $charge += $this->depreciation->forAsset($asset, $month);
        }

        return [
            'data' => $rows,
            'meta' => [
                'month' => $month,
                // This page's charge, not the register's — said plainly, because
                // a total that silently meant "the fifty rows you happened to
                // ask for" is the kind of figure that reaches a statement.
                'page_monthly_charge' => $charge,
                'monthly_charge' => $this->depreciation->forMonth(
                    $month,
                    $request->has('filter.branch') ? $request->integer('filter.branch') : null,
                ),
                'current_page' => $records->currentPage(),
                'last_page' => $records->lastPage(),
                'total' => $records->total(),
            ],
        ];
    }

    public function store(StoreFixedAssetRequest $request): FixedAssetResource
    {
        $record = FixedAsset::create($request->validated())->refresh();

        return new FixedAssetResource($record);
    }

    public function show(Request $request, FixedAsset $fixedAsset): FixedAssetResource
    {
        $month = $this->monthOf($request);
        $accumulated = $this->accumulated($fixedAsset, $month);

        $fixedAsset->setAttribute('accumulated', $accumulated);
        $fixedAsset->setAttribute('book_value', max(0, $fixedAsset->cost - $accumulated));

        return new FixedAssetResource($fixedAsset);
    }

    public function update(UpdateFixedAssetRequest $request, FixedAsset $fixedAsset): FixedAssetResource
    {
        $fixedAsset->update($request->validated());

        return new FixedAssetResource($fixedAsset->refresh());
    }

    /**
     * Remove an entry that should never have been on the register.
     *
     * Disposing of an asset is `PATCH … {disposed_on}`, not this. The difference
     * matters: a disposed asset owes the months it was held for and its charge
     * still appears on statements already printed, while a mistyped row owes
     * nothing and has to leave without a trace of a charge behind it.
     */
    public function destroy(FixedAsset $fixedAsset): Response
    {
        $fixedAsset->delete();

        return response()->noContent();
    }

    // ============ Internals ============

    /** `?month=YYYY-MM`, or the month the venue is trading in. */
    private function monthOf(Request $request): string
    {
        $asked = $request->string('month')->toString();

        return preg_match('/^\d{4}-(0[1-9]|1[0-2])$/', $asked) === 1
            ? $asked
            : substr($this->businessDay->dateFor(), 0, 7);
    }

    /**
     * Everything written off up to and including `$month`.
     *
     * A closed form rather than a loop over months: `charge × elapsed`, capped
     * at the depreciable base. Looping would be thirty iterations per row per
     * page, and the arithmetic is the same straight line either way — the only
     * place the two could differ is the final instalment's remainder, which the
     * cap absorbs.
     */
    private function accumulated(FixedAsset $asset, string $month): int
    {
        $charge = $asset->monthlyCharge();

        if ($charge <= 0) {
            return 0;
        }

        $elapsed = $this->monthsFromAcquisition($asset, $month);

        /*
         * A disposal stops the clock the month BEFORE it happened, which is the
         * off-by-one this method had first: `forAsset()` charges nothing in the
         * disposal month, so counting up to and including it made the register's
         * accumulated column one instalment richer than the twelve monthly
         * charges that produced it — and a register that disagrees with the
         * statements it was printed beside is the thing this column is for.
         */
        if ($asset->disposed_on !== null) {
            $untilDisposal = $this->monthsFromAcquisition($asset, $asset->disposed_on->format('Y-m')) - 1;
            $elapsed = min($elapsed, $untilDisposal);
        }

        $months = max(0, min($elapsed, $asset->useful_life_months));

        return min($charge * $months, $asset->cost - $asset->residual);
    }

    /** Whole months from the purchase to the first of `$month`. */
    private function monthsFromAcquisition(FixedAsset $asset, string $month): int
    {
        return (((int) substr($month, 0, 4) - $asset->acquired_on->year) * 12)
            + ((int) substr($month, 5, 2) - $asset->acquired_on->month);
    }
}
