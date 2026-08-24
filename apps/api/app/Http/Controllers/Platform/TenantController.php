<?php

declare(strict_types=1);

namespace App\Http\Controllers\Platform;

use App\Http\Controllers\Controller;
use App\Http\Requests\Platform\ImpersonateRequest;
use App\Http\Requests\Platform\StorePlatformTenantRequest;
use App\Http\Requests\Platform\UpdatePlatformTenantRequest;
use App\Models\Branch;
use App\Models\Impersonation;
use App\Models\PlatformInvoice;
use App\Models\PlatformSetting;
use App\Models\Tenant;
use App\Models\User;
use App\Support\Errors\ApiException;
use App\Support\Tenancy\TenantProvisioner;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;

/**
 * The restaurants on the platform, from the operator's side.
 *
 * Everything here is cross-tenant, which is the reason the whole group sits
 * behind `role:super-admin` rather than a permission a restaurant could ever be
 * granted: an owner is an admin of their business, never of the product.
 */
final class TenantController extends Controller
{
    public function __construct(private readonly TenantProvisioner $provisioner) {}

    public function index(Request $request): JsonResponse
    {
        $tenants = Tenant::query()
            ->when($request->filled('status'), fn ($query) => $query->where('status', $request->string('status')))
            ->when($request->filled('plan'), fn ($query) => $query->where('plan_key', $request->string('plan')))
            ->orderBy('name')
            ->get();

        return response()->json([
            'data' => $tenants->map(fn (Tenant $tenant): array => $this->row($tenant))->all(),
        ]);
    }

    public function show(Tenant $tenant): JsonResponse
    {
        return response()->json(['data' => $this->row($tenant, detailed: true)]);
    }

    /**
     * Put a restaurant on the platform.
     *
     * The same call `restaurant:create-owner` makes — see
     * App\Support\Tenancy\TenantProvisioner for why there is exactly one
     * definition of what a new restaurant is.
     *
     * The owner's password comes back in this response and nowhere else, ever.
     * That is the same rule the pairing code follows, for the same reason: a
     * secret that can be fetched again is a secret with no owner.
     */
    public function store(StorePlatformTenantRequest $request): JsonResponse
    {
        if (! (bool) $this->platformSetting('signups', true)) {
            throw ApiException::detailed(
                'request.validation_failed',
                'Yangi restoran qabul qilish vaqtincha yopilgan.',
                'Приём новых ресторанов временно закрыт.',
                'New restaurant sign-ups are closed.',
                field: 'restaurant',
            );
        }

        $password = (string) ($request->validated('password') ?: TenantProvisioner::password());

        $result = $this->provisioner->create([
            'restaurant' => (string) $request->validated('restaurant'),
            'name' => (string) $request->validated('name'),
            'email' => (string) $request->validated('email'),
            'phone' => $request->validated('phone'),
            'password' => $password,
            'locale' => (string) ($request->validated('locale') ?? 'uz'),
            'timezone' => (string) ($request->validated('timezone') ?? 'Asia/Tashkent'),
            'country' => (string) ($request->validated('country') ?? 'UZ'),
            // The city the operator took on the call, which becomes the first
            // venue's city — the platform list reads it back off the venues.
            'city' => $request->validated('city'),
            'plan_key' => $request->validated('plan_key'),
            'trial_days' => (int) ($request->validated('trial_days') ?? $this->platformSetting('trialDays', 14)),
        ]);

        activity('platform.tenant')
            ->performedOn($result['tenant'])
            ->causedBy($request->user())
            ->withProperties(['slug' => $result['tenant']->slug])
            ->log('platform.tenant.created');

        return response()->json([
            'data' => $this->row($result['tenant'], detailed: true),
            'owner' => [
                'email' => $result['user']->email,
                // Once. There is no endpoint that will show it again.
                'password' => $password,
            ],
        ], Response::HTTP_CREATED);
    }

    /**
     * Suspend, resume, re-plan or annotate a restaurant.
     *
     * A suspended tenant keeps its data and loses its logins — that is
     * `ResolveTenant`'s existing rule, not a new one: it resolves only active
     * tenants, so the next request from anybody there is refused while every
     * row stays where it is.
     */
    public function update(UpdatePlatformTenantRequest $request, Tenant $tenant): JsonResponse
    {
        $before = ['status' => $tenant->status, 'plan_key' => $tenant->plan_key];

        $tenant->fill($request->validated())->save();

        activity('platform.tenant')
            ->performedOn($tenant)
            ->causedBy($request->user())
            ->withProperties(['from' => $before, 'to' => $request->validated()])
            ->log('platform.tenant.updated');

        return response()->json(['data' => $this->row($tenant->refresh(), detailed: true)]);
    }

    /**
     * Issue the owner a new password, and answer it once.
     *
     * There is no "show me the password" on this product and there cannot be:
     * `users.password` is a bcrypt hash, so the only honest answer to "what is
     * it" is a new one. This exists because the honest answer was previously
     * *nothing* — the password `POST /platform/tenants` prints is printed once,
     * and an operator who navigated away from that sheet, or who onboarded a
     * restaurant and was asked for the credentials a day later, had no way back
     * to it at all. The owner could not sign in, and neither could anybody help
     * them: `/forgot-password` needs a mailer, and this deployment runs
     * `MAIL_MAILER=log`.
     *
     * So: a generated password, never a typed one. An operator who could choose
     * it would choose the same one for every restaurant they open, and that
     * string would end up in a notebook next to a list of customer names.
     *
     * Every existing session for that account ends with it. A credential reset
     * that leaves the old sessions alive is not a reset — and the case this is
     * actually for is a login nobody has used yet, where there is nothing to
     * interrupt.
     *
     * The tenant's other staff are untouched. This is the owner's login, which
     * is the one the platform issued and the only one it is responsible for;
     * everybody else's PIN and password are the restaurant's own business, from
     * `staff/members`.
     */
    public function resetOwnerPassword(Request $request, Tenant $tenant): JsonResponse
    {
        $owner = $this->owner($tenant);

        if ($owner === null) {
            throw ApiException::detailed(
                'request.validation_failed',
                'Bu restoranda egasining hisobi yo\'q.',
                'В этом ресторане нет учётной записи владельца.',
                'This restaurant has no owner account.',
                field: 'tenant',
            );
        }

        $password = TenantProvisioner::password();

        $owner->forceFill(['password' => $password])->save();

        // Cast to `hashed` on the model, so what was just written is a hash and
        // `$password` is the only copy of the plain text in the world. Said out
        // loud because the next line throws away every session that was opened
        // with the old one, and the two together are the whole act.
        $owner->tokens()->delete();

        activity('platform.tenant')
            ->performedOn($tenant)
            ->causedBy($request->user())
            ->withProperties(['user_id' => $owner->id, 'email' => $owner->email])
            ->log('platform.owner.password_reset');

        return response()->json([
            'owner' => [
                'id' => $owner->id,
                'name' => $owner->name,
                'email' => $owner->email,
                'phone' => $owner->phone,
                // Once. Exactly like the create call, and for the same reason.
                'password' => $password,
            ],
        ]);
    }

    /**
     * Take a seat inside somebody else's restaurant, for fifteen minutes.
     *
     * The most powerful thing this product can do, so three things happen
     * before a token exists:
     *
     *  1. A reason is required. Not "recommended" — the column is NOT NULL and
     *     the request refuses an empty string. `tenant-list.tsx` says why in a
     *     sentence: "an untraceable impersonation is worse than none".
     *  2. The row is written first, inside the same request, so a token can
     *     never exist without the record that explains it.
     *  3. The token expires in fifteen minutes and carries `impersonated_by`,
     *     so every request it makes can be traced back to the operator rather
     *     than looking like the owner did it themselves.
     *
     * The operator can also be switched off entirely — `impersonation` in the
     * platform settings — which is the answer for a deployment whose customers
     * have not agreed to it.
     */
    public function impersonate(ImpersonateRequest $request, Tenant $tenant): JsonResponse
    {
        if (! (bool) $this->platformSetting('impersonation', true)) {
            throw ApiException::detailed(
                'auth.forbidden',
                'Bu platformada boshqa hisob nomidan kirish o\'chirilgan.',
                'Вход от имени другого аккаунта на этой платформе отключён.',
                'Impersonation is switched off on this platform.',
            );
        }

        $target = User::query()
            ->where('tenant_id', $tenant->id)
            ->when(
                $request->filled('user_id'),
                fn ($query) => $query->whereKey($request->integer('user_id')),
                fn ($query) => $query->whereHas('roles', fn ($roles) => $roles->where('name', 'owner')),
            )
            ->where('is_active', true)
            ->first();

        if ($target === null) {
            throw ApiException::detailed(
                'request.validation_failed',
                'Bu restoranda kiriladigan faol hisob yo\'q.',
                'В этом ресторане нет активной учётной записи для входа.',
                'This restaurant has no active account to sign in as.',
                field: 'user_id',
            );
        }

        $expiresAt = now()->addMinutes(Impersonation::MINUTES);

        // The record before the credential. If the token creation below failed
        // there would be a row with no session, which is harmless; the other
        // order gives a session with no row, which is the thing this table
        // exists to make impossible.
        $record = Impersonation::query()->create([
            'tenant_id' => $tenant->id,
            'operator_user_id' => $request->user()?->getAuthIdentifier(),
            'target_user_id' => $target->id,
            'reason' => (string) $request->validated('reason'),
            'expires_at' => $expiresAt,
            'ip' => $request->ip(),
        ]);

        $token = $target->createToken('impersonation', ['*'], $expiresAt);
        $record->forceFill(['token_id' => $token->accessToken->getKey()])->save();

        activity('platform.impersonation')
            ->performedOn($tenant)
            ->causedBy($request->user())
            ->withProperties([
                'target_user_id' => $target->id,
                'reason' => $record->reason,
                'expires_at' => $expiresAt->toIso8601String(),
                'ip' => $request->ip(),
            ])
            ->log('platform.impersonated');

        return response()->json([
            'impersonation' => [
                'id' => $record->id,
                'token' => $token->plainTextToken,
                'expires_at' => $expiresAt->toIso8601String(),
                'tenant' => ['id' => $tenant->id, 'slug' => $tenant->slug, 'name' => $tenant->name],
                'as' => ['id' => $target->id, 'name' => $target->name, 'email' => $target->email],
                'reason' => $record->reason,
                // What the console draws across the top of every screen for the
                // whole fifteen minutes. Sent by the server so the banner cannot
                // be forgotten by a client that did not read the docs.
                'banner' => "Siz {$tenant->name} nomidan kirgansiz",
            ],
        ], Response::HTTP_CREATED);
    }

    /**
     * Archive a restaurant. Never a hard delete.
     *
     * Every invoice, every audit row and every order ever taken points at this
     * id. Removing it would orphan the history the operator still has to answer
     * questions about — and the ninety-day window the console promises is a
     * window on data that still exists.
     */
    public function destroy(Request $request, Tenant $tenant): JsonResponse
    {
        $tenant->forceFill(['status' => 'archived'])->save();

        activity('platform.tenant')
            ->performedOn($tenant)
            ->causedBy($request->user())
            ->log('platform.tenant.archived');

        return response()->json(['data' => $this->row($tenant->refresh(), detailed: true)]);
    }

    /**
     * The account the platform issued when this restaurant was created.
     *
     * The oldest owner, not "an" owner: a business can promote a second one,
     * and the credentials the platform is answerable for belong to the first.
     */
    private function owner(Tenant $tenant): ?User
    {
        return User::query()
            ->where('tenant_id', $tenant->id)
            ->whereHas('roles', fn ($roles) => $roles->where('name', 'owner'))
            ->orderBy('id')
            ->first();
    }

    /**
     * @return array<string, mixed>
     */
    private function row(Tenant $tenant, bool $detailed = false): array
    {
        $owner = $this->owner($tenant);

        $row = [
            'id' => $tenant->slug,
            'tenant_id' => $tenant->id,
            'name' => $tenant->name,
            'slug' => $tenant->slug,
            'status' => $tenant->status,
            'plan' => $tenant->plan_key,
            'trial_ends_at' => $tenant->trial_ends_at?->toIso8601String(),
            'note' => $tenant->operator_note,
            'since' => $tenant->created_at?->toDateString(),
            'owner' => $owner === null ? null : [
                'id' => $owner->id,
                'name' => $owner->name,
                'email' => $owner->email,
                'phone' => $owner->phone,
            ],
        ];

        if (! $detailed) {
            return $row;
        }

        /*
         * The venues, with the two figures the platform actually knows about
         * them.
         *
         * `seats` is the venue's own settings document and `accounts` is how
         * many logins are assigned to it. Both are facts this application holds
         * about a customer's ACCOUNT, which is what an operator is answerable
         * for — they bill per active venue, and a venue with no logins on it is
         * a venue nobody has been onboarded into yet.
         *
         * A venue's TAKINGS are deliberately not here and should not be. That
         * is the restaurant's own money, it has no bearing on what they are
         * charged, and there is no contract that would let this controller
         * reach it without core reading another module's schema. The console
         * used to draw a revenue column here filled from a fixture keyed by the
         * demo slugs — so every real restaurant on the platform got somebody
         * else's numbers printed beside its venues.
         */
        $accounts = User::query()
            ->where('tenant_id', $tenant->id)
            ->whereNotNull('branch_id')
            ->selectRaw('branch_id, count(*) as total')
            ->groupBy('branch_id')
            ->pluck('total', 'branch_id');

        $row['branches'] = Branch::query()
            ->where('tenant_id', $tenant->id)
            ->orderBy('name')
            ->get()
            ->map(static fn (Branch $branch): array => [
                'id' => $branch->slug,
                'name' => $branch->name,
                'city' => $branch->city,
                'status' => $branch->status,
                'seats' => is_numeric($branch->settings['seats'] ?? null)
                    ? (int) $branch->settings['seats']
                    : null,
                'accounts' => (int) ($accounts[$branch->id] ?? 0),
            ])
            ->all();

        /*
         * The people, as they actually are.
         *
         * `last_login_at` rides along because the console's own list of them
         * used to print a relative time per person taken from a rotating list
         * of eight phrases — "14 daqiqa oldin", "2 soat oldin" — against names
         * taken from a fixture pool. For a restaurant that exists, that is an
         * invented staff list with invented activity, on the screen an operator
         * answers questions from. Null here means the account has never signed
         * in, and the console draws that as a fact rather than filling it in.
         */
        $row['users'] = User::query()
            ->where('tenant_id', $tenant->id)
            ->orderBy('name')
            ->get()
            ->map(static fn (User $user): array => [
                'id' => $user->id,
                'name' => $user->name,
                'role' => $user->getRoleNames()->first(),
                'is_active' => (bool) $user->is_active,
                'last_login_at' => $user->last_login_at?->toIso8601String(),
            ])
            ->all();

        $row['invoices'] = PlatformInvoice::query()
            ->where('tenant_id', $tenant->id)
            ->orderByDesc('period')
            ->limit(12)
            ->get()
            ->map(static fn (PlatformInvoice $invoice): array => [
                'id' => $invoice->number,
                'amount_tiyin' => (int) $invoice->amount_tiyin,
                'issued_on' => $invoice->issued_on->toDateString(),
                'status' => $invoice->status,
                'attempts' => (int) $invoice->attempts,
            ])
            ->all();

        return $row;
    }

    private function platformSetting(string $key, mixed $default): mixed
    {
        $stored = PlatformSetting::query()->find($key);

        return $stored === null ? $default : $stored->value;
    }
}
