<?php

declare(strict_types=1);

namespace Modules\Pos\Listeners;

use App\Models\User;
use App\Notifications\ApprovalWaiting;
use App\Support\Events\ProcessedEvents;
use App\Support\Events\ReceivedEvent;

/**
 * `pos.approval_requested` → a push to every manager of the tenant whose
 * phone is registered.
 *
 * Managers and the owner: the two roles whose discount ceiling covers what a
 * cashier cannot sign, per `Terminal.settings.discount_limits`. Not the whole
 * restaurant — a waiter's phone buzzing about an approval they cannot give is
 * the notification that gets the app muted.
 *
 * Idempotent through `ProcessedEvents`: the bus delivers at least once, and a
 * manager paged twice for one request is a manager who stops trusting the
 * count.
 */
final class PageTheManager
{
    public function __construct(private readonly ProcessedEvents $processed) {}

    public function handle(ReceivedEvent $event): void
    {
        $this->processed->once($event, self::class, function () use ($event): void {
            $managers = User::query()
                ->where('tenant_id', $event->tenantId)
                ->role(['owner', 'branch-manager'])
                ->whereHas('pushTokens', fn ($query) => $query->whereNull('invalidated_at'))
                ->get();

            foreach ($managers as $manager) {
                $manager->notify(new ApprovalWaiting(
                    $event->integer('approval_id'),
                    [
                        'action' => (string) $event->get('action', ''),
                        'amount' => $event->integer('amount'),
                        'reason' => $event->get('reason') === null ? null : (string) $event->get('reason'),
                        'expires_at' => (string) $event->get('expires_at', ''),
                        'role' => $manager->hasRole('owner') ? 'owner' : 'manager',
                    ],
                ));
            }
        });
    }
}
