<?php

declare(strict_types=1);

namespace App\Http\Controllers;

use App\Models\PushToken;
use App\Support\Push\GuestTokens;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

/**
 * A phone says where it can be reached; a phone says it no longer can.
 *
 * Called by the native app after sign-in and on every launch (the token can
 * change). Moves the row when the same device registers under a different
 * person — one install, one token, one owner at a time — so signing out of a
 * shared work phone and in as someone else does not leave the first person's
 * pages arriving on it.
 */
final class PushTokenController extends Controller
{
    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            ...GuestTokens::rules(),
            // Staff choose their surface; the guest routes do not, because a
            // customer app claiming to be the crew app would put a stranger on
            // the list a manager's approval pages go to.
            'surface' => ['required', Rule::in(['customer', 'crew', 'mp', 'guest'])],
        ]);

        if (! PushToken::looksLikeExpoToken($data['token'])) {
            return response()->json([
                'error' => [
                    'code' => 'push.token_invalid',
                    'message_uz' => 'Push tokeni Expo formatida emas.',
                    'message_ru' => 'Push-токен не в формате Expo.',
                    'message_en' => 'The push token is not an Expo token.',
                ],
            ], 422);
        }

        $user = $request->user();

        $row = PushToken::query()->withoutGlobalScopes()->updateOrCreate(
            ['token' => $data['token']],
            [
                'tenant_id' => $user->tenant_id,
                'user_id' => $user->getKey(),
                // Staff rows carry both the foreign key and the pair. The pair
                // is what every sender queries by now that a guest's phone can
                // be in this table too — see `PushToken::reaching()`.
                'notifiable_type' => PushToken::OF_USER,
                'notifiable_id' => $user->getKey(),
                'platform' => $data['platform'],
                'surface' => $data['surface'],
                'device_name' => $data['device_name'] ?? null,
                'locale' => $data['locale'] ?? 'uz',
                'last_seen_at' => now(),
                'invalidated_at' => null,
            ],
        );

        return response()->json(['data' => ['id' => $row->id, 'registered_at' => $row->updated_at]], 201);
    }

    public function destroy(Request $request): JsonResponse
    {
        $data = $request->validate(['token' => ['required', 'string', 'max:128']]);

        PushToken::query()
            ->where('user_id', $request->user()->getKey())
            ->where('token', $data['token'])
            ->delete();

        return response()->json(null, 204);
    }
}
