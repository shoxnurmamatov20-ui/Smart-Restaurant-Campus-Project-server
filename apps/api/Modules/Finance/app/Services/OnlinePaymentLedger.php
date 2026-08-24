<?php

declare(strict_types=1);

namespace Modules\Finance\Services;

use App\Contracts\Finance\PaymentResult;
use App\Contracts\Finance\Tender;
use App\Contracts\Orders\Bill;
use App\Contracts\Orders\BillRegistry;
use App\Support\Orders\OrderState;
use App\Support\Tenancy\TenantContext;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Modules\Finance\Models\CashShift;
use Modules\Finance\Models\Payment;
use Modules\Finance\Models\PaymentInvoice;
use RuntimeException;
use Throwable;

/**
 * The state machine behind an online payment, kept out of the drivers.
 *
 * A driver knows one protocol — JSON-RPC and a base64 path for Payme, an MD5
 * `sign_string` for Click — and nothing else. Everything that touches money
 * lives here, in one class, for the reason that decides most of this module's
 * shape: "what did we take today" must have exactly one answer, and four
 * drivers each writing their own payment row would guarantee four.
 *
 * ---------------------------------------------------------------------------
 * Why settlement is idempotent by row lock and not by header
 *
 * Every other write on this platform carries an `Idempotency-Key`. A payment
 * provider does not send one — it is not our client, it is a bank retrying
 * until it gets a clean answer — so the guarantee has to come from the data.
 * `settle()` takes the invoice row `FOR UPDATE`, checks the state it is already
 * in, and returns the existing payment id when there is one. Payme retrying
 * PerformTransaction six times produces one tender.
 *
 * ---------------------------------------------------------------------------
 * Which drawer online money lands in
 *
 * None, and that is the point: nobody hands over notes, so no drawer opens. But
 * the shift's report still has to show it, because an owner reading the evening
 * needs the card and the app money beside the cash. So the tender is captured
 * into the branch's open shift when there is one — `computeExpectedCash()`
 * counts only cash, so a `payme` row cannot move the expected drawer — and into
 * no shift at all when there is not, which is the ordinary case for a delivery
 * paid at 03:00. Both are recorded; neither invents a drawer.
 */
final class OnlinePaymentLedger
{
    public function __construct(
        private readonly TenantContext $tenants,
        private readonly EloquentTillLedger $till,
        /*
         * The bill, through the contract and never the model.
         *
         * `ModuleBoundaryTest` refuses a `use Modules\Orders\...` here and it is
         * right to: Finance must keep working when Orders is switched off, and
         * `UnavailableBillRegistry` answering null is exactly the behaviour a
         * venue with no Orders module should get — the money is recorded, the
         * bill it belongs to simply is not this platform's to close.
         */
        private readonly BillRegistry $bills,
    ) {}

    /**
     * Start an attempt. Nothing has been asked of a provider yet.
     *
     * The row exists before the driver is spoken to, and the order matters: the
     * token in it is what a return URL and a status poll carry, so a guest whose
     * browser dies during the redirect still has a handle to come back with. A
     * row minted after the provider answered would leave those guests with
     * nothing to poll.
     */
    public function open(
        string $provider,
        int $amountTiyin,
        ?int $orderId,
        ?string $orderNumber,
        ?int $branchId = null,
        ?string $returnUrl = null,
    ): PaymentInvoice {
        if ($amountTiyin <= 0) {
            throw new RuntimeException('To\'lov summasi noldan katta bo\'lishi kerak.');
        }

        return PaymentInvoice::create([
            'tenant_id' => $this->tenants->tenant()?->getKey(),
            'branch_id' => $branchId,
            'token' => PaymentInvoice::mintToken(),
            'provider' => $provider,
            'order_id' => $orderId,
            'order_number' => $orderNumber,
            'amount' => $amountTiyin,
            'state' => PaymentResult::PENDING,
            // Overwritten by `attach()` the moment the driver names one. Never
            // left null: the column is what a screen redirects to, and a null
            // there is a button that goes nowhere.
            'pay_url' => '',
            'return_url' => $returnUrl,
        ]);
    }

    /** Record where the driver decided to send the guest. */
    public function attach(PaymentInvoice $invoice, string $payUrl, ?string $providerInvoiceId = null): PaymentInvoice
    {
        $invoice->forceFill(array_filter([
            'pay_url' => $payUrl,
            'provider_invoice_id' => $providerInvoiceId,
        ], static fn (mixed $value): bool => $value !== null))->save();

        return $invoice->refresh();
    }

    public function byToken(string $token): ?PaymentInvoice
    {
        return PaymentInvoice::query()->where('token', $token)->first();
    }

    /**
     * The invoice a provider is talking about.
     *
     * Two ways in, because the providers differ: Payme quotes its own
     * transaction id on every call after the first, while Click quotes the
     * `merchant_trans_id` it was handed — which is our token. Looking up by both
     * is what lets one ledger serve both without either driver learning about
     * the other's habits.
     */
    public function byProviderTransaction(string $provider, string $transactionId): ?PaymentInvoice
    {
        return PaymentInvoice::query()
            ->where('provider', $provider)
            ->where('provider_invoice_id', $transactionId)
            ->first();
    }

    /**
     * The provider has created its transaction but not yet moved any money.
     *
     * Payme's CreateTransaction, and the half of the flow that is invisible on
     * every other rail. Twelve hours can pass between this and the settlement,
     * and a guest staring at a "waiting" screen is entitled to know which of the
     * two states it is in.
     */
    public function reserve(PaymentInvoice $invoice, string $providerInvoiceId): PaymentInvoice
    {
        return DB::transaction(function () use ($invoice, $providerInvoiceId): PaymentInvoice {
            /** @var PaymentInvoice $fresh */
            $fresh = PaymentInvoice::query()->lockForUpdate()->findOrFail($invoice->getKey());

            if ($fresh->state !== PaymentResult::PENDING) {
                return $fresh;
            }

            $fresh->forceFill([
                'provider_invoice_id' => $providerInvoiceId,
                'reserved_at' => $fresh->reserved_at ?? now(),
            ])->save();

            return $fresh;
        });
    }

    /**
     * The money is with the provider. Bank it, and close the bill behind it.
     *
     * Both halves in one transaction, because the state between them — money
     * recorded, bill still open — is the one a guest can exploit by paying once
     * and ordering twice, and the one an auditor cannot explain.
     *
     * Returns the invoice as it now stands. Calling this on an invoice that is
     * already paid is a no-op that returns the same row: that is not
     * defensiveness, it is the contract, because a provider retrying a callback
     * is the normal case rather than the exception.
     */
    public function settle(PaymentInvoice $invoice, ?string $providerInvoiceId = null): PaymentInvoice
    {
        return DB::transaction(function () use ($invoice, $providerInvoiceId): PaymentInvoice {
            /** @var PaymentInvoice $fresh */
            $fresh = PaymentInvoice::query()->lockForUpdate()->findOrFail($invoice->getKey());

            if ($fresh->state === PaymentResult::PAID) {
                // Already banked. The second callback is answered with the same
                // truth as the first and nothing is written twice.
                return $fresh;
            }

            if ($providerInvoiceId !== null) {
                $fresh->provider_invoice_id = $providerInvoiceId;
            }

            $paymentId = $this->bank($fresh);

            $fresh->forceFill([
                'state' => PaymentResult::PAID,
                'paid_at' => now(),
                'payment_id' => $paymentId,
                'last_error' => null,
            ])->save();

            $this->closeBillBehind($fresh);

            return $fresh;
        });
    }

    /** The guest walked away, or the provider reversed its own transaction. */
    public function cancel(PaymentInvoice $invoice, string $reason): PaymentInvoice
    {
        return DB::transaction(function () use ($invoice, $reason): PaymentInvoice {
            /** @var PaymentInvoice $fresh */
            $fresh = PaymentInvoice::query()->lockForUpdate()->findOrFail($invoice->getKey());

            /*
             * A paid invoice is not cancelled here, and the refusal is the
             * important line.
             *
             * Payme's CancelTransaction arrives for money that has already been
             * performed, and treating it as a state flip would leave the payment
             * row captured, the bill closed and the invoice saying `cancelled` —
             * three records, two of them wrong. Reversing a banked payment is
             * `TillLedger::refundPayment()`, which moves the money AND the bill,
             * and it is a decision with a drawer behind it rather than a column
             * update.
             */
            if ($fresh->state === PaymentResult::PAID) {
                throw new RuntimeException(
                    'To\'langan hisobni bekor qilib bo\'lmaydi — qaytarish (refund) orqali yuriting.'
                );
            }

            $fresh->forceFill([
                'state' => PaymentResult::CANCELLED,
                'cancelled_at' => now(),
                'cancel_reason' => mb_substr($reason, 0, 255),
            ])->save();

            return $fresh;
        });
    }

    /** The provider refused: wrong amount, unknown order, a signature that did not check out. */
    public function fail(PaymentInvoice $invoice, string $error): PaymentInvoice
    {
        $invoice->forceFill([
            'state' => PaymentResult::FAILED,
            'last_error' => mb_substr($error, 0, 255),
        ])->save();

        return $invoice->refresh();
    }

    // ============ Internals ============

    /**
     * Write the tender, and say which payment row it became.
     *
     * The method on the row is the provider's own name — `payme`, `click`,
     * `uzum` — and not a generic `online`, because they cost different amounts:
     * `App\Support\Finance\AcquirerFees` charges 1.5% for each of the three and
     * an owner reconciling a settlement statement is reconciling one provider at
     * a time. A single `online` method would fold three statements into one
     * figure nobody could take apart.
     */
    private function bank(PaymentInvoice $invoice): int
    {
        $tender = new Tender(
            method: $this->methodFor($invoice->provider),
            amount: $invoice->amount,
            reference: $invoice->tenderReference(),
        );

        $shiftId = $this->openShiftAt($invoice->branch_id);

        if ($shiftId !== null) {
            return $this->till->capture(
                shiftId: $shiftId,
                orderId: (int) ($invoice->order_id ?? 0),
                orderNumber: (string) ($invoice->order_number ?? $invoice->token),
                tender: $tender,
            );
        }

        return $this->till->captureWithoutDrawer(
            orderId: $invoice->order_id,
            orderNumber: (string) ($invoice->order_number ?? $invoice->token),
            tender: $tender,
            branchId: $invoice->branch_id,
        );
    }

    /**
     * The provider's name as a payment method, or `card` when it is not one.
     *
     * `sandbox` is the case that matters. It is not a real rail and it must
     * never write a method that looks like one: a developer's laptop filling a
     * demo database with `payme` rows would put invented money in a mix chart
     * beside real money. `card` is the platform's own pre-P7 generic and carries
     * a deliberately zero fee, which is the honest shape for a payment nobody
     * took.
     */
    private function methodFor(string $provider): string
    {
        return in_array($provider, Payment::METHODS, true) ? $provider : 'card';
    }

    /** The till standing open at this venue, if one is. */
    private function openShiftAt(?int $branchId): ?int
    {
        $id = CashShift::query()
            ->where('status', 'open')
            ->when($branchId !== null, fn ($query) => $query->where('branch_id', $branchId))
            ->orderByDesc('id')
            ->value('id');

        return $id === null ? null : (int) $id;
    }

    /**
     * Move the bill behind this money, if there is one and it is still open.
     *
     * Two different bills arrive here and they need opposite things.
     *
     * A bill a waiter presented is at `topay` (or `served`, or `handed`): the
     * meal happened and the money ends it, so it closes. A guest's order paid
     * from a phone is at `draft`, and the money does not end it — it STARTS it.
     * `PublicOrderController` holds an online order back with no docket, no pass
     * and no station until the payment lands, because a kitchen that cooks
     * before the money does pays for every abandoned checkout. Closing that one
     * would settle a bill nobody has cooked and hand the guest a tracking screen
     * with every rung already behind it.
     *
     * So the ladder decides rather than this class: `markPrepaid()` fires a
     * draft and leaves anything further along where it is, and `close()` keeps
     * doing what it always did. Both set `payment_state` — the second axis the
     * tracking screen reads — because a settled bill still saying `pending` is
     * a guest being asked to pay twice.
     *
     * Swallowed rather than propagated, and this is the one place in the class
     * where that is right. The money has arrived and the provider is holding it;
     * throwing here would roll back the payment row and answer the bank "we did
     * not get that", which is how a guest ends up charged for a meal the
     * restaurant has no record of. A bill left open is a visible problem a
     * manager can close; a payment that vanished is not.
     */
    private function closeBillBehind(PaymentInvoice $invoice): void
    {
        if ($invoice->order_id === null) {
            return;
        }

        try {
            $bill = $this->bills->find($invoice->order_id);

            if (! $bill instanceof Bill || ! $bill->isOpen()) {
                return;
            }

            if ($bill->status === OrderState::Draft->value) {
                $this->bills->markPrepaid($invoice->order_id);

                return;
            }

            $this->bills->close($invoice->order_id);
        } catch (Throwable $failure) {
            Log::error('finance.online_payment.bill_not_closed', [
                'invoice_id' => $invoice->getKey(),
                'order_id' => $invoice->order_id,
                'error' => $failure->getMessage(),
            ]);
        }
    }
}
