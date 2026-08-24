<?php

declare(strict_types=1);

namespace Modules\TelegramBots\Providers;

use Illuminate\Foundation\Support\Providers\EventServiceProvider as ServiceProvider;
use Illuminate\Support\Facades\Event;
use Modules\TelegramBots\Listeners\NotifySubscribedChats;
use Modules\TelegramBots\Models\NotificationRule;

class EventServiceProvider extends ServiceProvider
{
    /**
     * Which domain events reach a restaurant's own Telegram chat.
     *
     * Subscribed BY NAME, never by importing the publishing module's class —
     * that is the whole point of the outbox: Pos raises an approval without
     * knowing this module exists, and `ModuleBoundaryTest` would refuse the
     * import anyway.
     *
     * The list is `NotificationRule::EVENTS`, and it is a closed set for a
     * reason written there: an open field lets somebody save `orders.plased`
     * and wait forever for a message that was never coming.
     *
     * @var array<string, array<int, string>>
     */
    protected $listen = [];

    public function boot(): void
    {
        parent::boot();

        foreach (NotificationRule::EVENTS as $event) {
            Event::listen($event, NotifySubscribedChats::class);
        }
    }

    /**
     * Indicates if events should be discovered.
     *
     * @var bool
     */
    protected static $shouldDiscoverEvents = true;

    /**
     * Configure the proper event listeners for email verification.
     */
    protected function configureEmailVerification(): void {}
}
