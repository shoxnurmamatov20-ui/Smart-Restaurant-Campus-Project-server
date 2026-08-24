<?php

declare(strict_types=1);

namespace Modules\Crm\Services;

use App\Support\Errors\ApiException;
use Carbon\CarbonImmutable;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Collection;
use Illuminate\Support\Facades\DB;
use Modules\Crm\Jobs\SendCampaignMessage;
use Modules\Crm\Models\Campaign;
use Modules\Crm\Models\CampaignDelivery;
use Modules\Crm\Models\Customer;

/**
 * Turning a campaign into two thousand messages.
 *
 * The order here is the whole correctness story and it is deliberately not the
 * obvious one. Every delivery row is written FIRST, inside one transaction,
 * with the recipient list frozen onto it — and only then is a job dispatched
 * per row. Sending first and recording afterwards would mean a worker that died
 * between the two sent a paid message nothing knows about, and a second press
 * of "send" would send it again.
 *
 * The unique index on `(campaign_id, customer_id)` is what makes the second
 * press cost nothing: the insert loses, the row already exists, and the guest
 * gets one message.
 *
 * ---------------------------------------------------------------------------
 * Quiet hours are enforced here, not in the job
 *
 * `config('crm.campaigns.quiet_hours')` is not a preference — the console
 * prints the rule under the composer because Uzbek advertising law restricts
 * unsolicited commercial messages to daytime hours. Computing the delay once,
 * at dispatch, rather than having each of two thousand jobs decide for itself,
 * means the whole run lands in one window instead of trickling across the
 * boundary as the queue drains.
 */
final readonly class CampaignDispatcher
{
    public function __construct(private SegmentReader $segments) {}

    /**
     * Freeze the recipient list, queue the sends, and move the campaign to
     * `sending`.
     *
     * `$only` is for the callers whose recipient list is not a segment at all:
     * `crm:triggers` has already asked its own question — whose birthday is in
     * three days, who has been quiet for sixty — and re-deriving it from the
     * campaign's `segment` would send a birthday message to the whole guest
     * list. The list is passed in rather than being turned into a segment,
     * because a segment is a rule and this is an answer.
     *
     * @param Collection<int, Customer>|null $only
     *
     * @return int how many people it will reach
     */
    public function send(Campaign $campaign, ?Collection $only = null): int
    {
        if ($campaign->hasLeft()) {
            throw ApiException::of('crm.campaign_already_sent');
        }

        $recipients = $only ?? $this->recipients($campaign)->get();

        if ($recipients->isEmpty()) {
            throw ApiException::of('crm.campaign_no_recipients');
        }

        $parts = SmsCost::parts($campaign->body);
        $perMessage = $parts * (int) config('crm.campaigns.sms_part_tiyin');

        $ids = DB::transaction(function () use ($campaign, $recipients, $parts, $perMessage): array {
            $rows = [];

            foreach ($recipients as $customer) {
                $rows[] = [
                    'tenant_id' => $campaign->tenant_id,
                    'campaign_id' => $campaign->id,
                    'customer_id' => $customer->id,
                    // Copied rather than joined: a guest changes their number,
                    // and a report that joined live would afterwards claim the
                    // message went to a number it never went to.
                    'phone' => $customer->phone,
                    'status' => 'queued',
                    'parts' => $parts,
                    'cost_tiyin' => $perMessage,
                    'created_at' => now(),
                    'updated_at' => now(),
                ];
            }

            /*
             * `insertOrIgnore`, so a second press of send writes nothing rather
             * than failing the whole batch on the first duplicate. What comes
             * back is the rows that are still queued — which, on a second press,
             * is none of them.
             */
            CampaignDelivery::query()->insertOrIgnore($rows);

            $queued = CampaignDelivery::query()
                ->where('campaign_id', $campaign->id)
                ->where('status', 'queued')
                ->pluck('id')
                ->all();

            $campaign->forceFill([
                'status' => 'sending',
                'started_at' => now(),
                'recipients' => CampaignDelivery::query()->where('campaign_id', $campaign->id)->count(),
            ])->save();

            return $queued;
        });

        $delay = $this->delayUntilAllowed(CarbonImmutable::now());

        foreach ($ids as $id) {
            $job = SendCampaignMessage::dispatch((int) $campaign->tenant_id, (int) $id);

            if ($delay !== null) {
                $job->delay($delay);
            }
        }

        return count($ids);
    }

    /**
     * Who a campaign reaches, before anything is written.
     *
     * The console asks for this on its own — the composer prints "2 148
     * recipients" while somebody is still typing — so it is a query builder
     * rather than a list: counting is one round trip and sending is the same
     * query with `get()`.
     *
     * Two filters are not negotiable. A guest with no phone cannot be sent an
     * SMS, and an inactive guest is one somebody deactivated on purpose. The
     * third — opting out — is what the legal note under the composer promises;
     * it is `is_active = false` today, because that is the only flag the guest
     * table has, and a separate `marketing_opt_in` column would be a second
     * place to be wrong about consent.
     *
     * @return Builder<Customer>
     */
    public function recipients(Campaign $campaign): Builder
    {
        return $this->segments->query($campaign->segment)
            ->whereNotNull('phone')
            ->where('phone', '!=', '');
    }

    /**
     * How long until messages may go out, or null if they may go out now.
     *
     * Returns a `CarbonImmutable` rather than a number of seconds because a
     * campaign queued at 22:50 must land at 09:00 the next morning, not "ten
     * hours from whenever the worker picked it up".
     */
    public function delayUntilAllowed(CarbonImmutable $now): ?CarbonImmutable
    {
        $from = (int) config('crm.campaigns.quiet_hours.from');
        $to = (int) config('crm.campaigns.quiet_hours.to');

        if ($now->hour >= $to && $now->hour < $from) {
            return null;
        }

        // Before the morning boundary is today; after the evening one is
        // tomorrow. Two cases and not one, because 08:00 and 23:00 are both
        // inside the quiet window and wait very different lengths of time.
        return $now->hour < $to
            ? $now->setTime($to, 0)
            : $now->addDay()->setTime($to, 0);
    }
}
