<?php

declare(strict_types=1);

namespace Modules\Crm\Tests\Feature;

use App\Models\StoredDomainEvent;
use App\Models\Tenant;
use App\Models\User;
use App\Support\Tenancy\TenantContext;
use Database\Seeders\RolesAndPermissionsSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Testing\TestResponse;
use Modules\Crm\Models\Lead;
use Tests\TestCase;

/**
 * The contact form on the marketing site, and what a console does with it.
 *
 * CLAUDE.md makes this the top of the only sales funnel there is — "restoran
 * `#contact` orqali keladi, tenant'ni operator ochadi" — and until now it
 * flashed a thank-you and forgot everything typed into it.
 */
final class LeadTest extends TestCase
{
    use RefreshDatabase;

    private Tenant $tenant;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(RolesAndPermissionsSeeder::class);

        $this->tenant = $this->restaurant('osh-xona');
        app(TenantContext::class)->set($this->tenant);
    }

    private function restaurant(string $slug): Tenant
    {
        return Tenant::query()->create([
            'name' => ucfirst($slug), 'slug' => $slug, 'country_code' => 'UZ',
            'locale' => 'uz', 'timezone' => 'Asia/Tashkent', 'status' => 'active',
        ]);
    }

    /** @param array<string, mixed> $body */
    private function enquire(array $body = []): TestResponse
    {
        return $this->withHeaders(['X-Tenant' => $this->tenant->slug, 'Accept' => 'application/json'])
            ->postJson('/api/v1/public/leads', [
                'name' => 'Aziz Karimov',
                'phone' => '+998 90 111 22 33',
                'restaurant' => 'Osh Markazi',
                'message' => 'Uch filial uchun narxni bilmoqchiman.',
                ...$body,
            ]);
    }

    public function test_a_stranger_can_ask_to_join(): void
    {
        $this->enquire()
            ->assertCreated()
            ->assertJsonPath('data.status', 'new')
            ->assertJsonPath('data.received', true)
            ->assertJsonPath('data.duplicate', false);

        $lead = Lead::query()->firstOrFail();
        $this->assertSame('Osh Markazi', $lead->restaurant);
        // Normalised, so the duplicate check below can see it.
        $this->assertSame('+998901112233', $lead->phone);
        $this->assertSame('site', $lead->source);
    }

    public function test_the_form_cannot_mark_itself_dealt_with(): void
    {
        $this->enquire(['status' => 'won', 'assigned_to_user_id' => 1, 'source' => 'referral'])
            ->assertCreated();

        $lead = Lead::query()->firstOrFail();
        $this->assertSame('new', $lead->status);
        $this->assertNull($lead->assigned_to_user_id);
        $this->assertSame('site', $lead->source);
    }

    public function test_a_second_tap_returns_the_first_enquiry(): void
    {
        $first = $this->enquire()->assertCreated()->json('data.id');

        $this->enquire(['message' => 'Yana bir marta'])
            ->assertOk()
            ->assertJsonPath('data.id', $first)
            ->assertJsonPath('data.duplicate', true);

        $this->assertSame(1, Lead::query()->count());
    }

    public function test_the_duplicate_window_is_a_day_and_not_forever(): void
    {
        $this->enquire()->assertCreated();

        $this->travel(1)->day();

        // Somebody ringing back tomorrow is a new enquiry, not a duplicate.
        $this->enquire()->assertCreated()->assertJsonPath('data.duplicate', false);
        $this->assertSame(2, Lead::query()->count());
    }

    public function test_a_lead_is_published_for_whoever_rings_back(): void
    {
        $this->enquire()->assertCreated();

        /*
         * On the bus rather than as a notification: an operator's screen, a
         * Telegram message and an email all eventually want this, and wiring
         * the form to any one of them makes the form know about it.
         */
        $stored = StoredDomainEvent::query()->where('name', 'crm.lead_captured')->firstOrFail();

        $this->assertSame('Aziz Karimov', $stored->payload['name']);
        $this->assertSame('Osh Markazi', $stored->payload['restaurant']);
        // The enquiry text is not in the payload: it is free-form input from a
        // stranger and would travel into every subscriber's log.
        $this->assertArrayNotHasKey('message', $stored->payload);
    }

    public function test_a_name_and_a_number_are_the_only_required_fields(): void
    {
        // Every field added to a form on the open internet is a field somebody
        // abandons it at.
        $this->enquire(['restaurant' => null, 'message' => null])->assertCreated();

        $this->withHeaders(['X-Tenant' => $this->tenant->slug, 'Accept' => 'application/json'])
            ->postJson('/api/v1/public/leads', ['name' => 'Aziz'])
            ->assertStatus(422);
    }

    public function test_a_foreign_number_is_accepted(): void
    {
        // A chain calling from Almaty is a customer, not a validation failure.
        $this->enquire(['phone' => '+7 727 123 45 67'])->assertCreated();
    }

    // ============ The console side ============

    public function test_an_operator_reads_and_moves_a_lead_and_a_cook_cannot(): void
    {
        $id = $this->enquire()->assertCreated()->json('data.id');

        $manager = User::factory()->create(['tenant_id' => $this->tenant->id]);
        $manager->assignRole('branch-manager');
        $this->actingAs($manager);

        $this->getJson('/api/v1/crm/leads?filter[open]=1')
            ->assertOk()
            ->assertJsonPath('data.0.restaurant', 'Osh Markazi');

        $this->patchJson("/api/v1/crm/leads/{$id}", ['status' => 'contacted', 'note' => 'Ertaga qo\'ng\'iroq'])
            ->assertOk()
            ->assertJsonPath('data.status', 'contacted');

        // The timestamp behind "we ring back within a day", stamped once.
        $this->assertNotNull(Lead::query()->findOrFail($id)->contacted_at);

        /*
         * A cook, not a waiter. A waiter holds `crm.view` — they look a regular
         * up at the table — and this list rides on the same permission rather
         * than inventing a twelfth one for a screen a waiter will never open.
         * The boundary that matters is the kitchen, which holds no CRM
         * permission at all.
         */
        $cook = User::factory()->create(['tenant_id' => $this->tenant->id]);
        $cook->assignRole('cook');
        $this->actingAs($cook);

        $this->getJson('/api/v1/crm/leads')->assertStatus(403);
        $this->patchJson("/api/v1/crm/leads/{$id}", ['status' => 'won'])->assertStatus(403);
    }

    public function test_the_first_contact_time_is_not_rewritten(): void
    {
        $id = $this->enquire()->assertCreated()->json('data.id');

        $manager = User::factory()->create(['tenant_id' => $this->tenant->id]);
        $manager->assignRole('branch-manager');
        $this->actingAs($manager);

        $this->patchJson("/api/v1/crm/leads/{$id}", ['status' => 'contacted'])->assertOk();
        $first = Lead::query()->findOrFail($id)->contacted_at;

        $this->travel(2)->hours();
        $this->patchJson("/api/v1/crm/leads/{$id}", ['status' => 'qualified'])->assertOk();

        // A lead that went contacted → qualified was not contacted twice.
        $this->assertTrue($first->equalTo(Lead::query()->findOrFail($id)->contacted_at));
    }

    public function test_one_restaurants_enquiries_are_not_anothers(): void
    {
        $other = $this->restaurant('lagmon-uyi');
        $this->enquire()->assertCreated();

        app(TenantContext::class)->set($other);
        $this->assertSame(0, Lead::query()->count());
    }
}
