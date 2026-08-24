<?php

declare(strict_types=1);

namespace App\Support\Push;

use App\Models\PushToken;
use App\Support\Tenancy\DatabaseTenancy;
use Illuminate\Validation\Rule;
use Illuminate\Validation\Rules\In;

/**
 * Registering the phone of somebody who is not a member of staff.
 *
 * Two modules need this and neither may import the other, so it lives here
 * beside the model it writes. CRM registers a restaurant's own customer;
 * Marketplace registers a MyPOS shopper. The difference between them is one
 * word and one connection setting, and both are handled below rather than
 * copied into two controllers that would then drift.
 *
 * ---------------------------------------------------------------------------
 * Why the marketplace write has to open the connection
 *
 * `public.push_tokens` carries `tenant_id` behind a fail-closed
 * row-level-security policy. A restaurant's customer is INSIDE a restaurant, so
 * their row is stamped and the policy is satisfied in the ordinary way. A MyPOS
 * consumer belongs to the platform and has no tenant at all — the same fact that
 * keeps `Idempotency-Key` off every route on that surface — so a null-tenant
 * insert on a request that resolved no tenant is refused by WITH CHECK, and the
 * guest is told the platform is broken when all they did was allow
 * notifications.
 *
 * `withoutTenancy()` is therefore used for exactly that one case, for exactly
 * one INSERT, and never for a read. The row it writes is visible only under a
 * bypass, which is what a queue worker already runs with.
 */
final readonly class GuestTokens
{
    public function __construct(private DatabaseTenancy $database) {}

    /**
     * The rules every one of these endpoints validates against.
     *
     * Shared so that a third guest surface cannot invent a fourth spelling of
     * `platform`. `surface` is NOT here: it is decided by the route rather than
     * by the client — a customer app claiming to be the crew app would put a
     * guest on the list a manager's approval pages go to.
     *
     * @return array<string, list<In|string>>
     */
    public static function rules(): array
    {
        return [
            'token' => ['required', 'string', 'max:128'],
            'platform' => ['required', Rule::in(['ios', 'android'])],
            'device_name' => ['nullable', 'string', 'max:120'],
            'locale' => ['nullable', Rule::in(['uz', 'ru', 'en'])],
        ];
    }

    /**
     * Write the row, moving it if this handset was registered to somebody else.
     *
     * `token` is unique — Expo issues one per app install rather than per person
     * — so a phone signed out of and back into a different account MOVES rather
     * than gaining a second row. Anything else leaves the first person's
     * notifications arriving on a handset they no longer hold.
     *
     * @param string $type One of `PushToken::OF_*`.
     * @param int|null $tenantId Null for a marketplace consumer; the restaurant for a CRM customer.
     * @param array{token: string, platform: string, device_name?: string|null, locale?: string|null} $data
     */
    public function register(string $type, int $id, ?int $tenantId, string $surface, array $data): PushToken
    {
        $write = static fn (): PushToken => PushToken::query()->withoutGlobalScopes()->updateOrCreate(
            ['token' => $data['token']],
            [
                'tenant_id' => $tenantId,
                // Cleared, not left behind. A handset that used to be a
                // waiter's and is now a guest's must stop receiving the
                // waiter's pages the moment it says so.
                'user_id' => null,
                'notifiable_type' => $type,
                'notifiable_id' => $id,
                'platform' => $data['platform'],
                'surface' => $surface,
                'device_name' => $data['device_name'] ?? null,
                'locale' => $data['locale'] ?? 'uz',
                'last_seen_at' => now(),
                'invalidated_at' => null,
            ],
        );

        return $tenantId === null ? $this->database->withoutTenancy($write) : $write();
    }

    /** The same handset saying it can no longer be reached. */
    public function forget(string $type, int $id, ?int $tenantId, string $token): void
    {
        $delete = static function () use ($type, $id, $token): void {
            PushToken::query()
                ->withoutGlobalScopes()
                ->where('notifiable_type', $type)
                ->where('notifiable_id', $id)
                ->where('token', $token)
                ->delete();
        };

        if ($tenantId === null) {
            $this->database->withoutTenancy($delete);

            return;
        }

        $delete();
    }
}
