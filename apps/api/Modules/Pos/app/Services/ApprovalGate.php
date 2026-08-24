<?php

declare(strict_types=1);

namespace Modules\Pos\Services;

use App\Models\User;
use App\Support\Events\EventBus;
use App\Support\Orders\BillTotals;
use App\Support\Settings\Policies;
use Illuminate\Support\Facades\DB;
use Modules\Pos\Events\ApprovalRequested;
use Modules\Pos\Models\PosApproval;
use Modules\Pos\Models\Terminal;
use Modules\Pos\Models\TerminalSession;
use RuntimeException;

/**
 * When a manager has to say yes.
 *
 * The rule this class encodes is not "cashiers cannot void lines" — they can,
 * and they must, because a guest changes their mind twenty times a service. The
 * rule is that the person who *asks* is never the person who *agrees*, above
 * whatever each role is trusted with unsupervised.
 *
 * Limits live on the terminal rather than on the role globally, because the
 * honest answer differs between a hotel bar and a takeaway counter. A role with
 * no entry is trusted with nothing, which is the safe direction to be wrong in.
 */
final class ApprovalGate
{
    public function __construct(
        private readonly EventBus $events,
        private readonly Policies $policies,
    ) {}

    /**
     * Actions that always need somebody else's signature, whatever the amount.
     *
     * @var array<int, string>
     */
    private const ALWAYS_APPROVED = ['reopen_bill', 'comp', 'refund'];

    /**
     * Does this person need an authorisation for this act?
     *
     * @param  int  $amount  Tiyin at stake — a 2% discount on a coffee is not a
     *                       2% discount on a wedding.
     * @param  bool  $alreadyFired  whether the food this concerns is already with
     *                              the kitchen. Only `void_line` reads it — see below.
     */
    public function requires(
        ?Terminal $terminal,
        User $actor,
        string $action,
        int $amount = 0,
        int $subtotal = 0,
        bool $alreadyFired = false,
    ): bool {
        // Holding the approving permission means you are the manager: you do not
        // queue behind yourself.
        if ($actor->can('pos.approve')) {
            return false;
        }

        if (in_array($action, self::ALWAYS_APPROVED, true)) {
            return true;
        }

        /*
         * Striking food the kitchen already has —
         * `policies.void_sent_needs_manager_pin`, on by default.
         *
         * Above the role ladder rather than inside it, because the amount is not
         * the question here. A cashier trusted with 5% off a bill is trusted
         * with a decision about MONEY; a line that has gone to the pass is a
         * decision about a plate that exists — somebody cooked it, stock left
         * the shelf, and the difference between "the guest changed their mind"
         * and "the guest ate it" is the oldest hole in restaurant cash control.
         *
         * So a small void that would have passed on percentage stops here, and
         * the manager who signs it is the one who decides which of those two it
         * was. The restaurant may switch the rule off; the ladder still applies
         * underneath.
         */
        if ($action === 'void_line' && $alreadyFired && $this->policies->on('void_sent_needs_manager_pin')) {
            return true;
        }

        $limitPercent = $this->limitFor($terminal, $actor);

        if ($limitPercent <= 0) {
            return true;
        }

        if ($subtotal <= 0) {
            // Nothing to measure against — err towards asking.
            return true;
        }

        return $this->percentOf($subtotal, $amount) > $limitPercent;
    }

    /**
     * What a percentage off this bill comes to, in tiyin.
     *
     * The percent picker's other half. A cashier taps "10%" and something has to
     * turn that into money; letting the tablet do it would put the arithmetic in
     * two places, and the two places are a screen and a receipt that a guest
     * reads side by side. Same reason `payable` is computed server-side.
     *
     * It lives beside {@see self::percentOf()} rather than in a helper of its
     * own because these two are one rule read in opposite directions, and the
     * only failure mode that matters is them disagreeing. Flooring both ways
     * keeps the round trip honest: a 5% pick can never come back measuring more
     * than 5%, so a role's ceiling cannot be crossed by a rounding artefact.
     *
     * Measured against the SUBTOTAL, not the total: BillTotals takes the
     * discount off before the service charge goes on, so a percentage of the
     * total would quietly be worth more than it says.
     */
    public function amountForPercent(int $subtotal, int $percent): int
    {
        // Delegated since the console grew a discount button of its own: two
        // modules now turn a percentage into money, and core is the only place
        // both may read. The rule and its reasoning live in BillTotals.
        return BillTotals::discountForPercent($subtotal, $percent);
    }

    /** What share of a bill an amount in tiyin represents, as whole percent. */
    public function percentOf(int $subtotal, int $amount): int
    {
        return BillTotals::percentOf($subtotal, $amount);
    }

    /**
     * The largest share of a bill this person may take off unsupervised.
     *
     * Answered as a share of the bill, whole percent, and the ceiling is what a
     * till draws its percent picker from — so it has to mean the same thing the
     * gate enforces, not merely what the terminal's settings say.
     *
     * Which is why `pos.approve` answers 100 rather than reading the ladder. A
     * branch manager has a row in `discount_limits` like everybody else, and
     * `requires()` never reaches it: holding the approving permission returns
     * false before the ladder is consulted, because you do not queue behind
     * yourself. Reporting that row instead would draw a picker missing the chips
     * the manager is allowed to press — and every chip it DID draw would work,
     * which is how a wrong ceiling survives a demonstration and shows up as
     * "the till will not let me" on a Friday night.
     */
    public function limitFor(?Terminal $terminal, User $actor): int
    {
        if ($actor->can('pos.approve')) {
            return 100;
        }

        /*
         * No terminal, no ladder — so nothing unsupervised.
         *
         * The discount limits live on the till, and a person asking from a
         * handset or from the back office is standing at none. Answering "zero"
         * rather than inventing a default is the same direction this class is
         * already wrong in on purpose: *"a role with no entry is trusted with
         * nothing, which is the safe direction to be wrong in"*. In practice it
         * costs nothing, because everybody who can reach those screens either
         * holds `pos.approve` — and returned 100 a line ago — or genuinely needs
         * a signature.
         */
        if ($terminal === null) {
            return 0;
        }

        $best = 0;

        foreach ($actor->getRoleNames() as $role) {
            $best = max($best, $terminal->discountLimitFor((string) $role));
        }

        return $best;
    }

    /**
     * Raise a request and put it in the manager's queue.
     */
    public function request(
        TerminalSession $session,
        string $action,
        string $reason,
        ?string $subjectType = null,
        ?int $subjectId = null,
        int $amount = 0,
    ): PosApproval {
        return $this->raise(
            requestedByUserId: (int) $session->user_id,
            action: $action,
            reason: $reason,
            subjectType: $subjectType,
            subjectId: $subjectId,
            amount: $amount,
            session: $session,
        );
    }

    /**
     * The same request, raised by a person who may not be at a till.
     *
     * A waiter with a handset apologising for a dessert, or a back-office screen
     * discounting a bill from the office. P9 moved ANSWERING out of the terminal
     * session and left asking behind — see the migration that made
     * `terminal_id` nullable for the whole argument.
     *
     * `$session` is still taken when there is one, because a request raised at a
     * till has to keep saying which till: the fraud ledger's most useful column
     * is "which drawer was this near".
     */
    public function raise(
        int $requestedByUserId,
        string $action,
        string $reason,
        ?string $subjectType = null,
        ?int $subjectId = null,
        int $amount = 0,
        ?TerminalSession $session = null,
    ): PosApproval {
        if (! in_array($action, PosApproval::ACTIONS, true)) {
            throw new RuntimeException("Noma'lum tasdiq turi: {$action}");
        }

        // One live request per thing being asked about.
        //
        // A cashier who taps Void and is refused taps it again — that is what
        // anyone does when a screen says no. Each tap used to write another
        // pending row, so the manager's queue filled with identical requests
        // for one line and approving the wrong one left the cashier still
        // blocked. The subject, action and amount together are what is being
        // asked; asking twice is the same question.
        $existing = PosApproval::query()
            /*
             * Keyed on the till when there is one and on the person when there
             * is not. A phone has no session, and two waiters asking about the
             * same bill are two questions rather than one repeated.
             */
            ->when(
                $session !== null,
                fn ($query) => $query->where('session_id', $session?->getKey()),
                fn ($query) => $query->whereNull('session_id')->where('requested_by_user_id', $requestedByUserId),
            )
            ->where('action', $action)
            ->where('subject_type', $subjectType)
            ->where('subject_id', $subjectId)
            ->where('amount', $amount > 0 ? $amount : null)
            ->whereIn('status', ['pending', 'approved'])
            ->where('expires_at', '>', now())
            ->orderByDesc('id')
            ->first();

        if ($existing !== null) {
            return $existing;
        }

        $approval = PosApproval::create([
            'terminal_id' => $session?->terminal_id,
            'session_id' => $session?->getKey(),
            /*
             * Named rather than left to `BelongsToBranch`, because the till's
             * own branch is the truth here and `X-Branch` is a header a client
             * may simply not send. Null falls back to the branch context, which
             * is what a request raised from a console or a handset has.
             */
            'branch_id' => $session?->terminal?->branch_id,
            'action' => $action,
            'subject_type' => $subjectType,
            'subject_id' => $subjectId,
            'amount' => $amount > 0 ? $amount : null,
            'reason' => $reason,
            'requested_by_user_id' => $requestedByUserId,
            'status' => 'pending',
            'requested_at' => now(),
            // `max(1, …)` rather than a bare cast: a config that failed to merge
            // would otherwise mint approvals that expired the instant they were
            // created, and a till whose every signature is already stale reads as
            // a broken approval flow rather than as a missing setting.
            'expires_at' => now()->addMinutes(max(1, (int) config('pos.approvals.ttl_minutes', 10))),
        ]);

        /*
         * Announced only for a genuinely new request — the early return above
         * hands back an existing one, and a cashier tapping Void four times must
         * not buzz the manager's phone four times for one line.
         *
         * This is what makes answering-from-anywhere usable rather than merely
         * permitted: the queue is now reachable from a phone, but a manager who
         * is not looking at it has to be told. What does the telling is not this
         * module's business — a bot, a push, a Reverb channel — so it goes on the
         * bus and the till's part ends here.
         */
        $this->events->publish(new ApprovalRequested($approval));

        return $approval;
    }

    /**
     * Spend an authorisation, or explain why it cannot be spent.
     *
     * Marking it used is part of the same transaction as the check, so two
     * concurrent requests cannot both redeem one signature.
     *
     * @throws RuntimeException
     */
    public function consume(
        int $approvalId,
        string $action,
        ?string $subjectType,
        ?int $subjectId,
        int $amount = 0,
    ): PosApproval {
        return DB::transaction(function () use ($approvalId, $action, $subjectType, $subjectId, $amount): PosApproval {
            /** @var PosApproval|null $approval */
            $approval = PosApproval::query()->lockForUpdate()->find($approvalId);

            if ($approval === null) {
                throw new RuntimeException('Tasdiq topilmadi.');
            }

            if ($approval->status === 'used') {
                throw new RuntimeException('Bu tasdiq allaqachon ishlatilgan.');
            }

            if ($approval->status !== 'approved') {
                throw new RuntimeException('Tasdiq hali berilmagan.');
            }

            if ($approval->expires_at !== null && $approval->expires_at->isPast()) {
                $approval->update(['status' => 'expired']);

                throw new RuntimeException('Tasdiq muddati o\'tgan — qaytadan so\'rang.');
            }

            if ($approval->action !== $action) {
                throw new RuntimeException('Bu tasdiq boshqa amal uchun berilgan.');
            }

            // Bound to its subject: a signature for one line must not be spent
            // on a different one.
            if ($subjectId !== null && ($approval->subject_id !== $subjectId || $approval->subject_type !== $subjectType)) {
                throw new RuntimeException('Bu tasdiq boshqa hisob yoki qator uchun berilgan.');
            }

            /*
             * And bound to its amount. This is the half that was missing.
             *
             * A manager approving a discount is agreeing to a figure, not to the
             * verb: the screen they answered on said "1 000 000 so'm off table 4",
             * and that sentence is the entire content of their decision. Without
             * this check the signature meant only "yes, a discount" — the till
             * could come back with 5 000 000 on the same bill, spend the same
             * approval, and the record would show the manager authorising an
             * amount they were never shown. Same action, same subject, ten times
             * the money, and nothing in the fraud ledger to distinguish it from an
             * honest one.
             *
             * A ceiling rather than an exact match: asking for less than was
             * granted is not a new question, and requiring equality would send a
             * cashier back to the manager because a guest changed their mind about
             * one coffee.
             *
             * An approval with NO amount cannot cover an act that has one. That
             * looks harsh — a `null` amount is what `request()` writes when the
             * till asks without naming a figure — but the manager saw no number,
             * so there is no ceiling to be under, and defaulting to "anything" is
             * exactly the hole above with an extra step.
             */
            if ($amount > 0 && $amount > (int) ($approval->amount ?? 0)) {
                throw new RuntimeException(sprintf(
                    'Bu tasdiq %s so\'m uchun berilgan, %s so\'m uchun emas.',
                    self::soum((int) ($approval->amount ?? 0)),
                    self::soum($amount),
                ));
            }

            $approval->markUsed();

            return $approval->refresh();
        });
    }

    /**
     * Tiyin as the so'm figure a cashier reads on the screen.
     *
     * Only ever for a message. Nothing computes with this — money stays whole
     * tiyin everywhere it matters, and the one place a fraction could appear is
     * a sentence explaining a refusal.
     */
    private static function soum(int $tiyin): string
    {
        return number_format($tiyin / 100, 0, ',', ' ');
    }
}
