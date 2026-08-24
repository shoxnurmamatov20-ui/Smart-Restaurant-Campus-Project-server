<?php

declare(strict_types=1);

namespace Modules\TelegramBots\Http\Controllers;

use App\Http\Controllers\Controller;
use App\Support\Errors\ApiException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Response;
use Modules\TelegramBots\Http\Requests\StoreNotificationRuleRequest;
use Modules\TelegramBots\Http\Requests\UpdateNotificationRuleRequest;
use Modules\TelegramBots\Models\Bot;
use Modules\TelegramBots\Models\NotificationRule;
use Modules\TelegramBots\Services\TelegramNotifier;

/**
 * Which chat hears about what — the console's notification panel, connected.
 *
 * The panel has been drawing six switches and a chat id since the console was
 * built, and none of them was attached to anything. These five endpoints are
 * what they were always meant to call.
 */
final class NotificationRuleController extends Controller
{
    public function index(): JsonResponse
    {
        $rules = NotificationRule::query()
            ->with('bot:id,key,telegram_username')
            ->orderBy('event')
            ->get();

        return response()->json([
            'data' => $rules->map(static fn (NotificationRule $rule): array => [
                'id' => (int) $rule->id,
                'event' => $rule->event,
                'chat_id' => $rule->chat_id,
                'branch_id' => $rule->branch_id,
                'bot' => $rule->bot === null ? null : ($rule->bot->telegram_username ?? $rule->bot->key),
                'locale' => $rule->locale,
                'min_amount_tiyin' => $rule->min_amount_tiyin,
                'enabled' => (bool) $rule->enabled,
                'last_sent_at' => $rule->last_sent_at?->toIso8601String(),
            ])->all(),
            'meta' => [
                // The closed set, so the console draws the switches the server
                // will actually honour rather than a list written twice.
                'events' => NotificationRule::EVENTS,
                'bots' => Bot::query()
                    ->where('enabled', true)
                    ->get(['id', 'key', 'telegram_username'])
                    ->map(static fn (Bot $bot): array => [
                        'id' => (int) $bot->id,
                        'key' => $bot->key,
                        'handle' => $bot->telegram_username,
                        // Whether it can actually send. A restaurant that has
                        // named a bot with no token would otherwise save six
                        // rules and hear nothing, with no clue why.
                        'ready' => $bot->encrypted_token !== null,
                    ])->all(),
            ],
        ]);
    }

    public function store(StoreNotificationRuleRequest $request): JsonResponse
    {
        /*
         * `updateOrCreate` against the unique key rather than `create`.
         *
         * The console's panel is a switch per event, not a list — somebody
         * turning "voids" on twice means one rule, and a second row would mean
         * two messages for every void from then on.
         */
        $rule = NotificationRule::query()->updateOrCreate(
            [
                'event' => (string) $request->validated('event'),
                'chat_id' => (string) $request->validated('chat_id'),
                'branch_id' => $request->validated('branch_id'),
            ],
            $request->safe()->except(['event', 'chat_id', 'branch_id']),
        );

        return response()->json(['data' => ['id' => $rule->id]], Response::HTTP_CREATED);
    }

    public function update(UpdateNotificationRuleRequest $request, NotificationRule $rule): JsonResponse
    {
        $rule->fill($request->validated())->save();

        return response()->json(['data' => ['id' => $rule->id, 'enabled' => (bool) $rule->enabled]]);
    }

    public function destroy(NotificationRule $rule): Response
    {
        $rule->delete();

        return response()->noContent();
    }

    /**
     * Send one message now, so the person can see whether it lands.
     *
     * The only way to know a chat id is right: Telegram will not confirm one
     * exists, and a bot cannot message a group it has not been added to. A rule
     * saved without this is a rule nobody finds out is broken until the night
     * something actually goes wrong.
     */
    public function test(NotificationRule $rule, TelegramNotifier $notifier): JsonResponse
    {
        $sent = $notifier->send($rule, __('telegrambots::notify.test', [], $rule->locale));

        if (! $sent) {
            throw ApiException::detailed(
                'request.validation_failed',
                "Xabar yuborilmadi. Bot guruhga qo'shilganini va chat id to'g'riligini tekshiring.",
                'Сообщение не отправлено. Проверьте, добавлен ли бот в группу и верен ли chat id.',
                'The message did not go out. Check the bot is in the group and the chat id is right.',
                field: 'chat_id',
            );
        }

        return response()->json(['sent' => true]);
    }

    /**
     * Is this token real, and whose bot is it?
     *
     * Telegram's `getMe`, which is the only honest answer: a token is a string
     * until Telegram says it belongs to something. The handle comes back too,
     * because a restaurant that pasted the WRONG token would otherwise get a
     * green tick and a bot nobody in their group has ever seen.
     */
    public function testBot(Bot $bot, TelegramNotifier $notifier): JsonResponse
    {
        $result = $notifier->identify($bot);

        if (! $result['ok']) {
            throw ApiException::detailed(
                'request.validation_failed',
                'Bot tokeni ishlamadi. Yangi token oling va qayta saqlang.',
                'Токен бота не сработал. Получите новый и сохраните заново.',
                'The bot token did not work. Get a new one and save it again.',
                field: 'token',
            );
        }

        return response()->json(['bot' => ['id' => $bot->id, 'handle' => $result['handle']]]);
    }
}
