<?php

declare(strict_types=1);

namespace Modules\TelegramBots\Http\Controllers;

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

        // Find CAMPUS user by phone (E.164 — adjust to your normalisation logic)
        $user = User::query()
            ->where(function ($q) use ($data) {
                $q->where('phone', $data['phone'])
                    ->orWhere('phone', ltrim($data['phone'], '+'));
            })
            ->first();

        if (! $user) {
            return response()->json([
                'message' => 'No CAMPUS user with this phone',
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

    // ============ Student-bot specific endpoints (sample) ============

    public function myScheduleToday(Request $request, string $botKey): JsonResponse
    {
        // TODO: pull from Students module once the schedule table exists.
        // For now return a placeholder so the bot UI can be tested.
        return response()->json([
            'lessons' => [
                ['start' => '08:30', 'end' => '10:00', 'subject' => 'Matematik analiz', 'classroom' => 'A-201', 'teacher' => 'Aliyev A.'],
                ['start' => '10:15', 'end' => '11:45', 'subject' => 'Dasturlash asoslari', 'classroom' => 'L-105', 'teacher' => 'Karimov B.'],
            ],
        ]);
    }

    public function myRecentGrades(Request $request, string $botKey): JsonResponse
    {
        return response()->json([
            'grades' => [
                ['subject' => 'Matematik analiz', 'score' => 92, 'date' => '2026-05-24'],
                ['subject' => 'Dasturlash asoslari', 'score' => 87, 'date' => '2026-05-22'],
                ['subject' => 'Ingliz tili', 'score' => 75, 'date' => '2026-05-21'],
            ],
        ]);
    }

    public function myAttendanceSummary(Request $request, string $botKey): JsonResponse
    {
        return response()->json(['attendance_pct' => 94, 'absent_count' => 3]);
    }

    public function myBalance(Request $request, string $botKey): JsonResponse
    {
        return response()->json(['cafeteria_uzs' => 145000, 'contract_due_uzs' => 0]);
    }

    public function myLibraryLoans(Request $request, string $botKey): JsonResponse
    {
        return response()->json(['loans' => []]);
    }
}
