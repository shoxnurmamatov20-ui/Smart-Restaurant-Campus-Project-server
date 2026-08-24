<?php

declare(strict_types=1);

namespace Modules\Kitchen\Printing;

use Illuminate\Database\Eloquent\Builder;
use Modules\Kitchen\Models\KitchenStation;
use Modules\Kitchen\Models\Printer;

/**
 * Which device a given piece of paper is supposed to come out of.
 *
 * Three rules, and the second is the one that keeps a new venue working:
 *
 *  1. A station prints to its own printer, if it has been given one.
 *  2. Otherwise it prints to the branch's default kitchen printer. Most
 *     restaurants have one machine at the pass and five stations pointing at
 *     it; requiring every station to be configured before anything prints means
 *     a venue that opens on a Friday night prints nothing at all.
 *  3. Failing both, nothing is printed and nothing is thrown. A missing printer
 *     is a hardware problem, and it must never be a reason a bill cannot be
 *     rung up.
 *
 * The branch is passed in rather than read from the request context, and that
 * matters: a ticket knows which venue it belongs to, and the request may not —
 * an owner reading across the whole estate has no branch set, and a docket
 * routed by *their* context would print in whichever venue answered first.
 */
final class PrinterRouter
{
    /** Where the grill's dockets go. */
    public function forStation(string $stationCode, ?int $branchId): ?Printer
    {
        $station = KitchenStation::query()
            ->withoutGlobalScope('branch')
            ->where('code', $stationCode)
            ->when($branchId !== null, fn (Builder $q): Builder => $q->where('branch_id', $branchId))
            ->first();

        if ($station?->printer_id !== null) {
            $named = $this->find((int) $station->printer_id);

            // A station pointed at a printer somebody has since deactivated
            // falls through to the default rather than printing nowhere. The
            // deactivation is usually why the default exists.
            if ($named !== null) {
                return $named;
            }
        }

        return $this->defaultFor('kitchen', $branchId);
    }

    /** Where a guest's receipt goes. */
    public function forReceipt(?int $branchId, ?int $printerId = null): ?Printer
    {
        return ($printerId !== null ? $this->find($printerId) : null)
            ?? $this->defaultFor('receipt', $branchId);
    }

    /**
     * Which printer has the drawer wired to it.
     *
     * A cash drawer is not a device the platform talks to — it is a solenoid on
     * pin 2 of a receipt printer. So "open the drawer" resolves to "find the
     * printer that can", and a till whose receipt printer is not the one with
     * the drawer under it is a real configuration, which is why `opens_drawer`
     * is asked for rather than assumed.
     */
    public function forDrawer(?int $branchId, ?int $printerId = null): ?Printer
    {
        if ($printerId !== null) {
            $named = $this->find($printerId);

            if ($named !== null && $named->opens_drawer) {
                return $named;
            }
        }

        return $this->query($branchId)
            ->where('opens_drawer', true)
            ->orderByDesc('is_default')
            ->orderBy('id')
            ->first();
    }

    /** The venue's default printer for a role, or its only one. */
    public function defaultFor(string $role, ?int $branchId): ?Printer
    {
        return $this->query($branchId)
            ->ofRole($role)
            ->orderByDesc('is_default')
            ->orderBy('id')
            ->first();
    }

    private function find(int $printerId): ?Printer
    {
        return Printer::query()->withoutGlobalScope('branch')->active()->find($printerId);
    }

    /** @return Builder<Printer> */
    private function query(?int $branchId): Builder
    {
        return Printer::query()
            // The branch is named explicitly on every call, so the ambient
            // scope would only ever narrow it further — and wrongly, whenever
            // the request's branch is not the ticket's.
            ->withoutGlobalScope('branch')
            ->active()
            ->when($branchId !== null, fn (Builder $q): Builder => $q->where('branch_id', $branchId));
    }
}
