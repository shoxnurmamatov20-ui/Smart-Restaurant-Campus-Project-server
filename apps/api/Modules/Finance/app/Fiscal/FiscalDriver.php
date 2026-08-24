<?php

declare(strict_types=1);

namespace Modules\Finance\Fiscal;

/**
 * The one way this module talks to a fiscal provider.
 *
 * Uzbekistan has several OFDs and a restaurant uses exactly one, chosen by its
 * accountant and changed roughly never. The port exists anyway, for two reasons
 * that have nothing to do with switching provider: it is what lets the queue,
 * the retry window and the correction flow be tested without a government
 * endpoint, and it is what keeps a provider's field names out of the fifteen
 * places that would otherwise learn them.
 *
 * ---------------------------------------------------------------------------
 * The two failures, and why they are different exceptions
 *
 * A driver refuses in one of two ways and the difference decides what happens
 * next. {@see FiscalUnavailable} means "not now" — the network, the OFD, a
 * timeout — and the document goes back in the queue with a longer backoff.
 * {@see FiscalRejected} means "not this document" — a malformed total, a
 * classification code the authority does not know — and retrying it every ten
 * minutes for a day would produce a thousand identical refusals and still miss
 * the window.
 *
 * A driver that reported everything as unavailable would turn every mistake
 * into an expired receipt. One that reported everything as rejected would turn
 * a five-second outage into a permanent liability. Getting this right is most
 * of what writing a driver is.
 */
interface FiscalDriver
{
    /** Short, stable, stored on the row: `logging`, `soliq`, whichever OFD. */
    public function name(): string;

    /**
     * Is there anything on the other end.
     *
     * The plan calls it the connection probe and gives it a specific shape: a
     * fiscal module number of at least eight digits, and an answer from the tax
     * service. Both halves matter — a configured module number with nothing
     * answering is a restaurant that believes it is filing receipts, and an
     * answering endpoint with no module number is one that cannot.
     */
    public function probe(): FiscalProbe;

    /**
     * File one document and come back with what the authority stamped on it.
     *
     * @throws FiscalUnavailable when the failure is the connection — retry later
     * @throws FiscalRejected when the failure is the document — retrying cannot help
     */
    public function register(FiscalDocument $document): FiscalMarks;
}
