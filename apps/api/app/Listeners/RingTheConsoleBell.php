<?php

declare(strict_types=1);

namespace App\Listeners;

use App\Models\User;
use App\Notifications\BillVoidedAtTill;
use App\Notifications\CashDrawerVariance;
use App\Notifications\ConsoleNotice;
use App\Notifications\FiscalReceiptUndeclared;
use App\Support\Events\ProcessedEvents;
use App\Support\Events\ReceivedEvent;
use Illuminate\Database\Eloquent\Collection;

/**
 * Domain events the console's bell should ring for.
 *
 * Core rather than a module listener, and by name rather than by class: this
 * subscribes to `finance.shift_variance_flagged` as a STRING and receives a
 * {@see ReceivedEvent}, so nothing here imports Finance or Pos and the
 * decoupling the outbox buys is not given straight back. That is also what
 * makes the file readable as a policy — the whole answer to "what is worth
 * interrupting somebody for" is the table below.
 *
 * ---------------------------------------------------------------------------
 * Three of twelve, and the nine are a decision
 *
 * The platform publishes twelve domain events. Nine of them are deliberately
 * not here, and `finance.shift_closed` is the clearest case: every till, every
 * evening, five venues — fifty rows a week that nobody can act on. A bell that
 * fills with routine is a bell that gets cleared without reading, which is how
 * the one row that mattered gets cleared too. The same argument rules out
 * `orders.paid`, `orders.placed` and `pos.approval_decided`.
 *
 * What is left shares one property: somebody has to do something, and nothing
 * else on the platform was going to tell them.
 *
 * ---------------------------------------------------------------------------
 * Who hears it, and why it is not "the managers"
 *
 * Each row names the roles that can actually open the screen the notice links
 * to. An undeclared fiscal receipt goes to the owner and the ACCOUNTANT rather
 * than to a branch manager, because `/finance/books` is not in a manager's
 * twenty-one sections — a notice linking to a screen its reader is refused is
 * worse than no notice, since the reader concludes the console is broken.
 *
 * Branch-scoped, when the event names a venue: a manager pinned to Sergeli does
 * not need Chilonzor's drawer. A person with no branch — the owner, the
 * accountant — reads all of them, which is the same rule the whole API uses for
 * an absent `X-Branch`.
 *
 * Idempotent through `ProcessedEvents`: the bus delivers at least once, and a
 * bell that shows one variance twice is a bell whose count means nothing.
 */
final class RingTheConsoleBell
{
    /**
     * Which roles hear which event, and where the row goes is on the notice.
     *
     * Public because it is also the subscription list: NotificationFeedServiceProvider
     * registers this listener against its keys. One table rather than two —
     * an event wired in the provider and missing here would deliver to nobody,
     * silently, which is the failure the bus is hardest to debug for.
     *
     * @var array<string, list<string>>
     */
    public const AUDIENCE = [
        // Money missing at close. The manager acts tonight; the owner carries it.
        'finance.shift_variance_flagged' => ['owner', 'branch-manager'],
        // A sale the tax authority has no record of. The accountant answers for
        // it, and `/finance/books` is a screen only they and the owner hold.
        'finance.fiscal_receipt_expired' => ['owner', 'accountant'],
        // Loss prevention. Same pair as the variance, same screen.
        'pos.bill_voided' => ['owner', 'branch-manager'],
    ];

    public function __construct(private readonly ProcessedEvents $processed) {}

    public function handle(ReceivedEvent $event): void
    {
        $this->processed->once($event, self::class, function () use ($event): void {
            $notice = self::noticeFor($event);

            if ($notice === null || $event->tenantId === null) {
                return;
            }

            foreach ($this->audience($event) as $person) {
                // A fresh send per person: Laravel mints the row's uuid per
                // notifiable inside the sender, so one object serves them all.
                $person->notify($notice);
            }
        });
    }

    private static function noticeFor(ReceivedEvent $event): ?ConsoleNotice
    {
        return match ($event->name) {
            'finance.shift_variance_flagged' => new CashDrawerVariance(
                $event->string('number'),
                $event->integer('difference'),
                $event->integer('expected_cash'),
                $event->integer('counted_cash'),
                self::nullableText($event->get('reason')),
                self::nullableInteger($event->get('branch_id')),
            ),
            'finance.fiscal_receipt_expired' => new FiscalReceiptUndeclared(
                $event->string('order_number'),
                $event->integer('total'),
                $event->integer('attempts'),
                self::nullableText($event->get('last_error')),
                self::nullableInteger($event->get('branch_id')),
            ),
            'pos.bill_voided' => new BillVoidedAtTill(
                $event->string('number'),
                $event->integer('total'),
                $event->string('reason'),
                // Approved by somebody who is not the person who asked. The
                // payload says `approved_by_user_id` only when an approval was
                // actually granted, which is exactly the distinction the tray
                // paints in two different colours.
                self::nullableInteger($event->get('approved_by_user_id')) !== null,
            ),
            default => null,
        };
    }

    /** @return Collection<int, User> */
    private function audience(ReceivedEvent $event): Collection
    {
        $branchId = self::nullableInteger($event->get('branch_id'));

        /** @var Collection<int, User> $people */
        $people = User::query()
            // `users` is exempt from row-level security — authentication reads
            // it before a tenant exists — so the restaurant is a WHERE here and
            // not a policy. Getting this wrong pages another business's owner.
            ->where('tenant_id', $event->tenantId)
            ->where('is_active', true)
            ->role(self::AUDIENCE[$event->name] ?? [])
            ->when($branchId !== null, fn ($query) => $query->where(
                fn ($scoped) => $scoped->whereNull('branch_id')->orWhere('branch_id', $branchId),
            ))
            ->get();

        return $people;
    }

    private static function nullableText(mixed $value): ?string
    {
        return is_scalar($value) && (string) $value !== '' ? (string) $value : null;
    }

    private static function nullableInteger(mixed $value): ?int
    {
        return is_int($value) || (is_string($value) && ctype_digit($value)) ? (int) $value : null;
    }
}
