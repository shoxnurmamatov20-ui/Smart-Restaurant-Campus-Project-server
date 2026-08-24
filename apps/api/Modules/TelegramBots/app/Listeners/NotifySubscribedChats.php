<?php

declare(strict_types=1);

namespace Modules\TelegramBots\Listeners;

use App\Support\Events\ReceivedEvent;
use App\Support\Tenancy\DatabaseTenancy;
use Modules\TelegramBots\Services\TelegramNotifier;

/**
 * The bridge between "something happened" and "somebody's phone buzzed".
 *
 * Subscribed by NAME to the domain events other modules publish — never by
 * importing their classes — which is what lets Pos raise an approval without
 * knowing Telegram exists. See App\Support\Events\DomainEvent.
 *
 * Queued rather than inline: `EventBus` delivers after commit, and a listener
 * that spent four seconds talking to api.telegram.org would spend them inside
 * the request that took the payment.
 */
final class NotifySubscribedChats
{
    public function __construct(
        private readonly TelegramNotifier $notifier,
        private readonly DatabaseTenancy $database,
    ) {}

    public function handle(ReceivedEvent $event): void
    {
        if ($event->tenantId === null) {
            return;
        }

        /*
         * The relay runs on a queue worker with no request behind it, so
         * `app.tenant_id` is unset and row-level security fails closed — the
         * rules table would read zero rows and every restaurant would silently
         * stop being notified. The event carries the restaurant it happened in;
         * the connection is pointed at it for the duration.
         */
        $this->database->focusDuring($event->tenantId, function () use ($event): void {
            $this->notifier->dispatch($event);
        });
    }
}
