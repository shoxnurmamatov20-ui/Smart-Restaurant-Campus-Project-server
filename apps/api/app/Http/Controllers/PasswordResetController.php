<?php

declare(strict_types=1);

namespace App\Http\Controllers;

use App\Models\User;
use App\Support\Tenancy\TenantContext;
use Illuminate\Auth\Events\PasswordReset;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Password;
use Illuminate\Validation\Rules\Password as PasswordRule;

/**
 * Forgot / reset, for the console's email accounts.
 *
 * Two doors, both unauthenticated by definition, both on the sign-in throttle.
 *
 * `forgot` answers 204 whether or not the address exists. The alternative —
 * "no such account" — is an oracle: it lets anyone list which of a
 * restaurant's staff have accounts by typing names into a form. The mail goes
 * only where there is an account; the response never says.
 *
 * `reset` consumes the token Laravel's broker issued (sixty minutes, one use,
 * `password_reset_tokens`) and revokes every session the old password had
 * opened — a reset that left the attacker's session alive would be a reset
 * that changed nothing.
 *
 * Tenant-scoped like login: `X-Tenant` names the restaurant, so two
 * restaurants may each have an `owner@…` without the mail going to the wrong
 * one. `users` sits outside row-level security (it is read before a tenant is
 * known), so the scope is applied by hand here.
 */
final class PasswordResetController extends Controller
{
    public function forgot(Request $request): JsonResponse
    {
        $data = $request->validate(['email' => ['required', 'email', 'max:190']]);

        $tenantId = app(TenantContext::class)->tenant()?->id;

        $user = User::query()
            ->withoutGlobalScopes()
            ->where('email', $data['email'])
            ->when($tenantId !== null, fn ($q) => $q->where('tenant_id', $tenantId))
            ->first();

        if ($user !== null) {
            Password::broker()->sendResetLink(['email' => $user->email], function ($user, string $token): void {
                $user->sendPasswordResetNotification($token);
            });
        }

        return response()->json(null, 204);
    }

    public function reset(Request $request): JsonResponse
    {
        $data = $request->validate([
            'email' => ['required', 'email', 'max:190'],
            'token' => ['required', 'string', 'max:200'],
            'password' => ['required', 'confirmed', PasswordRule::min(10)->letters()->numbers()],
        ]);

        $status = Password::broker()->reset(
            ['email' => $data['email'], 'token' => $data['token'], 'password' => $data['password'], 'password_confirmation' => $data['password']],
            function (User $user, string $password): void {
                $user->forceFill(['password' => Hash::make($password)])->save();
                $user->tokens()->delete();
                event(new PasswordReset($user));
            },
        );

        if ($status !== Password::PASSWORD_RESET) {
            return response()->json([
                'error' => [
                    'code' => 'auth.reset_token_invalid',
                    'message_uz' => 'Havola eskirgan yoki noto‘g‘ri. Yangisini so‘rang.',
                    'message_ru' => 'Ссылка устарела или неверна. Запросите новую.',
                    'message_en' => 'The link has expired or is wrong. Ask for a new one.',
                ],
            ], 422);
        }

        return response()->json(null, 204);
    }
}
