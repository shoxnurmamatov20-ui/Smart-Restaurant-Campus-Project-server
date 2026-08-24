<?php

declare(strict_types=1);

namespace App\Http\Controllers\Platform;

use App\Http\Controllers\Controller;
use App\Http\Requests\Platform\InviteOperatorRequest;
use App\Models\User;
use App\Support\Tenancy\TenantProvisioner;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Response;

/**
 * The people who run the platform.
 *
 * An operator is defined by two things at once — `super-admin` and no tenant —
 * and both halves matter. A super-admin who belonged to a restaurant would be
 * scoped to it by `ResolveTenant` like anybody else, which is a support person
 * who cannot see the customer they were hired to help.
 */
final class TeamController extends Controller
{
    public function index(): JsonResponse
    {
        $operators = User::query()
            ->whereNull('tenant_id')
            ->whereHas('roles', fn ($roles) => $roles->where('name', 'super-admin'))
            ->orderBy('name')
            ->get();

        return response()->json([
            'data' => $operators->map(static function (User $user): array {
                $seen = $user->last_login_at;

                return [
                    'id' => (string) $user->id,
                    'name' => $user->name,
                    'email' => $user->email,
                    // Minutes, not a phrase. One locale decides how to say
                    // "14 minutes ago", and it is not this one.
                    'last_seen_minutes' => $seen === null ? null : (int) $seen->diffInMinutes(now()),
                    'two_factor' => $user->two_factor_confirmed_at !== null,
                    'is_active' => (bool) $user->is_active,
                ];
            })->all(),
        ]);
    }

    /**
     * Add an operator.
     *
     * The password comes back once, exactly like a new restaurant's owner: this
     * is a private deployment where an operator is created by another operator,
     * not a self-signup flow with an email round trip.
     *
     * Two-factor is NOT enrolled here, and that is on purpose — `admin/login`
     * requires a TOTP code, so the new account cannot sign in until somebody
     * enrols one. A door that could be opened with a password alone is not the
     * platform door.
     */
    public function store(InviteOperatorRequest $request): JsonResponse
    {
        $password = TenantProvisioner::password();

        $operator = User::query()->create([
            'tenant_id' => null,
            'name' => (string) $request->validated('name'),
            'email' => (string) $request->validated('email'),
            'password' => $password,
            'locale' => (string) ($request->validated('locale') ?? 'uz'),
            'is_active' => true,
            'email_verified_at' => now(),
        ]);

        $operator->assignRole('super-admin');

        activity('identity.user')
            ->performedOn($operator)
            ->causedBy($request->user())
            ->log('platform.operator.invited');

        return response()->json([
            'data' => ['id' => $operator->id, 'email' => $operator->email],
            // Once, and never fetchable again.
            'password' => $password,
            'next' => 'TOTP hali yoqilmagan — hisob kirishdan oldin ikkinchi omilni ro\'yxatdan o\'tkazishi shart.',
        ], Response::HTTP_CREATED);
    }
}
