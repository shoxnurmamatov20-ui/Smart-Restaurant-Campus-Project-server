<?php

declare(strict_types=1);

namespace App\Contracts\Finance;

use RuntimeException;

/**
 * Which online providers this installation can actually take money through.
 *
 * The registry rather than the gateway, because every caller outside Finance
 * asks the same two questions in the same order — "what may I offer?" and "give
 * me that one" — and a caller that resolved a driver out of the container
 * directly would be able to offer a provider whose keys are missing.
 *
 * @see PaymentGateway for the driver itself.
 */
interface PaymentGateways
{
    /**
     * The providers a guest may be offered, in the order they should be drawn.
     *
     * Only the ones whose credentials are present. A checkout that lists a
     * provider it cannot complete fails after the guest has committed, which is
     * the single worst moment in the flow to discover a configuration problem.
     *
     * @return array<int, PaymentGateway>
     */
    public function enabled(): array;

    /**
     * Every provider this build knows about, configured or not.
     *
     * For the console, and only for the console: an owner asking "why is Payme
     * not on my site" needs to see it listed and switched off. A guest surface
     * must use {@see enabled()} — the difference between the two lists is the
     * whole reason both exist.
     *
     * @return array<int, PaymentGateway>
     */
    public function all(): array;

    /**
     * One provider by name.
     *
     * @throws RuntimeException when the name is unknown to this build. Not when
     *                          it is merely unconfigured — a callback from a
     *                          provider whose keys were just rotated out still
     *                          has to be answered in that provider's own
     *                          protocol, and refusing to construct the driver
     *                          would answer it with an HTML error page.
     */
    public function driver(string $provider): PaymentGateway;

    /** Is this name both known and configured. */
    public function isEnabled(string $provider): bool;
}
