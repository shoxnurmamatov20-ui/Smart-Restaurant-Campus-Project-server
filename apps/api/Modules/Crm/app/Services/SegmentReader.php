<?php

declare(strict_types=1);

namespace Modules\Crm\Services;

use Illuminate\Database\Eloquent\Builder;
use Modules\Crm\Models\Customer;

/**
 * The one place that turns a segment name into a query.
 *
 * Three callers want it — the composer counting recipients, the dispatcher
 * building the list, and the nightly classifier deciding who belongs where —
 * and a segment that meant one thing while somebody typed and another when the
 * send went out is the failure this prevents.
 *
 * ---------------------------------------------------------------------------
 * Classification is the same rule read backwards
 *
 * `classify()` decides which bucket one guest is in; `query()` returns everyone
 * in a bucket. They have to agree exactly, and the only way to guarantee that
 * cheaply is to keep them in one file with the thresholds read from one config
 * key. A stored column is what makes `query()` an index scan rather than
 * arithmetic over the whole guest list — see the migration for why that
 * mattered enough to store it.
 */
final class SegmentReader
{
    /**
     * Everyone in a segment. `all` is not a filter.
     *
     * @return Builder<Customer>
     */
    public function query(string $segment): Builder
    {
        return Customer::query()->active()->inSegment($segment);
    }

    /**
     * Which of the three derived segments this guest is in, right now.
     *
     * Returns `null` for a guest whose segment must not be touched — today that
     * is anyone tagged `corporate`, which is somebody's decision about a company
     * account and not a pattern in their visits. A nightly pass that recomputed
     * it would wipe the tag every night and nobody would ever find out why.
     */
    public function classify(Customer $customer): ?string
    {
        if ($customer->segment === Customer::MANUAL_SEGMENT) {
            return null;
        }

        $atRiskDays = (int) config('crm.segments.at_risk_days');
        $regularVisits = (int) config('crm.segments.regular_visits');

        $lastVisit = $customer->last_visit_at;

        /*
         * Never seen, or seen once and long ago.
         *
         * A guest with no visit at all is `occasional` rather than `at_risk`:
         * at-risk means "they used to come and have stopped", and putting
         * somebody who has never eaten here on a win-back list sends "we have
         * missed you" to a stranger.
         */
        if ($lastVisit === null) {
            return 'occasional';
        }

        if ($lastVisit->diffInDays(now()) > $atRiskDays) {
            // One visit, thirty-one days ago, is not a lapsed regular — it is
            // somebody who tried the place once. Two is where a pattern starts.
            return $customer->visits_count >= 2 ? 'at_risk' : 'occasional';
        }

        return $customer->visits_count >= $regularVisits ? 'regular' : 'occasional';
    }
}
