<?php

declare(strict_types=1);

namespace Modules\Crm\Http\Controllers;

use App\Contracts\Messaging\BotDirectory;
use App\Http\Controllers\Controller;
use App\Support\Errors\ApiException;
use App\Support\Telegram\InitData;
use App\Support\Tenancy\TenantContext;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Modules\Crm\Http\Resources\CustomerProfileResource;
use Modules\Crm\Models\Customer;

/**
 * Signing in from inside Telegram — POST /api/v1/public/telegram/session.
 *
 * The mini app is handed a signed `initData` by Telegram itself. Verified
 * against the restaurant's own bot token, it says who is holding the phone
 * as firmly as an SMS code does, and without sending one: no Eskiz account,
 * no cost, no waiting. That is why the points screen and the order tracker
 * inside Telegram were the last two surfaces still showing sample data — the
 * platform had the token all along and nothing read it.
 *
 * A restaurant that has not connected a bot gets a named refusal rather than
 * a broken screen: the mini app then says so, which is true and actionable
 * (the owner pastes a token under settings → Telegram).
 */
final class PublicTelegramAuthController extends Controller
{
    public function __invoke(Request $request, TenantContext $tenants, BotDirectory $bots): JsonResponse
    {
        $request->validate(['init_data' => ['required', 'string', 'max:4096']]);

        $tenantId = $tenants->id();

        if ($tenantId === null) {
            throw ApiException::of('tenant.required');
        }

        $token = $bots->signingToken($tenantId);

        if ($token === null) {
            throw ApiException::detailed(
                'telegram.not_configured',
                'Bu restoran hali Telegram botini ulamagan.',
                'Этот ресторан ещё не подключил Telegram-бота.',
                'This restaurant has not connected a Telegram bot yet.',
                field: 'init_data',
            );
        }

        $data = InitData::verify((string) $request->string('init_data'), $token);

        if ($data === null) {
            // One refusal for forged, stale and malformed alike: telling them
            // apart would tell a forger which half they got right.
            throw ApiException::detailed(
                'telegram.invalid_init_data',
                'Telegram ma\'lumoti tasdiqlanmadi. Mini ilovani qaytadan oching.',
                'Данные Telegram не подтверждены. Откройте мини-приложение заново.',
                'Telegram could not be verified. Open the mini app again.',
                field: 'init_data',
            );
        }

        $guest = Customer::query()->firstOrNew(['telegram_user_id' => $data->userId]);

        if (! $guest->exists) {
            $guest->fill([
                'tenant_id' => $tenantId,
                'telegram_user_id' => $data->userId,
                'name' => $data->displayName(),
                'locale' => in_array($data->languageCode, ['uz', 'ru', 'en'], true) ? $data->languageCode : null,
                'is_active' => true,
            ])->save();
        } elseif ($guest->name === null && $data->displayName() !== null) {
            // A guest who set a name in Telegram after their first visit.
            $guest->forceFill(['name' => $data->displayName()])->save();
        }

        if (! $guest->is_active) {
            throw ApiException::of('crm.customer_blocked');
        }

        $expiresAt = now()->addDays(max(1, (int) config('auth.otp.token_days', 90)));

        $issued = $guest->createToken(
            name: 'telegram-mini-app',
            abilities: ['customer'],
            expiresAt: $expiresAt,
        );

        return response()->json([
            'token' => $issued->plainTextToken,
            'expires_at' => $expiresAt->toIso8601String(),
            'data' => (new CustomerProfileResource($guest->load('addresses')))->resolve($request),
        ], 201);
    }
}
