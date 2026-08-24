<?php

declare(strict_types=1);

namespace App\Contracts\Staff;

/**
 * What the rest of the platform may ask about who is at work.
 *
 * One number on purpose. The POS idle screen prints "Smenada 8"; the KDS
 * header will want the same. Anything richer — names, roles, lateness — is
 * personnel data and stays behind the Staff module's own permissions.
 */
interface Roster
{
    /** People checked in and not yet checked out. Null branch = everywhere. */
    public function onShiftCount(?int $branchId = null): int;

    /**
     * What the hours worked in a window cost, in tiyin.
     *
     * One number, like the count above, and for the same reason: this is what
     * the labour share of revenue is computed from, and a labour share is a
     * ratio of two totals. Nobody outside Staff is handed a person, a rate or a
     * shift — a payslip is personnel data and stays behind this module's
     * permissions.
     *
     * It exists because `SalesInsights::summary()` has answered
     * `labour_cost_percent` as null since it was written, with a paragraph
     * saying exactly why: payroll lives in Staff, Analytics may not read Staff,
     * and *"deriving it from rostered hours × an assumed rate would put a
     * plausible number on a manager's screen that no payslip agrees with"*. The
     * answer to that is this method — the real figure, from the module that
     * owns it.
     *
     * ATTENDANCE, not the rota. A shift that was planned and not worked costs
     * nothing, and paying against a plan is how a labour percentage stops
     * matching the bank. An attendance still open is counted up to now, so the
     * figure moves during a shift rather than jumping when it ends.
     *
     * @param string $from `Y-m-d`, inclusive
     * @param string $to `Y-m-d`, inclusive
     */
    public function payrollBetween(string $from, string $to, ?int $branchId = null): int;

    /**
     * The same cost, split by the hour of the day it was worked.
     *
     * Twenty-four totals and nothing else — no names, no shifts, no rates. That
     * is the same line `payrollBetween()` draws and it is drawn again here on
     * purpose: an hourly labour curve is a ROTA question ("are we three people
     * too many at four in the afternoon"), and it is answerable without telling
     * the caller which three. A per-person breakdown is personnel data and stays
     * behind the Staff module's own permissions.
     *
     * Attendance again, not the rota, for the reason above: a shift that was
     * planned and not worked costs nothing, and an hourly chart built from the
     * plan would tell a manager to cut a shift nobody turned up for.
     *
     * An attendance spanning several hours is split across them by the minutes
     * actually inside each — a cook who worked 14:20 to 17:00 shows up in three
     * hours, not one — because the whole point of the curve is where the cost
     * SITS, and charging it all to the hour somebody clocked in draws a spike at
     * every shift start.
     *
     * @param string $from `Y-m-d`, inclusive
     * @param string $to `Y-m-d`, inclusive
     *
     * @return array<int, int> Hour of day (0–23) => cost in tiyin. Hours with
     *                         nobody at work are absent rather than zero.
     */
    public function payrollByHour(string $from, string $to, ?int $branchId = null): array;

    /**
     * Scheduled against actual, per person, for a window.
     *
     * The rota says who was meant to be here and for how long; attendance
     * says who came and when. The gap between them is what a labour report
     * is: a venue whose plan and whose floor differ by ten per cent every
     * week is either overstaffing or running people ragged, and neither
     * shows up in a payroll total.
     *
     * Minutes rather than hours because a shift is not a whole number of
     * them, and rounding per person before summing loses an hour a week
     * across a team of twenty.
     *
     * @return array<int, array{
     *     staff_member_id: int,
     *     name: string,
     *     position: string,
     *     scheduled_minutes: int,
     *     worked_minutes: int,
     *     late_count: int,
     *     shifts: int
     * }>
     */
    public function hoursBetween(string $from, string $to, ?int $branchId = null): array;
}
