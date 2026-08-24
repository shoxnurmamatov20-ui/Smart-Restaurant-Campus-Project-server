<?php

declare(strict_types=1);

namespace Modules\Marketplace\Http\Controllers;

use App\Contracts\Finance\PaymentGateways;
use App\Http\Controllers\Controller;
use App\Support\Errors\ApiException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Modules\Marketplace\Http\Middleware\RequireConsumerToken;
use Modules\Marketplace\Models\Consumer;
use Modules\Marketplace\Models\MarketOrder;
use Modules\Marketplace\Models\Subscription;
use RuntimeException;

/**
 * Starting and stopping MyPOS Plus.
 *
 * ---------------------------------------------------------------------------
 * One month at a time, and the screen says so
 *
 * `App\Contracts\Finance\PaymentGateway` describes ONE-OFF invoices, because
 * that is what the three Uzbek providers expose without a signed recurring
 * mandate. So this platform charges a month, sets `renews_at` a month out, and
 * raises the next invoice when that date arrives. A card that is not presented
 * again simply lapses — nobody is charged silently, and nobody is charged twice.
 *
 * The mandate itself is genuinely somebody else's:
 * `TODO(integration): needs PAYME_KEY — see docs/GO-LIVE.md`.
 *
 * ---------------------------------------------------------------------------
 * Why the invoice is best-effort and the subscription is not
 *
 * A marketplace consumer has NO tenant. `finance.payment_invoices` carries
 * `tenant_id` behind a fail-closed row-level-security policy, so a ledger row
 * opened on this request would be refused by the policy — the same database
 * fact that keeps `Idempotency-Key` off every route in this block. A provider
 * driver needs that row before it can mint a checkout URL.
 *
 * So the call is attempted and its refusal is CAUGHT rather than propagated:
 * the guest who pressed the button gets their month, and the response says
 * plainly whether a checkout URL came back (`payment: "invoice"`) or whether
 * the platform has to collect it another way (`payment: "manual"`). The
 * alternative — refusing the subscription because the rails are not wired —
 * would be a button that never works on a screen that says it does.
 *
 * ---------------------------------------------------------------------------
 * `consumers.plus_until` is still the fast answer
 *
 * The checkout zeroes a delivery fee from it on every basket in the country;
 * making that a join against this table would be a join on the hottest path in
 * the module. The two are written together, inside one transaction, and
 * `plus_until` is always `renews_at`.
 */
final class ConsumerPlusController extends Controller
{
    /** Which rails a subscription may be charged on. Cash is not one: nobody collects a monthly fee at a door. */
    private const RAILS = ['click', 'payme', 'uzum'];

    public function __construct(private readonly PaymentGateways $gateways) {}

    /**
     * GET /api/v1/mp/plus — the subscription, as it stands today.
     *
     * Moved here from `ConsumerProfileController` so that the three things a
     * guest can do with a subscription — look at it, start it, stop it — are in
     * one class rather than split across two by an accident of history.
     */
    public function show(Request $request): JsonResponse
    {
        $consumer = RequireConsumerToken::of($request);

        return response()->json(['data' => $this->payload($consumer)]);
    }

    /** POST /api/v1/mp/plus/subscribe */
    public function subscribe(Request $request): JsonResponse
    {
        $consumer = RequireConsumerToken::of($request);

        if ($consumer->hasPlus()) {
            throw ApiException::of('marketplace.plus_already_active', meta: [
                'until' => $consumer->plus_until?->toIso8601String(),
            ]);
        }

        $rail = (string) $request->string('pay_rail', 'click');

        if (! in_array($rail, self::RAILS, true)) {
            throw ApiException::of('marketplace.plus_rail_unknown', field: 'pay_rail', meta: [
                'rails' => self::RAILS,
            ]);
        }

        $token = Str::lower(Str::random(32));
        $renews = now()->addMonthNoOverflow();

        $subscription = DB::transaction(function () use ($consumer, $rail, $token, $renews): Subscription {
            /*
             * Any earlier row is closed first. The partial unique index allows
             * exactly one `active` subscription per person, and a guest who
             * subscribed, cancelled and came back must not be refused by an
             * index rather than by a rule.
             */
            Subscription::query()
                ->where('consumer_id', $consumer->id)
                ->where('state', 'active')
                ->update(['state' => 'lapsed', 'cancelled_at' => now()]);

            $row = Subscription::create([
                'consumer_id' => $consumer->id,
                'plan' => Subscription::PLAN,
                'state' => 'active',
                'monthly_tiyin' => Consumer::PLUS_MONTHLY_TIYIN,
                'started_at' => now(),
                'renews_at' => $renews,
                'payment_token' => $token,
                'pay_rail' => $rail,
            ]);

            // The fast answer and the history, written together. `plus_until`
            // is always `renews_at` — two dates that can disagree is a guest
            // charged for a month they did not get.
            $consumer->forceFill(['plus_until' => $renews])->save();

            return $row;
        });

        return response()->json([
            'data' => [
                ...$this->payload($consumer->refresh()),
                'invoice' => $this->invoice($rail, $token, $subscription),
            ],
        ], 201);
    }

    /**
     * POST /api/v1/mp/plus/cancel
     *
     * The month already paid for is NOT taken away. `plus_until` stays where it
     * is and the subscription stops renewing — anything else would be charging
     * somebody for four weeks and giving them two, and a guest who cancels on
     * the second day would rationally never subscribe again.
     */
    public function cancel(Request $request): JsonResponse
    {
        $consumer = RequireConsumerToken::of($request);
        $subscription = $consumer->subscription();

        if ($subscription === null) {
            throw ApiException::of('marketplace.plus_not_active');
        }

        $subscription->forceFill([
            'state' => 'cancelled',
            'cancelled_at' => now(),
        ])->save();

        return response()->json(['data' => $this->payload($consumer->refresh())]);
    }

    /**
     * What the Plus sheet draws, whatever state it is in.
     *
     * @return array<string, mixed>
     */
    private function payload(Consumer $consumer): array
    {
        $subscription = $consumer->subscriptions()->first();

        return [
            'active' => $consumer->hasPlus(),
            'until' => $consumer->plus_until?->toIso8601String(),
            'monthly_tiyin' => Consumer::PLUS_MONTHLY_TIYIN,

            /*
             * What the subscription actually buys, as figures rather than
             * sentences — the client owns the wording, because a server that
             * sent the copy would be a second catalogue to keep in step.
             */
            'free_delivery' => true,
            'free_delivery_minimum_tiyin' => 0,
            'service_percent' => MarketOrder::DEFAULT_SERVICE_PERCENT,

            /*
             * The renewal is manual, and the screen has to say so rather than
             * imply a standing order that does not exist. See the class
             * docblock.
             */
            'renews_automatically' => false,

            'subscription' => $subscription === null ? null : [
                'state' => $subscription->state,
                'plan' => $subscription->plan,
                'started_at' => $subscription->started_at->toIso8601String(),
                'renews_at' => $subscription->renews_at->toIso8601String(),
                'cancelled_at' => $subscription->cancelled_at?->toIso8601String(),
                'pay_rail' => $subscription->pay_rail,
            ],
        ];
    }

    /**
     * Ask the provider for somewhere to pay, and take no for an answer.
     *
     * See the class docblock for why a refusal here is expected rather than
     * exceptional. The reason is reported and never swallowed silently: a
     * client showing "manual" is a client that can tell the guest their first
     * month will be invoiced rather than pretending a card was charged.
     *
     * @return array<string, mixed>
     */
    private function invoice(string $rail, string $token, Subscription $subscription): array
    {
        if (! $this->gateways->isEnabled($rail)) {
            return ['payment' => 'manual', 'reason' => 'provider_unconfigured', 'token' => $token, 'pay_url' => null];
        }

        try {
            $invoice = $this->gateways->driver($rail)->createInvoice(
                token: $token,
                amountTiyin: $subscription->monthly_tiyin,
                orderNumber: 'PLUS-'.$subscription->id,
            );

            return [
                'payment' => 'invoice',
                'provider' => $invoice->provider,
                'token' => $invoice->token,
                'pay_url' => $invoice->payUrl,
                'amount_tiyin' => $invoice->amount,
            ];
        } catch (RuntimeException $refusal) {
            return [
                'payment' => 'manual',
                'reason' => $refusal->getMessage(),
                'token' => $token,
                'pay_url' => null,
            ];
        }
    }
}
