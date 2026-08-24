<?php

declare(strict_types=1);

namespace Modules\Marketplace\Http\Controllers;

use App\Http\Controllers\Controller;
use App\Models\PushToken;
use App\Support\Push\GuestTokens;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Modules\Marketplace\Http\Middleware\RequireConsumerToken;

/**
 * A MyPOS shopper's phone, and where the courier notice is sent.
 *
 * Its own route rather than the core `POST /api/v1/push/tokens`, and the reason
 * is a database fact rather than tidiness: the core route sits behind
 * `auth:sanctum` + `tenant` and stamps the caller's `tenant_id` on the row. A
 * marketplace consumer has no tenant — they shop across forty restaurants — so
 * the core route cannot write their row at all, and `push_tokens` is behind a
 * fail-closed policy that refuses a null-tenant insert on a request that
 * resolved no tenant.
 *
 * `App\Support\Push\GuestTokens` holds the one INSERT that has to open the
 * connection, and holds it once so that CRM's customer route and this one cannot
 * drift.
 *
 * `surface` is not a field a client may send here. It is `mp`, decided by the
 * route — a consumer app claiming to be the crew app would put a shopper on the
 * list a manager's approvals go to.
 */
final class ConsumerPushController extends Controller
{
    public function __construct(private readonly GuestTokens $tokens) {}

    /** POST /api/v1/mp/push/tokens */
    public function store(Request $request): JsonResponse
    {
        $consumer = RequireConsumerToken::of($request);

        /** @var array{token: string, platform: string, device_name?: string|null, locale?: string|null} $data */
        $data = $request->validate(GuestTokens::rules());

        if (! PushToken::looksLikeExpoToken($data['token'])) {
            // The same envelope the core controller answers with. A token that
            // is not Expo's is a client bug, and one stored anyway is a device
            // the sender retries forever.
            return response()->json([
                'error' => [
                    'code' => 'push.token_invalid',
                    'message_uz' => 'Push tokeni Expo formatida emas.',
                    'message_ru' => 'Push-токен не в формате Expo.',
                    'message_en' => 'The push token is not an Expo token.',
                ],
            ], 422);
        }

        $row = $this->tokens->register(
            PushToken::OF_CONSUMER,
            $consumer->id,
            // Null, deliberately. See the class docblock.
            null,
            'mp',
            $data,
        );

        return response()->json(['data' => ['id' => $row->id, 'registered_at' => $row->updated_at]], 201);
    }

    /** DELETE /api/v1/mp/push/tokens */
    public function destroy(Request $request): JsonResponse
    {
        $consumer = RequireConsumerToken::of($request);

        $data = $request->validate(['token' => ['required', 'string', 'max:128']]);

        $this->tokens->forget(PushToken::OF_CONSUMER, $consumer->id, null, $data['token']);

        return response()->json(null, 204);
    }
}
