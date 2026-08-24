<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Models\Activity;
use App\Models\Branch;
use App\Models\Impersonation;
use App\Models\PlatformInvoice;
use App\Models\PlatformPlan;
use App\Models\Tenant;
use App\Models\User;
use App\Support\Tenancy\TenantContext;
use Database\Seeders\PlatformSeeder;
use Database\Seeders\RolesAndPermissionsSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

/**
 * The platform console, and the one thing it must never do.
 *
 * `platform-data.ts` names the test before the endpoint existed: the overview
 * is "the one endpoint on the product that must run outside the tenant scope,
 * and therefore the one that needs its own authorisation test: a request
 * carrying an owner's token must be refused here even though that owner is an
 * admin of their own restaurant."
 *
 * That refusal is asserted first and against every route, not against a sample.
 * A permission model with one hole is a permission model.
 */
final class PlatformConsoleTest extends TestCase
{
    use RefreshDatabase;

    private Tenant $tenant;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(RolesAndPermissionsSeeder::class);

        $this->tenant = Tenant::query()->create([
            'name' => 'Choyxona 24',
            'slug' => 'choyxona-24',
            'country_code' => 'UZ',
            'locale' => 'uz',
            'timezone' => 'Asia/Tashkent',
            'status' => 'active',
            'plan_key' => 'growth',
        ]);

        $this->seed(PlatformSeeder::class);
    }

    private function operator(): User
    {
        // tenant_id null AND super-admin. Both halves: an operator who belonged
        // to a restaurant would be scoped to it by ResolveTenant like anybody
        // else — a support person who cannot see the customer.
        $user = User::factory()->create(['tenant_id' => null, 'email' => 'ops@smartrest.uz']);
        $user->assignRole('super-admin');

        return $user->fresh();
    }

    private function restaurantOwner(): User
    {
        $user = User::factory()->create(['tenant_id' => $this->tenant->id]);
        $user->assignRole('owner');

        return $user->fresh();
    }

    // ============ The wall ============

    /**
     * @return list<array{0: string, 1: string}>
     */
    private function everyPlatformRoute(): array
    {
        return [
            ['get', '/api/v1/platform/overview'],
            ['get', '/api/v1/platform/tenants'],
            ['post', '/api/v1/platform/tenants'],
            ['get', '/api/v1/platform/plans'],
            ['get', '/api/v1/platform/billing'],
            ['get', '/api/v1/platform/terminals'],
            ['get', '/api/v1/platform/sign-ins'],
            ['get', '/api/v1/platform/health'],
            ['get', '/api/v1/platform/releases'],
            ['get', '/api/v1/platform/issues'],
            ['get', '/api/v1/platform/settings'],
            ['get', '/api/v1/platform/team'],
        ];
    }

    public function test_a_restaurant_owner_is_refused_everywhere_on_the_platform(): void
    {
        $this->actingAs($this->restaurantOwner());

        foreach ($this->everyPlatformRoute() as [$method, $uri]) {
            $this->json(strtoupper($method), $uri)->assertStatus(403);
        }
    }

    public function test_the_operator_reaches_the_overview_and_it_counts_real_rows(): void
    {
        Branch::query()->create([
            'tenant_id' => $this->tenant->id, 'name' => 'Chilonzor', 'slug' => 'chilonzor',
            'timezone' => 'Asia/Tashkent', 'status' => 'active',
        ]);

        $this->actingAs($this->operator());

        $this->getJson('/api/v1/platform/overview')
            ->assertOk()
            ->assertJsonPath('data.tenants', 1)
            ->assertJsonPath('data.branches_active', 1)
            // Plan × active venues — the same arithmetic the invoice uses, so
            // the dashboard and the bill cannot disagree.
            ->assertJsonPath('data.mrr_tiyin', 690_000_000);
    }

    // ============ Creating a restaurant ============

    public function test_the_operator_puts_a_restaurant_on_the_platform(): void
    {
        $this->actingAs($this->operator());

        $response = $this->postJson('/api/v1/platform/tenants', [
            'restaurant' => 'Lavash Uyi',
            'name' => 'Dilshod Rasulov',
            'email' => 'dilshod@lavash.uz',
            'plan_key' => 'start',
        ])->assertCreated();

        $slug = $response->json('data.slug');
        $created = Tenant::query()->where('slug', $slug)->firstOrFail();

        // The settings document is seeded by the provisioner, not left null:
        // every one of these has a reader on day one, and a null document means
        // each falls back to its own idea of a default.
        $this->assertSame(12, $created->setting('vat_percent'));
        $this->assertSame('UZS', $created->setting('currency'));

        // The owner exists and is an owner. Password once, in this response.
        $this->assertNotNull($response->json('owner.password'));
        $owner = User::query()->where('email', 'dilshod@lavash.uz')->firstOrFail();
        $this->assertTrue($owner->hasRole('owner'));

        /*
         * And a venue, because a restaurant without one cannot do anything.
         *
         * `branch_id` is on every table, every staff member, every till shift
         * and every kitchen ticket. The first real restaurant onboarded here
         * was provisioned without a branch: its owner opened the staff screen,
         * could not save an employee, and the header offered them the demo
         * restaurant's five venues. One venue, named after the business, in
         * the city the operator took on the call.
         */
        $branch = Branch::query()->where('tenant_id', $created->id)->firstOrFail();
        $this->assertSame('Lavash Uyi', $branch->name);
        $this->assertSame('active', $branch->status);
        $this->assertSame($created->timezone, $branch->timezone);
    }

    public function test_the_city_the_operator_took_on_the_call_lands_on_that_venue(): void
    {
        // The tenant has no address column — the platform list reads the city
        // off the venues — so the form's city has exactly one place to go.
        $this->actingAs($this->operator());

        $slug = $this->postJson('/api/v1/platform/tenants', [
            'restaurant' => 'Termiz Milliy',
            'name' => 'Sardor Qodirov',
            'email' => 'sardor@termiz.uz',
            'city' => 'Termiz',
        ])->assertCreated()->json('data.slug');

        $created = Tenant::query()->where('slug', $slug)->firstOrFail();

        $this->assertSame('Termiz', Branch::query()->where('tenant_id', $created->id)->value('city'));
    }

    public function test_suspending_a_restaurant_keeps_its_data_and_stops_its_logins(): void
    {
        $this->actingAs($this->operator());

        $this->patchJson("/api/v1/platform/tenants/{$this->tenant->id}", ['status' => 'suspended'])
            ->assertOk();

        $this->assertSame('suspended', $this->tenant->fresh()?->status);

        // `ResolveTenant` resolves active tenants only, so the next request
        // from anybody there is refused while every row stays where it is —
        // and the refusal names the reason rather than looking like a bug.
        $owner = $this->restaurantOwner();
        app(TenantContext::class)->clear();
        $this->actingAs($owner)->getJson('/api/v1/auth/context')->assertApiError('tenant.inactive');
    }

    // ============ The owner's login ============

    public function test_the_overview_carries_the_owner_the_operator_has_to_ring(): void
    {
        $owner = $this->restaurantOwner();
        $this->actingAs($this->operator());

        /*
         * The address, on the list. Before it was here the card read its owner
         * out of `TENANT_DETAIL` — a console fixture keyed by the demo slugs —
         * so every restaurant actually onboarded here drew an em dash where its
         * contact belonged, and the one field somebody is asked for on a call
         * ("what address do they sign in with?") was on no screen at all.
         */
        $this->getJson('/api/v1/platform/overview')
            ->assertOk()
            ->assertJsonPath('data.list.0.owner.email', $owner->email)
            ->assertJsonPath('data.list.0.owner.name', $owner->name);
    }

    public function test_the_overview_carries_what_a_trial_is_counted_down_by(): void
    {
        $this->tenant->forceFill(['trial_ends_at' => now()->addDays(9)])->save();
        $this->actingAs($this->operator());

        /*
         * The trials screen used to be a fixture end to end — six hardcoded
         * entries with an invented `likelihood` percentage, drawn beside real
         * restaurant names. These three are what it reads now, and every one is
         * a fact this application holds: when the trial runs out, when the
         * restaurant was created, and how many tills anybody has paired to it.
         */
        $row = $this->getJson('/api/v1/platform/overview')->assertOk()->json('data.list.0');

        $this->assertNotNull($row['trial_ends_at']);
        $this->assertSame(now()->toDateString(), $row['since']);
        $this->assertIsInt($row['terminals']);
    }

    public function test_the_card_sends_real_venues_and_real_people(): void
    {
        $branch = Branch::query()->create([
            'tenant_id' => $this->tenant->id, 'name' => 'Chilonzor', 'slug' => 'chilonzor',
            'timezone' => 'Asia/Tashkent', 'status' => 'active',
            'settings' => ['seats' => 96],
        ]);

        $owner = $this->restaurantOwner();
        $owner->forceFill(['branch_id' => $branch->id])->save();

        $this->actingAs($this->operator());

        $detail = $this->getJson("/api/v1/platform/tenants/{$this->tenant->id}")
            ->assertOk()
            ->json('data');

        /*
         * The venue, with the two figures the platform actually knows: the
         * seats in its own settings document and the logins assigned to it.
         *
         * Its TAKINGS are deliberately absent. That is the restaurant's money,
         * it has no bearing on what they are charged, and the console drew a
         * revenue column here filled from a fixture keyed by the demo slugs —
         * so every real restaurant got somebody else's numbers beside its
         * venues.
         */
        $this->assertSame('Chilonzor', $detail['branches'][0]['name']);
        $this->assertSame(96, $detail['branches'][0]['seats']);
        $this->assertSame(1, $detail['branches'][0]['accounts']);
        $this->assertArrayNotHasKey('revenue', $detail['branches'][0]);

        // And the people, who are the people. The card generated this list from
        // a pool of invented names, each given a relative time off a rotating
        // list of phrases, on the screen an operator answers questions from.
        $person = collect($detail['users'])->firstWhere('id', $owner->id);

        $this->assertNotNull($person);
        $this->assertSame($owner->name, $person['name']);
        $this->assertSame('owner', $person['role']);
        $this->assertTrue($person['is_active']);
        // Never signed in is a fact, and the console prints it as one rather
        // than filling in "14 daqiqa oldin".
        $this->assertNull($person['last_login_at']);
    }

    public function test_the_operator_issues_the_owner_a_new_password(): void
    {
        $owner = $this->restaurantOwner();
        $before = (string) $owner->password;

        // A session opened with the old password, which must not survive it.
        $owner->createToken('console');
        $this->assertSame(1, $owner->tokens()->count());

        $this->actingAs($this->operator());

        $response = $this->postJson("/api/v1/platform/tenants/{$this->tenant->id}/owner-password")
            ->assertOk()
            ->assertJsonPath('owner.email', $owner->email);

        $issued = (string) $response->json('owner.password');

        // Generated, because this call sent no password. Typing one is allowed
        // now — see the three tests below — but an empty request still means
        // "make me one", which is the default the console offers first.
        $this->assertNotSame('', $issued);

        $after = $owner->fresh();
        $this->assertNotNull($after);
        $this->assertNotSame($before, (string) $after->password, 'the password did not move');
        $this->assertTrue(
            Hash::check($issued, (string) $after->password),
            'the password in the answer is not the one that was stored',
        );

        // A credential reset that leaves the old sessions alive is not a reset.
        $this->assertSame(0, $after->tokens()->count());

        $this->assertTrue(
            Activity::query()->where('description', 'platform.owner.password_reset')->exists(),
            'issuing somebody a password without an audit row is not traceable',
        );
    }

    public function test_the_new_password_is_the_one_that_signs_the_owner_in(): void
    {
        $owner = $this->restaurantOwner();
        $this->actingAs($this->operator());

        $issued = (string) $this->postJson("/api/v1/platform/tenants/{$this->tenant->id}/owner-password")
            ->assertOk()
            ->json('owner.password');

        // The whole point, asserted at the door rather than against the hash:
        // this string is read out to a restaurant owner on the phone, and what
        // matters is that it opens the login and not that it round-trips.
        $this->postJson('/api/v1/auth/login', [
            'email' => $owner->email,
            'password' => $issued,
        ])->assertOk();
    }

    public function test_the_operator_may_choose_the_password_and_it_signs_the_owner_in(): void
    {
        /*
         * The call this exists for: a restaurant rings and dictates the password
         * it wants to use, or asks for one it can remember. It used to be
         * refused on the argument that an operator who can choose will reuse one
         * weak string everywhere — right about the risk, wrong about the remedy,
         * because the alternative was reading sixteen random characters down a
         * phone line.
         */
        $owner = $this->restaurantOwner();
        $this->actingAs($this->operator());

        $chosen = 'Osh7Xona7Termiz';

        $this->postJson(
            "/api/v1/platform/tenants/{$this->tenant->id}/owner-password",
            ['password' => $chosen],
        )
            ->assertOk()
            // Answered back rather than swallowed: the console prints what it is
            // told, and an API that quietly generated a different one would have
            // the operator reading out a password that does not work.
            ->assertJsonPath('owner.password', $chosen);

        // Asserted at the door rather than against the hash, for the same reason
        // the generated case is: what matters is that it opens the login.
        $this->postJson('/api/v1/auth/login', [
            'email' => $owner->email,
            'password' => $chosen,
        ])->assertOk();
    }

    public function test_the_operator_can_read_back_the_password_the_platform_issued(): void
    {
        /*
         * The call this whole column exists for: a restaurant rings and asks
         * what their password is. Before it there was no answer — `password` is
         * a bcrypt hash — so the only move was to replace it, which works and is
         * the wrong answer for an owner still using the old one elsewhere.
         */
        $this->restaurantOwner();
        $this->actingAs($this->operator());

        $chosen = 'Osh7Xona7Termiz';

        $this->postJson(
            "/api/v1/platform/tenants/{$this->tenant->id}/owner-password",
            ['password' => $chosen],
        )->assertOk();

        $this->getJson("/api/v1/platform/tenants/{$this->tenant->id}/owner-password")
            ->assertOk()
            ->assertJsonPath('owner.password', $chosen)
            // The age is what an operator judges by before reading it out.
            ->assertJsonStructure(['owner' => ['password', 'issued_at']]);

        $this->assertTrue(
            Activity::query()->where('description', 'platform.owner.password_read')->exists(),
            'reading somebody\'s password without an audit row is not traceable',
        );
    }

    public function test_the_stored_copy_never_reaches_anybody_but_that_endpoint(): void
    {
        /*
         * The column is a readable credential, so the danger is not the endpoint
         * that means to return it — it is every other serialisation quietly
         * carrying it along. `#[Hidden]` on the model is what stops that, and
         * this asserts it on the two responses that describe an owner.
         */
        $owner = $this->restaurantOwner();
        $this->actingAs($this->operator());

        $this->postJson("/api/v1/platform/tenants/{$this->tenant->id}/owner-password")->assertOk();

        $this->getJson('/api/v1/platform/tenants')
            ->assertOk()
            ->assertDontSee('issued_password');

        $this->patchJson(
            "/api/v1/platform/tenants/{$this->tenant->id}/owner",
            ['phone' => '+998901112233'],
        )
            ->assertOk()
            ->assertDontSee('issued_password');

        // And the owner's own `me` — the account cannot read its own stored copy
        // either, which is the request an attacker with a session would make.
        $this->actingAs($owner)
            ->getJson('/api/v1/auth/me')
            ->assertDontSee('issued_password');
    }

    public function test_an_owner_changing_their_own_password_clears_the_stored_copy(): void
    {
        /*
         * The guard that makes the column defensible. Without it the console
         * goes on showing the password it issued in March, an operator reads it
         * down the phone, it does not work — and now nobody trusts the screen,
         * including for the restaurant where it *was* right.
         *
         * A stale credential presented as current is worse than none.
         */
        $owner = $this->restaurantOwner();
        $this->actingAs($this->operator());

        $this->postJson("/api/v1/platform/tenants/{$this->tenant->id}/owner-password")->assertOk();

        $issued = $owner->fresh();
        $this->assertNotNull($issued);
        $this->assertNotNull($issued->issued_password, 'the platform did not store what it issued');

        // The owner changes it themselves — any route that is not this
        // controller, which is what `User::booted()` watches for.
        $issued->forceFill(['password' => 'BoshqaParol2026'])->save();

        $after = $owner->fresh();
        $this->assertNotNull($after);
        $this->assertNull($after->issued_password, 'a password nobody issued was left readable');
        $this->assertNull($after->issued_password_at);

        // And the endpoint says so rather than showing the old one.
        $this->actingAs($this->operator())
            ->getJson("/api/v1/platform/tenants/{$this->tenant->id}/owner-password")
            ->assertOk()
            ->assertJsonPath('owner.password', null);
    }

    public function test_a_restaurant_owner_cannot_read_their_own_stored_password(): void
    {
        // The wall is the same one the rest of /platform sits behind, asserted
        // here because this endpoint returns a credential in plain text.
        $owner = $this->restaurantOwner();

        $this->actingAs($owner)
            ->getJson("/api/v1/platform/tenants/{$this->tenant->id}/owner-password")
            ->assertStatus(403);
    }

    /**
     * @return list<array{0: string}>
     */
    public static function weakPasswords(): array
    {
        return [
            'too short' => ['Short1'],
            'letters only' => ['oshxonatermiz'],
            'digits only' => ['908070605040'],
        ];
    }

    #[DataProvider('weakPasswords')]
    public function test_a_weak_password_is_refused_rather_than_stored(string $weak): void
    {
        /*
         * The strength rule is what replaced the old blanket refusal, so it is
         * the thing carrying the risk now. Twelve characters with letters *and*
         * digits: not the restaurant's name, not a phone number, not `12345678`.
         *
         * `uncompromised()` is deliberately not among the rules — it calls
         * haveibeenpwned over the network, and a credential screen that hangs
         * when an outside service is down is worse than the leak it screens for.
         */
        $owner = $this->restaurantOwner();
        $before = (string) $owner->password;

        $this->actingAs($this->operator());

        $this->postJson(
            "/api/v1/platform/tenants/{$this->tenant->id}/owner-password",
            ['password' => $weak],
        )->assertStatus(422);

        $after = $owner->fresh();
        $this->assertNotNull($after);

        // The half that matters: a refused password must not have been written
        // on the way to being refused.
        $this->assertSame($before, (string) $after->password);
    }

    public function test_the_operator_may_correct_the_address_the_owner_signs_in_with(): void
    {
        /*
         * A restaurant is onboarded from what was heard on a phone call, and a
         * wrong character in the email is a business that cannot sign in at all:
         * `/forgot-password` needs a mailer and this deployment runs
         * `MAIL_MAILER=log`. Before this existed the only repair was to onboard
         * the restaurant a second time.
         */
        $owner = $this->restaurantOwner();
        $session = $owner->createToken('console');
        $this->assertSame(1, $owner->tokens()->count());

        $this->actingAs($this->operator());

        $this->patchJson(
            "/api/v1/platform/tenants/{$this->tenant->id}/owner",
            ['email' => 'egasi@oshxona.uz'],
        )
            ->assertOk()
            ->assertJsonPath('owner.email', 'egasi@oshxona.uz');

        $after = $owner->fresh();
        $this->assertNotNull($after);
        $this->assertSame('egasi@oshxona.uz', $after->email);

        /*
         * And the session survives, which is the whole reason this is not the
         * password endpoint. An operator fixing a typo must not sign the owner
         * out of the till they are standing at.
         */
        $this->assertSame(1, $after->tokens()->count());
        $this->assertNotNull($session);

        $this->assertTrue(
            Activity::query()->where('description', 'platform.owner.updated')->exists(),
            'changing the address somebody signs in with has to leave a trace',
        );

        // The new address is the one that opens the login, and it is asserted
        // rather than assumed: an update that changes a column the guard does
        // not read would pass every check above and lock the owner out.
        $this->postJson('/api/v1/auth/login', [
            'email' => 'egasi@oshxona.uz',
            'password' => 'password',
        ])->assertOk();
    }

    public function test_an_address_already_on_the_platform_is_refused(): void
    {
        /*
         * The column's own constraint is `unique(tenant_id, email)`, which
         * permits the same address in two businesses — and `AuthController::login`
         * has already had to be taught to weigh a password against every
         * candidate because this deployment has exactly that pair. Letting an
         * operator create a second one on purpose would make that worse.
         */
        $owner = $this->restaurantOwner();
        $taken = $this->operator();

        $this->actingAs($taken);

        $this->patchJson(
            "/api/v1/platform/tenants/{$this->tenant->id}/owner",
            ['email' => $taken->email],
        )->assertStatus(422);

        $after = $owner->fresh();
        $this->assertNotNull($after);
        $this->assertSame($owner->email, $after->email);
    }

    public function test_keeping_the_same_address_is_not_a_collision_with_itself(): void
    {
        // `unique` has to step over the row being edited, or correcting a phone
        // number while the address is unchanged refuses itself.
        $owner = $this->restaurantOwner();
        $this->actingAs($this->operator());

        $this->patchJson(
            "/api/v1/platform/tenants/{$this->tenant->id}/owner",
            ['email' => $owner->email, 'phone' => '+998901112233'],
        )
            ->assertOk()
            ->assertJsonPath('owner.phone', '+998901112233');
    }

    public function test_a_restaurant_owner_cannot_edit_their_own_platform_record(): void
    {
        $owner = $this->restaurantOwner();
        $this->actingAs($owner);

        $this->patchJson(
            "/api/v1/platform/tenants/{$this->tenant->id}/owner",
            ['email' => 'yangi@oshxona.uz'],
        )->assertStatus(403);

        $after = $owner->fresh();
        $this->assertNotNull($after);
        $this->assertSame($owner->email, $after->email);
    }

    public function test_a_restaurant_owner_cannot_reissue_anybody_a_password(): void
    {
        $this->actingAs($this->restaurantOwner());

        $this->postJson("/api/v1/platform/tenants/{$this->tenant->id}/owner-password")
            ->assertStatus(403);
    }

    public function test_a_restaurant_with_no_owner_account_says_so(): void
    {
        // A real state — a business archived before anybody signed in — and the
        // refusal names it rather than 500ing on a null.
        $this->actingAs($this->operator());

        $this->postJson("/api/v1/platform/tenants/{$this->tenant->id}/owner-password")
            ->assertStatus(422);
    }

    // ============ Impersonation ============

    public function test_impersonation_without_a_reason_is_refused(): void
    {
        $this->restaurantOwner();
        $this->actingAs($this->operator());

        $this->postJson("/api/v1/platform/tenants/{$this->tenant->id}/impersonate", ['reason' => ''])
            ->assertStatus(422);

        // No reason, no row, no token. The three go together on purpose.
        $this->assertSame(0, Impersonation::query()->count());
    }

    public function test_impersonation_writes_the_row_before_it_mints_the_token(): void
    {
        $owner = $this->restaurantOwner();
        $operator = $this->operator();
        $this->actingAs($operator);

        $response = $this->postJson("/api/v1/platform/tenants/{$this->tenant->id}/impersonate", [
            'reason' => 'Egasi Z-hisobot noto\'g\'ri deb yozdi, tekshiryapman',
        ])->assertCreated();

        $this->assertNotNull($response->json('impersonation.token'));
        $this->assertSame($owner->id, $response->json('impersonation.as.id'));
        // The console draws this across the top of every screen for the whole
        // fifteen minutes; the server sends it so a client cannot forget it.
        $this->assertStringContainsString('Choyxona 24', (string) $response->json('impersonation.banner'));

        $record = Impersonation::query()->firstOrFail();
        $this->assertSame($operator->id, (int) $record->operator_user_id);
        $this->assertSame($owner->id, (int) $record->target_user_id);
        $this->assertNotNull($record->token_id);
        // Half the platform's own thirty minutes, because it is somebody else's
        // data.
        $this->assertSame(15, Impersonation::MINUTES);

        $this->assertTrue(
            Activity::query()->where('description', 'platform.impersonated')->exists(),
            'An impersonation that leaves no audit row is worse than none',
        );
    }

    public function test_a_restaurant_owner_cannot_impersonate_anybody(): void
    {
        $this->actingAs($this->restaurantOwner());

        $this->postJson("/api/v1/platform/tenants/{$this->tenant->id}/impersonate", [
            'reason' => 'Men egaman, hammasini ko\'rishim kerak',
        ])->assertStatus(403);
    }

    public function test_the_sign_in_log_marks_impersonation_separately(): void
    {
        $this->restaurantOwner();
        $this->actingAs($this->operator());

        $this->postJson("/api/v1/platform/tenants/{$this->tenant->id}/impersonate", [
            'reason' => 'Kassadagi farqni tekshirish uchun kirdim',
        ])->assertCreated();

        $this->getJson('/api/v1/platform/sign-ins')
            ->assertOk()
            ->assertJsonPath('data.0.impersonation', true)
            ->assertJsonPath('data.0.tenant', 'Choyxona 24');
    }

    // ============ Billing ============

    public function test_an_invoice_is_raised_once_a_month_and_marked_paid_by_a_person(): void
    {
        Branch::query()->create([
            'tenant_id' => $this->tenant->id, 'name' => 'Chilonzor', 'slug' => 'chilonzor',
            'timezone' => 'Asia/Tashkent', 'status' => 'active',
        ]);

        $this->actingAs($this->operator());

        // The seeder already raised this month's. Asking again is not an error
        // — it is the answer to "has this month been billed".
        $again = $this->postJson("/api/v1/platform/tenants/{$this->tenant->id}/invoices")->assertOk();
        $this->assertFalse($again->json('created'));
        $this->assertSame(1, PlatformInvoice::query()->where('tenant_id', $this->tenant->id)->count());

        $invoice = PlatformInvoice::query()->firstOrFail();
        $invoice->forceFill(['status' => 'due', 'paid_at' => null])->save();

        $this->postJson("/api/v1/platform/billing/{$invoice->id}/mark-paid")
            ->assertOk()
            ->assertJsonPath('data.status', 'paid');

        $this->assertNotNull($invoice->fresh()?->paid_at);
    }

    public function test_three_failed_attempts_move_an_invoice_to_overdue(): void
    {
        $this->actingAs($this->operator());

        $invoice = PlatformInvoice::query()->firstOrFail();
        $invoice->forceFill(['status' => 'due'])->save();

        for ($try = 0; $try < 3; $try++) {
            $this->postJson("/api/v1/platform/billing/{$invoice->id}/retry")->assertOk();
        }

        // A first failure is usually a bank; a fourth is a customer who left.
        $this->assertSame('overdue', $invoice->fresh()?->status);
    }

    // ============ Plans ============

    public function test_the_price_list_is_the_one_the_marketing_site_prints(): void
    {
        $this->actingAs($this->operator());

        $this->getJson('/api/v1/platform/plans')
            ->assertOk()
            // `pages-data.ts` holds the same two figures. They are asserted
            // here because a `/pricing` page once showed a tariff a hundred
            // times too cheap and no test noticed.
            ->assertJsonPath('data.0.price_tiyin', 240_000_000)
            ->assertJsonPath('data.1.price_tiyin', 690_000_000)
            // `null` and not zero: enterprise has no ceiling, and the console
            // branches on `=== null` to print the word for it.
            ->assertJsonPath('data.2.branches', null);
    }

    public function test_an_operator_changes_a_price(): void
    {
        $this->actingAs($this->operator());

        $this->patchJson('/api/v1/platform/plans/start', ['price_tiyin' => 250_000_000])
            ->assertOk()
            ->assertJsonPath('data.0.price_tiyin', 250_000_000);

        $this->assertSame(250_000_000, (int) PlatformPlan::query()->where('key', 'start')->value('price_tiyin'));
    }

    // ============ The four switches ============

    public function test_closing_sign_ups_refuses_a_new_restaurant(): void
    {
        $this->actingAs($this->operator());

        $this->patchJson('/api/v1/platform/settings', ['signups' => false])
            ->assertOk()
            ->assertJsonPath('data.0.value', false);

        $this->postJson('/api/v1/platform/tenants', [
            'restaurant' => 'Yopiq', 'name' => 'Kimdir', 'email' => 'kimdir@yopiq.uz',
        ])->assertStatus(422);
    }

    public function test_switching_impersonation_off_shuts_the_door(): void
    {
        $this->restaurantOwner();
        $this->actingAs($this->operator());

        $this->patchJson('/api/v1/platform/settings', ['impersonation' => false])->assertOk();

        // The answer for a deployment whose customers have not agreed to it.
        $this->postJson("/api/v1/platform/tenants/{$this->tenant->id}/impersonate", [
            'reason' => 'Sabab bor, lekin platforma buni taqiqlagan',
        ])->assertStatus(403);
    }

    // ============ Team ============

    public function test_a_new_operator_belongs_to_no_restaurant(): void
    {
        $this->actingAs($this->operator());

        $this->postJson('/api/v1/platform/team', [
            'name' => 'Nodira Ochilova',
            'email' => 'nodira@smartrest.uz',
        ])->assertCreated();

        $invited = User::query()->where('email', 'nodira@smartrest.uz')->firstOrFail();

        $this->assertNull($invited->tenant_id);
        $this->assertTrue($invited->hasRole('super-admin'));
        // No TOTP yet, so `admin/login` refuses them until somebody enrols one.
        // A door openable with a password alone is not the platform door.
        $this->assertNull($invited->two_factor_confirmed_at);
    }
}
