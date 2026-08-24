<?php

declare(strict_types=1);

namespace Modules\Crm\Http\Controllers;

use App\Http\Controllers\Controller;
use App\Models\PushToken;
use App\Support\Push\GuestTokens;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Modules\Crm\Http\Middleware\RequireCustomerToken;

/**
 * A restaurant's own guest saying where their phone is.
 *
 * The customer app is the only surface that tells somebody their table's food
 * is ready or their delivery has left, and until now it had nowhere to register:
 * the core `POST /api/v1/push/tokens` sits behind `auth:sanctum` and stamps
 * `$request->user()`, and a CRM customer is not a `User` — no password, no
 * Spatie role, no roster.
 *
 * Unlike the marketplace's version of this endpoint, a customer IS inside a
 * restaurant, so the row is stamped with the tenant and written under the
 * policy in the ordinary way. `App\Support\Push\GuestTokens` holds both paths so
 * the two cannot drift.
 *
 * `surface` is decided by the route and is not a field a client may send.
 */
final class PublicPushTokenController extends Controller
{
    public function __construct(private readonly GuestTokens $tokens) {}

    /** POST /api/v1/public/push/tokens */
    public function store(Request $request): JsonResponse
    {
        $customer = RequireCustomerToken::of($request);

        /** @var array{token: string, platform: string, device_name?: string|null, locale?: string|null} $data */
        $data = $request->validate(GuestTokens::rules());

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

        $row = $this->tokens->register(
            PushToken::OF_CUSTOMER,
            $customer->getKey(),
            $customer->tenant_id,
            'customer',
            $data,
        );

        return response()->json(['data' => ['id' => $row->id, 'registered_at' => $row->updated_at]], 201);
    }

    /** DELETE /api/v1/public/push/tokens */
    public function destroy(Request $request): JsonResponse
    {
        $customer = RequireCustomerToken::of($request);

        $data = $request->validate(['token' => ['required', 'string', 'max:128']]);

        $this->tokens->forget(PushToken::OF_CUSTOMER, $customer->getKey(), $customer->tenant_id, $data['token']);

        return response()->json(null, 204);
    }
}
