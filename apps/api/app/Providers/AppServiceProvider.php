<?php

declare(strict_types=1);

namespace App\Providers;

use App\Contracts\Crm\CaseDesk;
use App\Contracts\Crm\GuestAccounts;
use App\Contracts\Crm\Promotions;
use App\Contracts\Crm\UnavailableCaseDesk;
use App\Contracts\Crm\UnavailableGuestAccounts;
use App\Contracts\Crm\UnavailablePromotions;
use App\Contracts\Finance\DayBook;
use App\Contracts\Finance\PaymentGateways;
use App\Contracts\Finance\TillLedger;
use App\Contracts\Finance\UnavailableDayBook;
use App\Contracts\Finance\UnavailablePaymentGateways;
use App\Contracts\Finance\UnavailableTillLedger;
use App\Contracts\Inventory\ShelfCosts;
use App\Contracts\Inventory\StockLedger;
use App\Contracts\Inventory\StockReport;
use App\Contracts\Inventory\UnavailableShelfCosts;
use App\Contracts\Inventory\UnavailableStockLedger;
use App\Contracts\Inventory\UnavailableStockReport;
use App\Contracts\Kitchen\KitchenLoad;
use App\Contracts\Kitchen\TicketWriter;
use App\Contracts\Kitchen\UnavailableKitchenLoad;
use App\Contracts\Kitchen\UnavailableTicketWriter;
use App\Contracts\Menu\MenuCatalog;
use App\Contracts\Menu\StopList;
use App\Contracts\Menu\UnavailableMenuCatalog;
use App\Contracts\Menu\UnavailableStopList;
use App\Contracts\Messaging\BotDirectory;
use App\Contracts\Messaging\ChatNotifier;
use App\Contracts\Messaging\SmsSender;
use App\Contracts\Messaging\UnavailableBotDirectory;
use App\Contracts\Messaging\UnavailableChatNotifier;
use App\Contracts\Orders\BillRegistry;
use App\Contracts\Orders\UnavailableBillRegistry;
use App\Contracts\Pos\Approvals;
use App\Contracts\Pos\DiscountLimits;
use App\Contracts\Pos\TerminalRegistry;
use App\Contracts\Pos\UnavailableApprovals;
use App\Contracts\Pos\UnavailableDiscountLimits;
use App\Contracts\Pos\UnavailableTerminalRegistry;
use App\Contracts\Staff\Roster;
use App\Contracts\Staff\UnavailableRoster;
use App\Contracts\Suppliers\Purchasing;
use App\Contracts\Suppliers\Receiving;
use App\Contracts\Suppliers\UnavailablePurchasing;
use App\Contracts\Suppliers\UnavailableReceiving;
use App\Contracts\Tables\FloorBoard;
use App\Contracts\Tables\FloorPlan;
use App\Contracts\Tables\UnavailableFloorBoard;
use App\Contracts\Tables\UnavailableFloorPlan;
use App\Support\Events\EventBus;
use App\Support\Messaging\EskizSmsSender;
use App\Support\Messaging\LogSmsSender;
use App\Support\Modules\ModuleRegistry;
use App\Support\Push\ExpoPushChannel;
use App\Support\Tenancy\BranchContext;
use App\Support\Tenancy\DatabaseTenancy;
use App\Support\Tenancy\TenantContext;
use Illuminate\Cache\RateLimiting\Limit;
use Illuminate\Database\Events\ConnectionEstablished;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Notification;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\ServiceProvider;
use InvalidArgumentException;

class AppServiceProvider extends ServiceProvider
{
    /**
     * Register any application services.
     */
    public function register(): void
    {
        // All per-request state: the tenant and its branch obviously, and the
        // module registry because it memoises config that a long-running worker
        // (Octane) must not carry between restaurants. `scoped` resets them.
        //
        // `scoped` and not a plain binding: an unregistered class is rebuilt on
        // every app() call, so whatever the middleware resolved would be thrown
        // away and the model traits would read an empty context — rows land
        // unstamped, and an unstamped branch_id means "every branch".
        $this->app->scoped(TenantContext::class);
        $this->app->scoped(BranchContext::class);

        // The database-side twin of TenantContext — it writes the GUCs the
        // row-level-security policies read. A singleton, not scoped: it must
        // remember what it applied across a reconnect inside one request.
        $this->app->singleton(DatabaseTenancy::class, fn (): DatabaseTenancy => new DatabaseTenancy(
            $this->app->runningInConsole(),
        ));
        $this->app->scoped(ModuleRegistry::class);
        $this->app->scoped(EventBus::class);

        // Fallbacks for the cross-module read contracts. `bindIf` so a module
        // that is installed always wins; this only answers when it is not, which
        // is what lets the rest of the platform boot without it.
        $this->app->bindIf(MenuCatalog::class, UnavailableMenuCatalog::class);

        // The stop-list answers "nothing is off" when Menu is absent. A till that
        // greyed out its whole menu because it could not read the 86 sheet would
        // be a till that cannot sell, which is worse than one that lets a cook
        // say "we're out of that" across the pass.
        $this->app->bindIf(StopList::class, UnavailableStopList::class);

        /*
         * The guest tab. Its reads answer "nobody owes anything" and its writes
         * refuse — a meal signed for into a module that is not running is food
         * given away with no line to collect against.
         */
        $this->app->bindIf(GuestAccounts::class, UnavailableGuestAccounts::class);

        /*
         * A promo code, priced by the module that owns the campaign. Its
         * fallback quotes nothing and refuses to spend: a discount granted by a
         * module that is not running is money off a bill with no campaign behind
         * it and nothing for an owner to reconcile against.
         */
        $this->app->bindIf(Promotions::class, UnavailablePromotions::class);

        // The two write contracts the till depends on. Their fallbacks refuse
        // rather than no-op: a POS quietly "selling" into a module that is not
        // running would take cash off guests with no record of it.
        $this->app->bindIf(BillRegistry::class, UnavailableBillRegistry::class);
        $this->app->bindIf(TillLedger::class, UnavailableTillLedger::class);

        // Firing a bill is the third. Same reasoning: a bill that reports
        // itself sent into a kitchen that is not running is a guest waiting
        // for food nobody is cooking.
        $this->app->bindIf(TicketWriter::class, UnavailableTicketWriter::class);

        // And the fourth: a write-off or a count coming off a waiter's phone.
        // Its fallback refuses too — a phone told its write-off landed clears
        // that entry from its queue, and the spoiled stock then exists nowhere.
        $this->app->bindIf(StockLedger::class, UnavailableStockLedger::class);

        /*
         * The other two verbs that arrive off a phone rather than a keyboard:
         * claiming a table, closing a raised hand, and signing for a van at the
         * service entrance. All three fallbacks REFUSE for the same reason
         * StockLedger's does — a queue told its entry landed drops it, and the
         * fact then exists nowhere. See App\Contracts\Tables\FloorPlan.
         */
        $this->app->bindIf(FloorPlan::class, UnavailableFloorPlan::class);
        $this->app->bindIf(Receiving::class, UnavailableReceiving::class);

        // The idle screen's three read contracts. These fallbacks answer zero
        // rather than refusing, because their absence is a true state — a
        // counter with no floor plan, a kiosk with no staff module — and the
        // screen simply hides the figure.
        $this->app->bindIf(FloorBoard::class, UnavailableFloorBoard::class);
        $this->app->bindIf(KitchenLoad::class, UnavailableKitchenLoad::class);
        $this->app->bindIf(CaseDesk::class, UnavailableCaseDesk::class);
        $this->app->bindIf(BotDirectory::class, UnavailableBotDirectory::class);
        $this->app->bindIf(Roster::class, UnavailableRoster::class);
        $this->app->bindIf(DayBook::class, UnavailableDayBook::class);

        // The shelf, read-only, for the dashboards. Zeroes rather than a
        // refusal for the same reason as the three above: a venue with no
        // stock control has nothing to report, and the panel simply empties.
        $this->app->bindIf(StockReport::class, UnavailableStockReport::class);

        /*
         * The purchasing ledger, read-only, for the storekeeper's and the
         * accountant's home screens. Empty rather than a refusal for the same
         * reason as the shelf above: a restaurant with no purchasing module
         * has no vans due and owes nothing through it, and both panels draw
         * their own empty state rather than an error.
         */
        $this->app->bindIf(Purchasing::class, UnavailablePurchasing::class);

        /*
         * What a recipe line is made of, priced. Empty rather than a refusal,
         * and the consequence is on the contract: a card read with no warehouse
         * module draws its lines uncosted and reports no total, rather than
         * reporting a 100% margin because nothing on it cost anything.
         */
        $this->app->bindIf(ShelfCosts::class, UnavailableShelfCosts::class);

        /*
         * What a role may take off a bill. Read by the console's roles screen,
         * stored where the till already reads it. The fallback is the empty
         * table rather than a refusal: a deployment with no Pos module has no
         * tills, and a screen that hides a column is better than one that 500s.
         */
        $this->app->bindIf(DiscountLimits::class, UnavailableDiscountLimits::class);
        $this->app->bindIf(TerminalRegistry::class, UnavailableTerminalRegistry::class);

        /*
         * The approval ledger. Its fallback answers "nobody has to sign" rather
         * than "everybody does", which reads like the unsafe direction and is
         * not — see UnavailableApprovals: with no till module there is nothing
         * that could ever sign one off, so the strict answer would refuse every
         * discount on the platform forever.
         */
        $this->app->bindIf(Approvals::class, UnavailableApprovals::class);

        /*
         * Which online rails a checkout may offer. Its fallback is the empty
         * list rather than a refusal: a venue running without Finance can still
         * take an order, it just cannot take a card, and a checkout drawing one
         * fewer button is exactly the right degradation. Finance overrides it
         * with the real registry.
         */
        $this->app->bindIf(PaymentGateways::class, UnavailablePaymentGateways::class);

        /*
         * Writing into a restaurant's own Telegram chat. Its fallback declines
         * and logs rather than refusing loudly: the caller is a scheduler tick
         * with eleven other schedules behind it, and one restaurant with no bot
         * must not stop the other ten. See App\Contracts\Messaging\ChatNotifier.
         */
        $this->app->bindIf(ChatNotifier::class, UnavailableChatNotifier::class);

        /*
         * Which SMS gateway is real on this machine.
         *
         * `bind`, not `bindIf`: SMS is not a module contract with an
         * "unavailable" fallback, it is infrastructure, and there is no honest
         * no-op — a platform that pretends to have sent a sign-in code locks
         * every customer out of their own account while reporting success.
         *
         * A singleton because the Eskiz driver holds a token and validates its
         * configuration in the constructor; rebuilding it per call would repeat
         * both.
         */
        $this->app->singleton(SmsSender::class, function (): SmsSender {
            $driver = (string) config('services.sms.driver', 'log');

            return match ($driver) {
                'eskiz' => new EskizSmsSender(
                    baseUrl: (string) config('services.sms.eskiz.url'),
                    email: (string) config('services.sms.eskiz.email'),
                    password: (string) config('services.sms.eskiz.password'),
                    from: (string) config('services.sms.from'),
                ),
                'log' => new LogSmsSender,
                default => throw new InvalidArgumentException(
                    "SMS_DRIVER=[{$driver}] is not a driver this platform has. Use 'eskiz' or 'log'.",
                ),
            };
        });
    }

    /**
     * Bootstrap any application services.
     */
    public function boot(): void
    {
        // `'expo'` in a notification's `via()` sends to every phone the person
        // registered — see App\Support\Push.
        // The container is handed in; `$this->app` is not safe to capture here —
        // the manager resolves drivers lazily, long after this provider's work.
        Notification::extend('expo', fn ($app) => $app->make(ExpoPushChannel::class));

        $this->configureRateLimiting();
        $this->assertMessagingIsConfigured();

        // Session GUCs die with their connection. Whenever one is (re)made —
        // process start, a dropped link, a reconnect mid-request — hand it the
        // tenancy state the request already established, or the console
        // default. Without this, a reconnect silently downgrades a scoped
        // request to fail-closed and every query answers empty.
        $this->app['events']->listen(ConnectionEstablished::class, function (): void {
            $this->app->make(DatabaseTenancy::class)->reapply();
        });
    }

    /**
     * A production box that cannot send an SMS must not start.
     *
     * The driver validates itself in its constructor, and resolving it here is
     * what makes that check happen at boot rather than at 20:41 on a Friday
     * when the first customer asks for a sign-in code. The difference is where
     * the failure lands: a deploy that stops, with the missing variable named
     * in the log, versus an endpoint answering 200 while no message ever
     * arrives — which reads to everyone involved as "the mobile operator is
     * slow tonight".
     *
     * Production only. A laptop and CI run the log driver, which is configured
     * by existing, and forcing the check everywhere would make every test boot
     * assert on credentials no test has.
     */
    private function assertMessagingIsConfigured(): void
    {
        if (! $this->app->isProduction()) {
            return;
        }

        $this->app->make(SmsSender::class);
    }

    /**
     * bootstrap/app.php calls `throttleApi()`, which resolves a limiter named
     * "api". Without this registration every API request dies with
     * "Rate limiter [api] is not defined" — so this is not optional.
     *
     * Limits are sized for a restaurant, not a blog: a POS terminal or a
     * kitchen display polls far harder than a human, and it is authenticated,
     * so signed-in traffic gets a much wider lane than anonymous traffic.
     */
    private function configureRateLimiting(): void
    {
        RateLimiter::for('api', function (Request $request): Limit {
            return $request->user()
                ? Limit::perMinute(300)->by('user:'.$request->user()->id)
                : Limit::perMinute(60)->by('ip:'.$request->ip());
        });

        // Guest-facing QR menu / feedback endpoints: generous enough for a full
        // table scanning at once, tight enough to be worthless for scraping.
        RateLimiter::for('public', function (Request $request): Limit {
            return Limit::perMinute(120)->by('ip:'.$request->ip());
        });

        // Login and password endpoints — brute-force protection.
        RateLimiter::for('auth', function (Request $request): Limit {
            return Limit::perMinute(5)
                ->by(mb_strtolower((string) $request->input('email')).'|'.$request->ip());
        });
    }
}
