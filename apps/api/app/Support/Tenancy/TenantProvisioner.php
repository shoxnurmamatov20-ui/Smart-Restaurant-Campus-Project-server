<?php

declare(strict_types=1);

namespace App\Support\Tenancy;

use App\Models\Branch;
use App\Models\PlatformPlan;
use App\Models\Tenant;
use App\Models\User;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/**
 * Putting a restaurant on the platform — once, in one place.
 *
 * There were two ways to do this and they had already diverged in intent:
 * `restaurant:create-owner` on a server, and `POST /platform/tenants` from the
 * console, which did not exist yet. Writing the second one next to the first
 * would have meant two definitions of "a new restaurant" — one that seeds the
 * settings document and one that forgets to, with the difference showing up
 * months later as a venue whose receipts have no VAT line.
 *
 * So the command calls this, and so does the endpoint. The command keeps what
 * only a command can do — printing a generated password to a terminal exactly
 * once — and this keeps what a restaurant IS.
 */
final readonly class TenantProvisioner
{
    public function __construct(private DatabaseTenancy $database) {}

    /**
     * Create the restaurant, its first venue-less owner account, and its trial.
     *
     * @param array{
     *     restaurant: string,
     *     name: string,
     *     email: string,
     *     phone?: string|null,
     *     password: string,
     *     locale?: string,
     *     timezone?: string,
     *     country?: string,
     *     city?: string|null,
     *     plan_key?: string|null,
     *     trial_days?: int|null,
     * } $input
     *
     * @return array{tenant: Tenant, user: User, branch: Branch}
     */
    public function create(array $input): array
    {
        $locale = $input['locale'] ?? 'uz';

        /*
         * Outside tenancy, and it has to be.
         *
         * The caller is either a console command with no tenant context or the
         * platform operator, whose connection already bypasses — but a
         * super-admin who happened to send `X-Tenant` would be FOCUSED on that
         * restaurant, and the insert of a row carrying a different tenant_id is
         * exactly what the WITH CHECK half of the policy refuses. Saying it out
         * loud here means the endpoint cannot be broken by a stray header.
         */
        return $this->database->withoutTenancy(fn (): array => DB::transaction(function () use ($input, $locale): array {
            $tenant = Tenant::query()->create([
                'name' => $input['restaurant'],
                'slug' => $this->uniqueSlug($input['restaurant']),
                'country_code' => strtoupper($input['country'] ?? 'UZ'),
                'locale' => $locale,
                'timezone' => $input['timezone'] ?? 'Asia/Tashkent',
                'status' => 'active',
                'plan_key' => $input['plan_key'] ?? $this->cheapestPlanKey(),
                'trial_ends_at' => ($input['trial_days'] ?? 0) > 0
                    ? now()->addDays((int) $input['trial_days'])
                    : null,
                /*
                 * The settings document, seeded rather than left null.
                 *
                 * Every one of these has a reader on day one — the bill totals
                 * want VAT and the service charge, the till wants the rounding
                 * note, the Z report wants the business-day boundary — and a
                 * null document means each of them silently falls back to its
                 * own idea of a default. Written here, they are one idea.
                 */
                'settings' => [
                    'currency' => 'UZS',
                    'service_charge_percent' => 0,
                    'vat_percent' => 12,
                    'cash_rounding_tiyin' => 100000,
                    'business_day_starts_at' => '06:00',
                    'channels' => ['dine_in', 'takeaway', 'delivery'],
                    'locale' => $locale,
                ],
            ]);

            $user = User::query()->create([
                'tenant_id' => $tenant->id,
                'name' => $input['name'],
                'email' => $input['email'],
                'phone' => $input['phone'] ?? null,
                'password' => $input['password'],
                'locale' => $locale,
                'is_active' => true,
                // Verified on creation: an operator typed this address off a
                // signed contract, and an owner locked out of their own new
                // restaurant by a verification email is a support call on day
                // one.
                'email_verified_at' => now(),
            ]);

            $user->assignRole('owner');

            /*
             * And the first venue, because a restaurant without one cannot
             * trade.
             *
             * `branch_id` is on everything that happens at an address — a
             * table, a staff member, a till shift, a kitchen ticket — so a
             * tenant provisioned without a branch opens a console where the
             * staff screen will not save, the floor plan has nowhere to draw
             * and the POS cannot pair. That is exactly how the first real
             * restaurant on this platform was handed over, and the owner's
             * branch switcher then showed the demo restaurant's five venues,
             * because an empty list fell back to a fixture.
             *
             * One venue, named after the business, in the city the operator
             * took down on the call. The owner renames it and adds the second
             * from `settings/branches`; what matters is that the console is
             * usable the minute they sign in.
             */
            $branch = Branch::query()->create([
                'tenant_id' => $tenant->id,
                'name' => $input['restaurant'],
                'slug' => 'markaziy',
                'code' => 'M1',
                'city' => $input['city'] ?? null,
                'timezone' => $tenant->timezone,
                'status' => 'active',
                'opened_at' => now(),
                'settings' => ['seats' => null],
            ]);

            return ['tenant' => $tenant, 'user' => $user, 'branch' => $branch];
        }));
    }

    /** A password nobody chose, for the cases where nobody supplied one. */
    public static function password(): string
    {
        return Str::password(16);
    }

    private function cheapestPlanKey(): ?string
    {
        $plan = PlatformPlan::query()
            ->where('is_active', true)
            ->orderBy('price_tiyin')
            ->first();

        return $plan?->key;
    }

    /**
     * Slugs identify a restaurant in the `X-Tenant` header and on its
     * subdomain, so a collision would route two businesses to one another.
     */
    private function uniqueSlug(string $name): string
    {
        $base = Str::slug($name) ?: 'restoran';
        $slug = $base;
        $suffix = 2;

        while (Tenant::query()->where('slug', $slug)->exists()) {
            $slug = "{$base}-{$suffix}";
            $suffix++;
        }

        return $slug;
    }
}
