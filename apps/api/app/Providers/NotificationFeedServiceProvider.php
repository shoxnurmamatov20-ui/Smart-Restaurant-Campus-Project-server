<?php

declare(strict_types=1);

namespace App\Providers;

use App\Listeners\RingTheConsoleBell;
use App\Notifications\Channels\ConsoleFeedChannel;
use Illuminate\Notifications\Channels\DatabaseChannel;
use Illuminate\Support\Facades\Event;
use Illuminate\Support\ServiceProvider;

/**
 * The two wires behind the console's bell.
 *
 * A provider of its own rather than four more lines in AppServiceProvider,
 * because these two are one feature and nothing else in the application
 * depends on either: a reader looking for why a notification reached a screen
 * finds the channel and the subscriptions in the same file, and a deployment
 * that wanted the bell off would remove one line from bootstrap/providers.php.
 */
final class NotificationFeedServiceProvider extends ServiceProvider
{
    /**
     * `database` resolves to the channel that knows about tenancy.
     *
     * `ChannelManager::createDatabaseDriver()` makes DatabaseChannel out of the
     * container, so a binding is the whole mechanism. Bound in register() and
     * not boot(): a notification sent from another provider's boot would
     * otherwise get the framework's channel and be refused by row-level
     * security for having no `tenant_id`.
     */
    public function register(): void
    {
        $this->app->bind(DatabaseChannel::class, ConsoleFeedChannel::class);
    }

    /**
     * Subscribed by event NAME, which is what keeps the core free of module
     * imports — see App\Support\Events\DomainEvent. The names come from the
     * listener's own audience table so the two cannot drift apart.
     */
    public function boot(): void
    {
        foreach (array_keys(RingTheConsoleBell::AUDIENCE) as $name) {
            Event::listen($name, RingTheConsoleBell::class);
        }
    }
}
