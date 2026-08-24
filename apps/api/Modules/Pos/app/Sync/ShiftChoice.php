<?php

declare(strict_types=1);

namespace Modules\Pos\Sync;

/**
 * Which drawer a queued payment lands in, once a person has decided.
 *
 * Only ever built by {@see ConflictResolution} answering
 * {@see ConflictKind::ShiftClosed}, and that restriction is the point. Every
 * other payment in the system finds its shift from the session holding the till,
 * because that is the drawer the notes physically went into. This exists for the
 * one case where the session is the wrong answer: a sale made offline at 23:50,
 * a Z taken at 00:10, and a queue that drained the next morning.
 *
 * Two shifts can carry that money and both readings are defensible, which is
 * exactly why a machine must not pick:
 *
 *   **Amend the sealed shift.** The notes are in that drawer. Its Z already
 *   counted them, as an overage nobody could explain, so its figures are the
 *   ones that are wrong. `$amendReason` is set and Finance writes through its
 *   amendment door with an audit line.
 *
 *   **Post to the shift open now.** Defensible when the cash never reached the
 *   old drawer at all — a card sale, or notes the cashier carried over. Here
 *   `$amendReason` is null and it is an ordinary capture.
 *
 * Getting it wrong in the first direction counts the same banknotes twice: once
 * as yesterday's surplus, once as today's takings. That is why the resolution
 * defaults to amending, and why the reason travels with the choice rather than
 * being invented downstream.
 */
final readonly class ShiftChoice
{
    /**
     * @param int $shiftId The drawer that will carry the money.
     * @param string|null $amendReason Set when `$shiftId` names a shift that has
     *                                 already been counted and sealed. Null means
     *                                 an ordinary capture into an open drawer.
     * @param int|null $decidedByUserId Who chose. Recorded on the amendment so an
     *                                  auditor reading it back has a name, not
     *                                  just a timestamp.
     */
    public function __construct(
        public int $shiftId,
        public ?string $amendReason = null,
        public ?int $decidedByUserId = null,
    ) {}

    /** Whether Finance has to go through its sealed-shift door for this. */
    public function amends(): bool
    {
        return $this->amendReason !== null;
    }
}
