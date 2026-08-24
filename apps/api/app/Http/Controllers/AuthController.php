<?php

declare(strict_types=1);

namespace App\Http\Controllers;

use App\Http\Requests\Auth\LoginRequest;
use App\Http\Requests\Auth\RegisterRequest;
use App\Http\Resources\UserResource;
use App\Models\Tenant;
use App\Models\User;
use App\Support\Tenancy\BranchContext;
use App\Support\Tenancy\DatabaseTenancy;
use App\Support\Tenancy\TenantContext;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

/**
 * The front door.
 *
 * Two audiences, one controller:
 *   - a new restaurant signing up (`register` creates the tenant and its owner)
 *   - everyone signing in afterwards
 *
 * Every client — the staff console, a POS tablet, the mobile app, a Telegram
 * WebApp — gets a bearer token. The web SPA additionally has a session via
 * Sanctum's stateful domains, but the token path is what makes one auth
 * implementation serve all of them.
 */
final class AuthController extends Controller
{
    public function __construct(private readonly DatabaseTenancy $database) {}

    /**
     * Sign a new restaurant up.
     *
     * Tenant and owner are created in one transaction: a tenant with no owner
     * is unreachable, and an owner with no tenant can see nothing. Half of this
     * succeeding is worse than none of it.
     */
    public function register(RegisterRequest $request): JsonResponse
    {
        $data = $request->validated();

        $result = DB::transaction(function () use ($data): array {
            $tenant = Tenant::query()->create([
                'name' => $data['restaurant_name'],
                'slug' => $this->uniqueSlug($data['restaurant_name']),
                'country_code' => $data['country_code'] ?? 'UZ',
                'locale' => $data['locale'] ?? 'uz',
                'timezone' => $data['timezone'] ?? 'Asia/Tashkent',
                'status' => 'active',
                'settings' => [
                    'currency' => 'UZS',
                    'service_charge_percent' => 0,
                    'vat_percent' => 12,
                    'business_day_starts_at' => '06:00',
                    'channels' => ['dine_in', 'takeaway', 'delivery'],
                ],
            ]);

            /*
             * The request now has a restaurant, so say so before writing
             * anything that belongs to it.
             *
             * Registration is the one request that arrives with no tenant and
             * legitimately ends with one. Everything after this line — the
             * owner's row, their role, and the audit entries the model events
             * write for both — belongs to the restaurant that was just created;
             * without the claim, row-level security refuses the audit insert
             * and a sign-up answers 500 after having created the tenant.
             */
            $this->database->focus($tenant->id);
            app(TenantContext::class)->set($tenant);

            $user = User::query()->create([
                'tenant_id' => $tenant->id,
                'name' => $data['name'],
                'email' => $data['email'],
                'phone' => $data['phone'] ?? null,
                'password' => $data['password'],
                'locale' => $data['locale'] ?? 'uz',
                'is_active' => true,
                'email_verified_at' => now(),
            ]);

            // Whoever signs the restaurant up owns it.
            $user->assignRole('owner');

            return ['tenant' => $tenant, 'user' => $user];
        });

        /** @var User $user */
        $user = $result['user'];
        /** @var Tenant $tenant */
        $tenant = $result['tenant'];

        return response()->json([
            'token' => $user->createToken('registration')->plainTextToken,
            'user' => new UserResource($user->load('tenant')),
            'tenant' => [
                'id' => $tenant->id,
                'name' => $tenant->name,
                'slug' => $tenant->slug,
            ],
        ], 201);
    }

    /**
     * How many accounts one address is allowed to be weighed against.
     *
     * An address is meant to identify exactly one account — `Rule::unique`
     * guards both doors that create one — so in a healthy database this loop
     * runs once. The cap is here because bcrypt is deliberately slow: without
     * it, a table that somehow held fifty rows on one address would turn every
     * sign-in attempt at that address into fifty verifications, which is a free
     * amplifier pointed at the login endpoint.
     */
    private const LOGIN_CANDIDATES = 4;

    /**
     * Sign in.
     *
     * The failure message never distinguishes "no such account" from "wrong
     * password" — telling an attacker which emails exist is a free gift.
     *
     * The password decides WHICH account, not just whether. That reads like
     * over-engineering until you look at the index: `StorePlatformTenantRequest`
     * and `InviteOperatorRequest` both refuse an address already on the
     * platform, but the column's own constraint is `unique(tenant_id, email)` —
     * so a row created outside those two doors, from a console or a seeder, can
     * share one, and Postgres treats a null `tenant_id` as distinct from every
     * other null besides.
     *
     * This deployment has exactly that: a restaurant owner and the platform
     * operator who onboarded them, on one gmail. With a bare `->first()` and no
     * `ORDER BY`, which row answers is whichever the heap hands back first —
     * and that changes the moment either row is UPDATED, because the new tuple
     * version goes to the end of the table. So one password reset, on the other
     * account, silently moved a working sign-in to a different identity. Nobody
     * touched the login; it simply started answering with somebody else.
     *
     * Ordering alone would only make the wrong answer stable. Weighing the
     * password against each candidate answers the question actually being
     * asked — *which of these accounts did this person prove they hold* — and a
     * password that matches none is the same refusal as before.
     */
    public function login(LoginRequest $request): JsonResponse
    {
        $data = $request->validated();

        $candidates = User::query()
            ->when(
                isset($data['email']),
                fn ($query) => $query->where('email', $data['email']),
                fn ($query) => $query->byPhone((string) $data['phone']),
            )
            // Oldest first, so a duplicate answers the same way twice and the
            // account that held the address first keeps it.
            ->orderBy('id')
            ->limit(self::LOGIN_CANDIDATES)
            ->get();

        $user = $candidates->first(
            static fn (User $candidate): bool => Hash::check($data['password'], $candidate->password),
        );

        if ($user === null) {
            throw ValidationException::withMessages([
                'email' => ["Login yoki parol noto'g'ri."],
            ]);
        }

        if (! $user->is_active) {
            throw ValidationException::withMessages([
                'email' => ['Bu hisob faolsizlantirilgan. Menejeringizga murojaat qiling.'],
            ]);
        }

        // Old tokens die on a fresh sign-in from the same device name, so a
        // lost tablet cannot keep transacting after the staff re-pair it.
        $deviceName = $data['device_name'] ?? 'web';
        $user->tokens()->where('name', $deviceName)->delete();

        $user->forceFill(['last_login_at' => now()])->save();

        return response()->json([
            'token' => $user->createToken($deviceName)->plainTextToken,
            'user' => new UserResource($user->load('tenant')),
        ]);
    }

    /** The account behind the current token. */
    public function me(Request $request): UserResource
    {
        /** @var User $user */
        $user = $request->user();

        return new UserResource($user->load('tenant'));
    }

    /** Sign out of this device only; other sessions keep working. */
    public function logout(Request $request): JsonResponse
    {
        $token = $request->user()?->currentAccessToken();

        // A session-authenticated SPA has no personal access token to delete.
        if ($token !== null && method_exists($token, 'delete')) {
            $token->delete();
        }

        return response()->json(['message' => 'Chiqdingiz.']);
    }

    /**
     * Which restaurant the current request is operating in, and what this user
     * may do in it. The clients use this instead of guessing from the token.
     */
    public function context(Request $request, TenantContext $context, BranchContext $branches): JsonResponse
    {
        /** @var User $user */
        $user = $request->user();

        return response()->json([
            'user' => new UserResource($user),
            'tenant' => $context->hasTenant() ? [
                'id' => $context->id(),
                'name' => $context->tenant()?->name,
                'slug' => $context->tenant()?->slug,
                'locale' => $context->tenant()?->locale,
                'timezone' => $context->tenant()?->timezone,
                'settings' => $context->tenant()?->settings ?? [],
            ] : null,
            /*
             * The venue this request resolved to, and whether the client may
             * change it. `branch` is null for someone reading the whole group,
             * which is a state the switcher has to render ("Barcha filiallar")
             * rather than treat as missing data.
             */
            'branch' => $branches->hasBranch() ? [
                'id' => $branches->id(),
                'name' => $branches->branch()?->name,
                'slug' => $branches->branch()?->slug,
                'code' => $branches->branch()?->code,
                'timezone' => $branches->branch()?->timezone,
            ] : null,
            'branch_pinned' => $user->branch_id !== null,
            'roles' => $user->getRoleNames(),
            'permissions' => $user->getAllPermissions()->pluck('name'),
        ]);
    }

    /**
     * A slug nobody else holds.
     *
     * Two restaurants may genuinely share a name ("Osh Markazi" is not rare),
     * and the slug is a routing key — a collision would send one restaurant's
     * subdomain to another's data.
     */
    private function uniqueSlug(string $name): string
    {
        $base = Str::slug($name) ?: 'restoran';
        $slug = $base;
        $suffix = 2;

        while (Tenant::query()->where('slug', $slug)->exists()) {
            $slug = $base.'-'.$suffix;
            $suffix++;
        }

        return Str::limit($slug, 64, '');
    }
}
