<?php

declare(strict_types=1);

namespace Modules\Finance\Services;

use App\Support\Errors\ApiException;
use App\Support\Tenancy\TenantContext;
use Illuminate\Support\Carbon;
use Modules\Finance\Models\AccountingPeriod;

/**
 * The half of "close the month" that is actually the feature.
 *
 * A row saying `status = closed` changes a label. This is what makes it mean
 * something: every money write in this module asks here first, and a row whose
 * trading day falls inside a closed month is refused.
 *
 * ---------------------------------------------------------------------------
 * Why a service and an observer rather than a check in each controller
 *
 * Because the controllers are not where the money is written. `POST
 * /finance/expenses` is one door; the others are `TillLedger::capture()` from a
 * terminal, `recordCashOut()` from a collection, `refundPayment()` from a
 * refund, the offline queue draining a night's sales, and
 * `amendClosedShift()` writing into a sealed drawer. A check per controller
 * would have covered two of those six, and the four it missed are the ones that
 * run unattended.
 *
 * So the check sits on the model, and the rule is a property of the row rather
 * than of the door it came through — see `FinanceServiceProvider::observers()`.
 *
 * ---------------------------------------------------------------------------
 * Cached for the length of one request, and only that long
 *
 * The lock is consulted on every payment row, and a night's drain is hundreds.
 * Caching across requests would be worse than not caching: an accountant closes
 * January and the till keeps accepting January rows until a cache expires,
 * which is precisely the window this exists to shut.
 */
final class PeriodLock
{
    /**
     * `YYYY-MM` → is that month closed for the tenant in `$this->tenantId`.
     *
     * @var array<string, bool>
     */
    private array $answers = [];

    private ?int $tenantId = null;

    public function __construct(private readonly TenantContext $tenants) {}

    /**
     * Is this trading day inside a month somebody has signed off?
     *
     * A date with no resolved tenant answers false. That is the safe direction
     * and not a hole: without a tenant every read on this platform returns no
     * rows anyway (row-level security fails closed), so the honest answer to
     * "is this restaurant's January shut" is that we do not know which
     * restaurant is being asked about — and refusing every console-less write
     * on the platform, migrations and seeders included, would be a worse
     * failure than allowing one.
     *
     * @param string|Carbon|null $businessDate The trading day, `Y-m-d`
     */
    public function isClosed(string|Carbon|null $businessDate): bool
    {
        $tenantId = $this->tenants->id();

        if ($tenantId === null || $businessDate === null) {
            return false;
        }

        // A tenant switch inside one process — the queue worker handling a
        // second restaurant's job — must not read the first one's answers.
        if ($this->tenantId !== $tenantId) {
            $this->tenantId = $tenantId;
            $this->answers = [];
        }

        $month = $businessDate instanceof Carbon
            ? $businessDate->format('Y-m')
            : substr($businessDate, 0, 7);

        if (! array_key_exists($month, $this->answers)) {
            $this->answers[$month] = AccountingPeriod::query()
                ->closed()
                ->where('period', $month)
                ->exists();
        }

        return $this->answers[$month];
    }

    /**
     * Refuse the write, naming the month.
     *
     * The month is in the message rather than only in `meta` because the person
     * reading it is entering an invoice and has to be told which date they got
     * wrong — "the period is closed" alone sends them looking at today's date,
     * which is not the one that was refused.
     *
     * @param string $what What was being written, for the audit trail
     *
     * @throws ApiException
     */
    public function assertOpen(string|Carbon|null $businessDate, string $what): void
    {
        if (! $this->isClosed($businessDate)) {
            return;
        }

        $month = $businessDate instanceof Carbon
            ? $businessDate->format('Y-m')
            : substr((string) $businessDate, 0, 7);

        throw ApiException::detailed(
            'finance.period_closed',
            "{$month} davri yopilgan — bu oyga yangi yozuv kiritib bo'lmaydi.",
            "Период {$month} закрыт — новые записи в этот месяц невозможны.",
            "The {$month} period is closed — nothing new can be booked into it.",
            meta: ['period' => $month, 'attempted' => $what],
        );
    }

    /** Forget what was cached. For tests, and for a close that has just run. */
    public function forget(): void
    {
        $this->answers = [];
    }
}
