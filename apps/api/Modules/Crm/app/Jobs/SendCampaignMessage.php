<?php

declare(strict_types=1);

namespace Modules\Crm\Jobs;

use App\Contracts\Messaging\SmsSender;
use App\Support\Tenancy\DatabaseTenancy;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;
use Modules\Crm\Models\Campaign;
use Modules\Crm\Models\CampaignDelivery;

/**
 * One message to one phone.
 *
 * A job per recipient rather than one job for the campaign, and the reason is
 * the failure mode: a single job that walked two thousand numbers and died on
 * number eight hundred would either resend eight hundred paid messages on
 * retry, or have to keep its own place in a list — which is exactly what the
 * delivery rows already are.
 *
 * ---------------------------------------------------------------------------
 * Ids, not models
 *
 * `SerializesModels` re-resolves an Eloquent model on the worker, and a worker
 * holds no tenancy: row-level security answers zero rows and the job dies with
 * ModelNotFoundException before it can record why. The same reasoning as
 * `ExportTenantData`, and the same fix — an integer survives the queue and is
 * resolved inside `focusDuring`.
 *
 * ---------------------------------------------------------------------------
 * `tries = 1`
 *
 * A refusal from the gateway is an answer, not a fault — no balance, a number
 * not on the allowed list — and `SmsSender` promises never to throw for one.
 * What is left to retry is a network that was down, and retrying THAT risks the
 * one thing that must not happen: a message delivered twice. It costs money and
 * it reads to a guest as a restaurant that cannot count. A campaign with
 * failures shows them on its own row, with the gateway's reason, for somebody
 * to decide about.
 */
final class SendCampaignMessage implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    public int $tries = 1;

    public int $timeout = 30;

    public function __construct(
        private readonly int $tenantId,
        private readonly int $deliveryId,
    ) {}

    public function handle(DatabaseTenancy $tenancy, SmsSender $sms): void
    {
        $tenancy->focusDuring($this->tenantId, function () use ($sms): void {
            $delivery = CampaignDelivery::query()->find($this->deliveryId);

            // Queued, then the campaign was deleted, or a second worker got
            // here first. Both are "nothing to do" rather than errors.
            if ($delivery === null || $delivery->status !== 'queued') {
                return;
            }

            $campaign = Campaign::query()->find($delivery->campaign_id);

            if ($campaign === null) {
                return;
            }

            $answer = $sms->send($delivery->phone, $campaign->body);

            $delivery->forceFill([
                'status' => $answer->accepted ? 'sent' : 'failed',
                'reference' => $answer->reference,
                // Never the body: a message a guest received is theirs, and a
                // failure reason column is read by everybody with console access.
                'reason' => $answer->reason,
                'sent_at' => $answer->accepted ? now() : null,
                // A refused message is not billed, so the row's own cost goes to
                // zero — otherwise the campaign's total would charge for the
                // messages that never left.
                'cost_tiyin' => $answer->accepted ? $delivery->cost_tiyin : 0,
            ])->save();

            $campaign->recordDelivery($answer->accepted, $answer->accepted ? $delivery->cost_tiyin : 0);

            $this->closeIfFinished($campaign);
        });
    }

    /**
     * The last job through the door turns the lights off.
     *
     * Checked per job rather than by a separate sweep because there is no
     * moment a sweep could run at: a campaign of two thousand finishes whenever
     * the queue drains, which depends on the gateway. Counting the rows still
     * queued is one indexed count and it is right the instant it is true.
     */
    private function closeIfFinished(Campaign $campaign): void
    {
        $stillQueued = CampaignDelivery::query()
            ->where('campaign_id', $campaign->id)
            ->where('status', 'queued')
            ->exists();

        if ($stillQueued) {
            return;
        }

        $campaign->refresh();

        $campaign->forceFill([
            // Every single message refused is a campaign that failed, not one
            // that was sent. The distinction is what a marketer needs to see
            // before they conclude nobody reads their SMS.
            'status' => $campaign->delivered > 0 ? 'sent' : 'failed',
            'finished_at' => now(),
        ])->save();
    }
}
