<?php

declare(strict_types=1);

namespace Modules\TelegramBots\Http\Controllers;

use App\Contracts\Menu\MenuCatalog;
use App\Contracts\Menu\Section;
use App\Http\Controllers\Controller;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Modules\TelegramBots\Models\Bot;
use Modules\TelegramBots\Models\BotUser;
use Modules\TelegramBots\Models\CommandLog;

/**
 * Endpoints called BY the Python telegram-bots service (apps/telegram-bots).
 * All routes prefix: /api/v1/bots/{bot_key}/...
 * Auth: Bearer LARAVEL_INTERNAL_TOKEN (shared with apps/telegram-bots .env).
 *
 * TelegramBots is a gateway module: it owns no business rules of its own and
 * exists to translate between Telegram and the domain modules. That is why it
 * is the one module allowed to read another module's models directly (Menu,
 * below) — the alternative would be an HTTP call from Laravel to itself.
 */
final class BotApiController extends Controller
{
    /**
     * POST /bots/{botKey}/users/link
     * Phone-based user linking after /start in the bot.
     */
    public function link(Request $request, string $botKey): JsonResponse
    {
        $bot = Bot::where('key', $botKey)->firstOrFail();

        $data = $request->validate([
            'telegram_id' => 'required|integer',
            'phone' => 'required|string|max:32',
            'full_name' => 'required|string|max:255',
            'username' => 'nullable|string|max:64',
        ]);

        // Find the platform user by phone (E.164 — see src/utils/phone.py on the bot side)
        $user = User::query()
            ->where(function ($q) use ($data) {
                $q->where('phone', $data['phone'])
                    ->orWhere('phone', ltrim($data['phone'], '+'));
            })
            ->first();

        if (! $user) {
            return response()->json([
                'message' => 'No platform user with this phone',
                'phone' => $data['phone'],
            ], 404);
        }

        $botUser = BotUser::updateOrCreate(
            ['bot_id' => $bot->id, 'telegram_id' => $data['telegram_id']],
            [
                'user_id' => $user->id,
                'telegram_username' => $data['username'] ?? null,
                'phone' => $data['phone'],
                'full_name' => $data['full_name'],
                'linked_at' => now(),
                'last_seen_at' => now(),
            ]
        );

        return response()->json([
            'bot_user_id' => $botUser->id,
            'user' => [
                'id' => $user->id,
                'full_name' => $user->name,
                'email' => $user->email,
                'roles' => $user->getRoleNames(),
            ],
        ]);
    }

    /**
     * GET /bots/{botKey}/users/{telegramId}
     */
    public function getLinkedUser(string $botKey, int $telegramId): JsonResponse
    {
        $bot = Bot::where('key', $botKey)->firstOrFail();
        $botUser = BotUser::where('bot_id', $bot->id)
            ->where('telegram_id', $telegramId)
            ->with('user')
            ->first();

        if (! $botUser || ! $botUser->user) {
            return response()->json(['message' => 'Not linked'], 404);
        }

        $botUser->update(['last_seen_at' => now()]);

        return response()->json([
            'bot_user_id' => $botUser->id,
            'user' => [
                'id' => $botUser->user->id,
                'full_name' => $botUser->user->name,
                'email' => $botUser->user->email,
                'roles' => $botUser->user->getRoleNames(),
            ],
        ]);
    }

    /**
     * POST /bots/{botKey}/commands/log
     * Fire-and-forget analytics from the Python service.
     */
    public function logCommand(Request $request, string $botKey): JsonResponse
    {
        $bot = Bot::where('key', $botKey)->firstOrFail();

        $data = $request->validate([
            'telegram_id' => 'required|integer',
            'command' => 'required|string|max:64',
            'chat_type' => 'required|string|max:16',
            'latency_ms' => 'required|integer',
            'ok' => 'required|boolean',
            'error' => 'nullable|string|max:500',
        ]);

        $userId = BotUser::where('bot_id', $bot->id)
            ->where('telegram_id', $data['telegram_id'])
            ->value('user_id');

        CommandLog::create([
            'bot_id' => $bot->id,
            'telegram_id' => $data['telegram_id'],
            'user_id' => $userId,
            'command' => $data['command'],
            'chat_type' => $data['chat_type'],
            'latency_ms' => $data['latency_ms'],
            'ok' => $data['ok'],
            'error' => $data['error'] ?? null,
        ]);

        return response()->json(['ok' => true]);
    }

    // ============ Domain endpoints consumed by the bots ============
    //
    // `menu` is real — it reads the live Menu module, which is implemented.
    // The rest delegate to modules that are still skeletons (Orders, Kitchen,
    // Tables, Crm, Finance), so they are gated by the `telegrambots.mock_data`
    // config flag:
    //   - true  (dev):  return placeholder values so the bot UI can be built
    //   - false (prod): return HTTP 501 so users see "tez orada" rather than
    //                   an invented bonus balance or a fake shift total
    //
    // Replace each mock branch with a real query as its module lands.

    /**
     * The live menu, exactly as a guest may order it right now.
     *
     * Real data: the Menu module is implemented, so this never mocks. Only
     * orderable items of active categories are exposed — a bot must never
     * offer a dish the kitchen has just stopped.
     */
    public function menu(Request $request, string $botKey, MenuCatalog $menu): JsonResponse
    {
        // Resolved even though nothing below needs the row: the lookup is
        // tenant-scoped, so it is what stops a misconfigured bot key from
        // quietly serving whichever restaurant the X-Tenant header named.
        Bot::where('key', $botKey)->firstOrFail();

        $channel = (string) $request->query('channel', 'dine_in');

        // Read through the platform contract, not through Menu's models: a bot
        // that imported another module's Eloquent classes would break every
        // time Menu changed a column, and could never be deployed on its own.
        $sections = $menu->sellable($channel);

        return response()->json([
            'channel' => $channel,
            'categories' => array_map(static fn (Section $section): array => $section->toArray(), $sections),
        ]);
    }

    public function myOrders(Request $request, string $botKey): JsonResponse
    {
        if (! $this->mockEnabled()) {
            return $this->notImplemented('me.orders', 'Orders moduli');
        }

        return response()->json([
            'orders' => [
                [
                    'id' => 1,
                    'number' => 'A-1042',
                    'channel' => 'dine_in',
                    'status' => 'in_kitchen',
                    'table_label' => 'A-7',
                    'total_tiyin' => 12700000,
                    'placed_at' => now()->subMinutes(12)->toIso8601String(),
                    'lines' => [],
                ],
            ],
        ]);
    }

    public function myLoyalty(Request $request, string $botKey): JsonResponse
    {
        if (! $this->mockEnabled()) {
            return $this->notImplemented('me.loyalty', 'CRM moduli');
        }

        return response()->json([
            'points' => 1240,
            'tier' => 'silver',
            'cashback_tiyin' => 3100000,
            'next_tier_points' => 2000,
        ]);
    }

    public function myTables(Request $request, string $botKey): JsonResponse
    {
        if (! $this->mockEnabled()) {
            return $this->notImplemented('me.tables', 'Tables moduli');
        }

        return response()->json([
            'tables' => [
                ['id' => 7, 'label' => 'A-7', 'hall' => 'Asosiy zal', 'seats' => 4, 'status' => 'occupied'],
                ['id' => 8, 'label' => 'A-8', 'hall' => 'Asosiy zal', 'seats' => 2, 'status' => 'free'],
            ],
        ]);
    }

    public function myReadyTickets(Request $request, string $botKey): JsonResponse
    {
        if (! $this->mockEnabled()) {
            return $this->notImplemented('me.ready', 'Kitchen moduli');
        }

        return response()->json([
            'tickets' => [
                ['id' => 55, 'order_number' => 'A-1042', 'station' => 'hot', 'table_label' => 'A-7'],
            ],
        ]);
    }

    public function myGuestCalls(Request $request, string $botKey): JsonResponse
    {
        if (! $this->mockEnabled()) {
            return $this->notImplemented('me.calls', 'Tables moduli');
        }

        return response()->json(['calls' => []]);
    }

    public function myShift(Request $request, string $botKey): JsonResponse
    {
        if (! $this->mockEnabled()) {
            return $this->notImplemented('me.shift', 'Finance moduli');
        }

        return response()->json([
            'is_open' => true,
            'opened_at' => now()->startOfDay()->addHours(10)->toIso8601String(),
            'revenue_tiyin' => 184500000,
            'orders_count' => 37,
            'average_cheque_tiyin' => 4986000,
            'guests_count' => 92,
        ]);
    }

    public function storeFeedback(Request $request, string $botKey): JsonResponse
    {
        Bot::where('key', $botKey)->firstOrFail();

        $validated = $request->validate([
            'score' => ['required', 'integer', 'min:1', 'max:5'],
            'comment' => ['nullable', 'string', 'max:2000'],
        ]);

        if (! $this->mockEnabled()) {
            return $this->notImplemented('feedback.store', 'CRM moduli');
        }

        return response()->json(['ok' => true, 'score' => $validated['score']], 201);
    }

    private function mockEnabled(): bool
    {
        return (bool) config('telegrambots.mock_data', true);
    }

    private function notImplemented(string $feature, string $blockingModule): JsonResponse
    {
        return response()->json([
            'message' => "Bu funksiya hozircha yo'q. ({$blockingModule} kutilmoqda.)",
            'code' => 'FEATURE_NOT_IMPLEMENTED',
            'feature' => $feature,
            'blocked_by' => $blockingModule,
        ], 501);
    }
}
