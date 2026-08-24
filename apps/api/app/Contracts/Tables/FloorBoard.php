<?php

declare(strict_types=1);

namespace App\Contracts\Tables;

/**
 * What the rest of the platform may ask the floor plan.
 *
 * The POS idle screen shows "Band 14 · Bo'sh 18" before anyone has signed in,
 * and the manager's phone shows the same pair — neither belongs to the Tables
 * module, and modules do not import each other. This is the read they share.
 *
 * Deliberately a tally and not a list: a caller that needs the actual tables
 * is doing floor work and belongs behind /api/v1/tables, with its permission
 * checks. A count leaks nothing a guest standing in the doorway cannot see.
 */
interface FloorBoard
{
    /** Null branch means the whole restaurant, matching BelongsToBranch. */
    public function tally(?int $branchId = null): FloorTally;

    /**
     * Which table the laminated sticker belongs to, if any.
     *
     * A token and not an id, because a table's id never leaves the building: the
     * QR routes take `qr_token` — 22 random characters, minted once and glued to
     * a piece of furniture — precisely so that a small integer in a URL is not an
     * invitation to type the next one. See `RestaurantTable::newQrToken()`.
     *
     * The caller is the review form. A guest who scans the code at table 12 and
     * says the soup was cold must have that land ON table 12: the console's
     * feedback screen groups by table, and the whole point of the QR sticker is
     * that the guest never had to know which number they were sitting at. The
     * form posts what it was given, which is the token.
     *
     * An id back rather than a table, for the same reason `tally()` returns a
     * count: a caller holding the model is doing floor work and belongs behind
     * `/api/v1/tables` with its permission checks. An id it can already write
     * into its own column leaks nothing a person sitting down cannot read.
     *
     * Null for an unknown token, another restaurant's, or a deleted table. One
     * answer for all three: two would make this a way to ask whether a token is
     * live somewhere on the platform.
     */
    public function tableIdForToken(string $token): ?int;

    /**
     * The tables one waiter is holding.
     *
     * A list, on a contract whose docblock above says it deliberately is not
     * one — so the exception has to earn itself. Two things make this narrower
     * than "the floor plan":
     *
     *  - It is scoped to ONE person, and to the person the caller already has.
     *    `tally()` refuses to publish the room because a list of tables is the
     *    dining room; a list of the tables somebody claimed is that person's own
     *    section, which they are standing in.
     *  - It carries no bill, no covers and no guest. See {@see FloorSeat}: the
     *    widest sentence it can produce is "A-7 seats four and is taken".
     *
     * The caller is the waiter's home screen, which drew six invented tables
     * with running totals on them — sending somebody across the room to a table
     * that is not there and does not owe 318 000 so'm. The phone answers the
     * same question by asking `GET /v1/tables/tables` and joining it against
     * the waiter's open bills; the console cannot, because Analytics may not
     * read this module.
     *
     * Ordered by label, which is how a section is walked and how the design
     * draws it. Empty when this person holds nothing, which is the true state
     * at the start of a shift.
     *
     * @return list<FloorSeat>
     */
    public function section(int $userId, ?int $branchId = null): array;
}
