<?php

declare(strict_types=1);

namespace Modules\TelegramBots\Http\Middleware;

use App\Support\Errors\ApiException;
use App\Support\Tenancy\TenantContext;
use Closure;
use Illuminate\Http\Request;
use Modules\TelegramBots\Models\Bot;
use Symfony\Component\HttpFoundation\Response;

/**
 * The bot key has to belong to the restaurant that was named.
 *
 * Keys are unique per restaurant, not per platform — `tg_bots` is indexed on
 * (tenant_id, key) — so "guest" is a different bot at every venue and the
 * caller must say which one it means. `ResolveTenant` runs first and does that
 * from `X-Tenant`, exactly as it does for every other request; this middleware
 * then checks that the key in the path actually exists there.
 *
 * That check is the part that was missing. BotApiController looks the key up
 * in each action under a comment saying the lookup "is what stops a
 * misconfigured bot key from quietly serving whichever restaurant the X-Tenant
 * header named" — but the routes carried no tenant resolution at all, so the
 * lookup had no restaurant to scope to and the claim was not true. Row-level
 * security then made the same gap fatal rather than merely wrong: with no
 * tenancy claim the policies hid tg_bots entirely and every bot endpoint
 * answered 404 for a key that plainly exists.
 *
 * Doing it here rather than in each action means a new endpoint cannot forget.
 */
final class ResolveBotTenant
{
    public const ATTRIBUTE = 'bots.bot';

    /**
     * @param  Closure(Request): Response  $next
     */
    public function handle(Request $request, Closure $next): Response
    {
        $tenant = app(TenantContext::class)->tenant();

        if ($tenant === null) {
            // ResolveTenant lets a request through with no restaurant when
            // TENANCY_REQUIRE_TENANT is off, which is the local default. A bot
            // route cannot work that way: there is no such thing as a bot
            // belonging to no restaurant.
            throw ApiException::of('bots.unknown_key');
        }

        $key = (string) $request->route('botKey');

        // Scoped by the tenant global scope — the whole point.
        $bot = Bot::query()->where('key', $key)->first();

        if ($bot === null) {
            // One answer for "no such key here" and "that key is somebody
            // else's". A caller learns nothing about another restaurant's bots.
            throw ApiException::of('bots.unknown_key');
        }

        $request->attributes->set(self::ATTRIBUTE, $bot);

        return $next($request);
    }

    /** The bot this request is for, already checked against the restaurant. */
    public static function of(Request $request): Bot
    {
        $bot = $request->attributes->get(self::ATTRIBUTE);

        if (! $bot instanceof Bot) {
            throw new \LogicException('Route is missing the bots.tenant middleware.');
        }

        return $bot;
    }
}
