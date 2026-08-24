<?php

declare(strict_types=1);

namespace Modules\Finance\Http\Controllers;

use App\Contracts\Finance\PaymentGateway;
use App\Contracts\Finance\PaymentGateways;
use App\Http\Controllers\Controller;
use App\Support\Finance\AcquirerFees;
use Illuminate\Http\JsonResponse;

/**
 * Which online rails this restaurant is set up on — the console's view.
 *
 * Deliberately a different answer from the guest's
 * ({@see PublicPaymentController::providers()}), and the difference is the whole
 * reason both exist. A guest is shown only what they can actually pay through: a
 * button for a provider with no keys fails after they have committed, which is
 * the worst moment in the flow to discover a configuration problem.
 *
 * An owner needs the opposite. "Why is Payme not on my site" is answered by
 * seeing Payme listed and switched off — a list that silently omitted it would
 * send them looking for a bug in the website instead of a missing key in an
 * environment file.
 *
 * `finance.view` rather than `finance.manage`: nothing here is a secret and
 * nothing here can be changed. The credentials themselves never appear — only
 * whether each one is present, which is the fact somebody is asking about.
 */
final class PaymentProviderController extends Controller
{
    public function __construct(private readonly PaymentGateways $gateways) {}

    public function index(): JsonResponse
    {
        return response()->json([
            'data' => array_map(
                static fn (PaymentGateway $gateway): array => [
                    'id' => $gateway->name(),
                    'available' => $gateway->available(),
                    /*
                     * What the acquirer keeps, in basis points.
                     *
                     * Here because it is the number an owner comparing two rails
                     * actually wants, and because it is already snapshotted onto
                     * every payment row — a settings screen quoting a different
                     * figure from the one the ledger charges would be the drift
                     * this project keeps finding in its money paths.
                     */
                    'fee_bps' => AcquirerFees::bps($gateway->name()),
                ],
                $this->gateways->all(),
            ),
        ]);
    }
}
